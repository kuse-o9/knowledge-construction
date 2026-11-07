# 無料URLの移行準備

利用者が選択した名前：`study-note`（2026-11-07）。
現在：`https://kuse-o9.github.io/knowledge-construction/`
移行先候補：`https://kuse-o9.github.io/study-note/`

**まだ切り替えていない。** GitHub連携の利用可能な操作にリポジトリ名変更・作成・Pages設定がないため、GitHub設定画面への本人ログインが必要。SupabaseのAuthのSite URL／Redirect URLsも設定画面で確認・更新する。別ドメインの購入・有料ホスティングは使用しない。

## 先に済ませたコードの準備

- ゲームの部屋のbaseを固定の旧URLから相対解決へ変更。
- 山手線・ゆりかもめの戻るリンク、会社別フロア案内の基点を相対URLへ変更。
- PWAのmanifest／service worker、アカウント画面のメール戻り先は既存の相対URL解決を維持。
- 名前変更だけで完了とは扱わない。GitHub公式はPagesサイトの旧URLを自動転送の対象外と説明している。

## 切替の順番

1. 本人ログインでGitHubの管理権限と`study-note`の利用可否を確認。
2. Supabaseの現在のメール戻り先を控え、移行先の`account.html`をRedirect URLsに追加。既存URLは移行期間中も保持。Site URLの切替は公開に合わせる。
3. リポジトリを`study-note`へ変更し、Pagesの公開成功、全入口・認証戻り先を確認。
4. 旧名`knowledge-construction`の転送専用リポジトリを作成し、旧ページのパス・検索・hashを同一ホストの新パスへ渡すindex／404を公開。元アプリへ転送用ファイルを先に上書きしない。
5. 旧インストール版のmanifest更新を確認。単に新しいURLへ移すだけでは、インストール版の起動先と適用範囲の更新まで保証できない。必要なら新URLから再インストールを案内する。ブラウザーデータは消さない。
6. Gitのremote・手順書・予定表の参照先を更新。新旧URL・ゲーム戻り先・既存保存データ・メール認証・公開設定を確認して移行完了とする。

公式資料：
https://docs.github.com/en/repositories/creating-and-managing-repositories/renaming-a-repository

新旧のホスト名は同じであるが、保存・ログイン・インストールの継続は実際の移行で検査する。未検証のまま保証しない。
