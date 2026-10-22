# PHP2Shell確認（2026-10-22）

対象: GitHub Pages の静的HTML/JavaScript、およびSupabaseのstudy-api（Deno/TypeScript）。リポジトリにPHP、Composer、PHPコンテナ設定はない。稼働中study-apiもTypeScriptであることをダッシュボードのCodeとダウンロードで確認。したがって、このアプリの管理下コードにはPHP本体を更新する箇所は見つからない。GitHub/Supabaseの管理基盤全体の内部構成を監査したという意味ではない。

PHP公式はCVE-2026-109618/109619に対してPHP 8.2.35、8.3.36、8.4.27、8.5.12への更新を要求し、完全な緩和策はなく更新が唯一の安全な選択と説明している。PHPを今後導入する場合は、修正版以降または配布元が修正を明示したパッケージを使い、全ワーカーを再起動して実行バージョンを確認する。JavaScriptのメンテナンス表示やWAFだけをPHP修正の代わりにしない。

出典:
- https://www.php.net/archive/2026.php
- https://github.com/php/php-src/security/advisories/GHSA-w8hw-w9fx-j79w
- https://github.com/php/php-src/security/advisories/GHSA-6wmf-4rv5-p3rp

今回の認証はユーザーの訂正によりメールOTPではなく、ログインした本人のメールアドレス・サーバー管理の管理者資格・パスワード再照合を行う。多要素認証(AAL2)を提供するという表示はしない。
