# セキュリティ対応予定

## 追加：PHP2Shell（CVE-2026-109618 / CVE-2026-109619）

2026-10-22確認。PHP公式は2026-10-21、認証なしの遠隔コード実行につながる2件の問題と修正版を公表した。

- 今回の構成点検：リポジトリ内に `.php`、Composer設定、PHP用コンテナー設定は見つからない。公開フロントはGitHub Pagesの静的HTML/JavaScript。保存資料で確認できる独自APIはSupabase Edge FunctionのTypeScript。管理サービス内部の実行環境全体を検査したという意味ではない。
- 予定に追加：外部サービス・今後追加するサーバーも含め、PHP利用箇所を点検する。利用があれば、使用系列の修正版 **8.2.35 / 8.3.36 / 8.4.27 / 8.5.12** またはそれ以降の修正版・提供元の修正済みパッケージへ更新する。サポート終了系列は対応中の系列へ移行する。
- 更新後は全PHPワーカーを再起動し、実際に稼働するバージョンと提供元の修正状況を確認する。更新できない場合は影響する公開処理を停止して対応する。WAFや入力制限だけで対策完了にしない。
- このリポジトリにPHPがないため、架空のPHP設定変更や「全基盤の安全確認完了」とは記録しない。

一次資料：
- https://www.php.net/archive/2026.php
- https://github.com/php/php-src/security/advisories/GHSA-w8hw-w9fx-j79w
- https://github.com/php/php-src/security/advisories/GHSA-6wmf-4rv5-p3rp
