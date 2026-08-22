# FarmPro 本番公開前の安全設定

本番環境では、次の設定を現在の運用に合わせて確認します。

## 必須の基本環境変数

- `NODE_ENV=production`
- `FARMPRO_AUTH_SECRET`：十分に長いランダム文字列
- `FARMPRO_DATA_DIR`：永続ディスク上のデータ保存先
- `FARMPRO_ALLOWED_ORIGIN`：公開するFarmPro画面のHTTPS URL
- `PORT`：Renderなど公開サービス側から指定される場合は、その値を使用

## メール送信

- `RESEND_API_KEY`
- `FARMPRO_EMAIL_FROM`
- 登録確認コード・メール変更・パスワード再設定メールが送信できることを確認する

## Stripe

- `STRIPE_WEBHOOK_SECRET`：本番Webhook用
- `STRIPE_WEBHOOK_TEST_SECRET`：サンドボックスWebhookを併用する場合のみ
- 本番価格は月額のみ
  - Standard：2,750円（税込）/ 月
  - Pro：5,500円（税込）/ 月
- Stripeの有効な契約記録とFarmProのプラン表示が一致することを確認する

## 運営者管理

- `FARMPRO_OPERATOR_EMAILS`：運営者として許可するメールアドレス
- 一般利用者には「その他の管理 > 運営者」が表示されないことを確認する
- 運営者だけが「利用者管理」「銀行振込申込管理」を開けることを確認する

## 銀行振込

- `FARMPRO_BANK_TRANSFER_NOTIFICATION_EMAIL`：銀行振込申込の運営者通知先
- `FARMPRO_BANK_NAME`
- `FARMPRO_BANK_BRANCH`
- `FARMPRO_BANK_ACCOUNT_TYPE`
- `FARMPRO_BANK_ACCOUNT_NUMBER`
- `FARMPRO_BANK_ACCOUNT_HOLDER`
- `FARMPRO_BANK_TRANSFER_DUE_DAYS`

確認事項：

- 利用者へ振込先・金額・支払期限・受付番号がメール送信されること
- 運営者へ申込内容・支払期限が通知されること
- 入金確認前は有料プランを有効化しないこと
- 入金確認後に正しいプランへ有効化できること
- 銀行振込契約終了後にFreeへ戻せること
- 支払期限を過ぎた未入金申込は自動で「期限切れ / 自動取消済み」になること
- 期限切れ申込は有効化できないこと

## 安全ガード

- 本番で `FARMPRO_AUTH_SECRET` がない場合、サーバーは起動しない
- 本番で `FARMPRO_DATA_DIR` がない場合、サーバーは起動しない
- 本番で `FARMPRO_ALLOWED_ORIGIN` がない場合、サーバーは起動しない
- 本番で利用者ファイルが空の場合、既知のデモアカウントを自動作成しない
- 許可した画面URL以外からのAPIアクセスはCORSで拒否する
- 運営者権限はサーバー側で判定し、フロント側へ運営者メールアドレスを直書きしない
- 銀行口座情報はGitHubへ直書きせず、Renderの環境変数で管理する

## 公開前の確認

1. `FARMPRO_DATA_DIR` が永続ディスクを指していることを確認する
2. バックアップJSONを手元にも保存する
3. 公開URLから新規登録・ログインできることを確認する
4. 別農場のデータが表示されないことを確認する
5. 再起動後も利用者・牛台帳・販売データ・決済関連データが残ることを確認する
6. Free / Standard / Pro の頭数制限が現在の仕様どおりであることを確認する
   - Free：繁殖雌牛10頭まで
   - Standard：11〜50頭
   - Pro：51頭以上
7. Stripe決済後にFarmProのプランが自動反映されることを確認する
8. 銀行振込申込から入金確認・有効化・契約終了・期限切れ自動取消まで確認する
9. 利用規約・プライバシーポリシー・特定商取引法の表記が現在の料金・月額契約に一致していることを確認する
10. ヘルプが試用版表現ではなく、現在の本番利用案内になっていることを確認する
