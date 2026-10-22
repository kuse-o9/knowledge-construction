# 勉強アプリのメンテナンスと管理者確認

専用パスワード追加前の設計：利用者の訂正により、メールOTP・多要素認証は実装しない。既存のメール/パスワードログインを維持し、管理操作前に本人のメールアドレス・管理者資格・パスワードをサーバーで再照合する。確認はSupabaseの認証session_idに結び付けて20分。別のセッションへの転用、一般利用者による発行、期限切れ、権限を外された管理者を拒否する。15分の固定窓ごとに6回まで。パスワードや秘密鍵をDB、ブラウザー保存領域、ログに保存しない。

メンテナンスは初期OFF。オーナーの管理者本人確認後、管理者ページ→メンテナンス設定で開始・終了できる。既存管理者を含む非オーナーと匿名利用者について、study-apiとプロフィールRPC/RLSで拒否。通常画面は15秒ごとの再確認と画面復帰時の確認で閉じる。変更後のAPIリクエストはその都度拒否する。オーナーの再ログイン用アカウント画面だけは残す。ログアウトやJS改変でサーバーの所有者判定は変えられない。

ゲーム本体とgame_savesは変更しない。ゲーム公開管理のような管理操作には管理者再確認が適用される。GitHub Pagesは公開静的ホスティングなので、HTML/JSや端末にすでに保存したノートを秘密にする仕組みではない。配信済みの署名付き画像URLの有効期限もこの変更で取り消せるわけではない。

導入: study-security.sql → 既存study-apiへの追加（既存機能を保持）→ フロントファイル公開。既存study-apiは更新前にダウンロードして保持し、サーバーコードはSupabaseへ配置する。SQLは再実行可能で、既存関数をprivate側に保持して新しい権限チェックで包む。

検査: PGlite上で新SQLを実行・再実行し18項目。既存のアカウント/管理者照合のみfixture。既存APIを含む新createHandlerで12項目（認証サービス通信はmock）。jsdomで7項目（権限画面・オーナーログイン導線・接続失敗時閉鎖・ホーム埋込構文）。物理GPUやメールOTPの検査ではない。

再現例:
```sh
npm install --prefix /tmp/study-security-tests @electric-sql/pglite typescript@5.9.3 jsdom
NODE_PATH=/tmp/study-security-tests/node_modules node development/security/sql.test.cjs
NODE_PATH=/tmp/study-security-tests/node_modules node development/security/ui.test.cjs
# Supabaseから更新後study-apiをダウンロードし、ローカルパスを指定する。
NODE_PATH=/tmp/study-security-tests/node_modules STUDY_EDGE_SOURCE=/path/to/index.ts node development/security/edge.test.cjs
```

PHP本体の監査結果はPHP2SHELL_REVIEW.md。メンテナンス表示をPHPの修正版に置き換えることはできない。


## 管理者専用パスワード（2026-10-22追加）

利用者の追加依頼により、管理者ページではログイン済みアカウントのメール・管理者資格・アカウントパスワードに加え、別の管理者専用パスワードを必須にする。共通の追加の鍵であり、独立した多要素認証ではない。専用の鍵だけ知っている一般利用者は管理者になれない。

オーナーが admin-verify.html のオーナー限定フォームで初回設定・変更する。初期値は未設定。未設定時は本人確認済みと扱わず、一般管理者は入れない。アカウントのパスワードを再照合したオーナーだけが設定できる。オーナーの再設定は専用パスワードを忘れた際の復旧手段でもある。管理者全員が使うため、承認した管理者にだけ別の安全な手段で渡す。

自動生成ボタンは利用者のブラウザー内の crypto.getRandomValues を使用し、24文字を偏りなく生成する。専用パスワードを安全に控えた確認が必要で、ブラウザー保存領域には書かない。サーバーは平文を保存せず、pgcrypto bcrypt（cost 12、ランダムソルト）をprivate RLSテーブルに保存する。ハッシュも公開RPC/JSへ返さない。半角の英数字・記号16〜64文字。新規設定時はアカウントのパスワードと同一の値を拒否。

Edgeの認証後、15分6回の制限内でアカウントパスワードを照合し、service_role専用RPCで専用パスワードを検証する。確認状態はsession_id・actor・パスワードのrevisionに結び付ける。変更時はrevisionが進み、以前の確認状態を即座に無効にする。旧unlock操作も廃止し、専用パスワードなしでは発行しない。変更と検証は同じ行ロックで直列化する。

導入順：既存 study-security.sql → **admin-password.sql** → 新しい study-api → フロント。既存の設定・メンテナンス状態は保持する。パスワードの入力・確定はオーナー自身が行う。

追加の再現検査：
```sh
NODE_PATH=/tmp/study-security-tests/node_modules node development/security/admin-password-sql.test.cjs
NODE_PATH=/tmp/study-security-tests/node_modules node development/security/admin-password-ui.test.cjs
NODE_PATH=/tmp/study-security-tests/node_modules STUDY_EDGE_SOURCE=/path/to/index.ts node development/security/edge.test.cjs
```
SQL 20件（pgcrypto実処理、繰り返し適用を含む）、Edge 18件（外部認証はmock）、専用画面9件、既存アクセス画面7件、計54件。実アカウントのパスワード入力・初回登録は未実施。既存の基礎SQL試験18件は専用パスワード追加前の移行段階の検査として残す。


## メンテナンス予約と事前告知

`maintenance-plan.sql` を既存のadmin-password.sqlの後に適用する。オーナーの管理者本人確認後、メンテナンス設定画面でタイトル・本文・告知開始・メンテナンス開始・終了を日本時間で登録、変更、取消できる。重複時間帯を拒否し、revisionで同時変更を検出する。現在/未来50件まで。予約表はprivate/RLSで直接参照を拒否し、オーナー以外の変更をサーバーで拒否する。

サーバー時刻で `starts_at <= now < ends_at` を判定するため、オーナーのブラウザーや定期実行ジョブに依存しない。開始後のリクエストを拒否し、既に開いた勉強画面は既存15秒ポーリングで切り替える。終了時刻からアクセスを再開。告知は告知開始から予約終了までの間だけ、通常画面へ表示する。日時はUTC保存、日本時間で入力/表示し、利用端末のタイムゾーンには依存させない。

手動メンテナンスONは予約より優先し、予約終了後も継続する。予約だけで切り替える場合は手動OFFにする。ゲーム本体はこの制限に含めない。静的ファイル自体は従来通り公開。今回、具体的な日時指定がないため利用者向けの実予約は作成しない。

検査：PGliteの実SQLで18項目（適用・再適用、時刻境界、告知、取消、権限、競合、重複）、jsdomで6項目（日本時間変換、入力拒否、告知の安全な表示、権限）。
本番SQL適用はSupabaseの再ログイン完了待ち。フロントは新RPCに接続できない場合に予約操作を表示しない。手動メンテナンスと既存認証は維持する。
