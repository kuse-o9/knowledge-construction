# 外部認証の設定待ち

2026-11-01。現在のメールアドレス＋パスワードと管理者専用の追加認証は維持する。確認できていない認証機能を有効化して、利用者やオーナーを締め出さない。

## Googleログイン

公開Auth設定の`external.google`はfalseだった。Google側のOAuthクライアント、同意画面、SupabaseのGoogleプロバイダー設定が必要。GoogleのクライアントシークレットをGitHubや画面側に書かない。

Google側の認証コールバックと、アプリへ戻るURLは別：

- GoogleからSupabaseへ戻るコールバック：`https://zlefzpbrbvniijmohpao.supabase.co/auth/v1/callback`
- Supabaseからアプリへ戻るページ：`https://kuse-o9.github.io/knowledge-construction/account.html`

設定後にフロント側のGoogleログイン導線、リダイレクト許可、既存アカウントとの関連付け、確認メール、BAN・削除・メンテナンス・管理者追加認証を検査してから完了とする。プロバイダーが無効のまま壊れたボタンだけを公開しない。

## CAPTCHA

サイトキー・シークレットキー・Supabase側の有効化設定は未確認。公開Auth設定にCAPTCHA欄がないことだけで「無効」と断定しない。提供元でのキー作成と管理側設定が必要。利用するなら追加課金のない設定だけを選び、利用条件への同意や新しい認証情報の設定は本人の確認を通す。

シークレットキーはSupabase Auth側だけに設定し、ブラウザーに出すのは公開用サイトキーだけ。登録・ログイン・パスワード再設定、およびパスワード再確認を使う操作にも`captchaToken`の受け渡しが必要になるため、ウィジェットを置くだけで完了としない。人の確認が必要なCAPTCHAを勝手に解いたことにもしていない。

現在の認証経路と荒らし対策を弱めず、設定がそろってから実装・通し確認を行う。有料の漏えい済みパスワード照合やAIサービスへの変更は行わない。

一次資料：
- https://supabase.com/docs/guides/auth/social-login/auth-google
- https://supabase.com/docs/guides/auth/auth-captcha
