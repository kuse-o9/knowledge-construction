# 勉強アプリのメンテナンスと管理者確認

利用者の訂正により、メールOTP・多要素認証は実装しない。既存のメール/パスワードログインを維持し、管理操作前に本人のメールアドレス・管理者資格・パスワードをサーバーで再照合する。確認はSupabaseの認証session_idに結び付けて20分。別のセッションへの転用、一般利用者による発行、期限切れ、権限を外された管理者を拒否する。15分の固定窓ごとに6回まで。パスワードや秘密鍵をDB、ブラウザー保存領域、ログに保存しない。

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
