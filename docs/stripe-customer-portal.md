# FarmPro カード契約管理の初回設定

利用者は設定の「解約・退会について」→「カード契約の管理・解約」で、本人に紐づくStripe契約管理を開きます。退会の最終確認で契約が理由で止まった場合も同じ入口を表示します。運営者から別利用者のポータルは開きません。

## Renderの環境変数

- `STRIPE_SECRET_KEY`（または`FARMPRO_STRIPE_SECRET_KEY`）: 本番のStripe API秘密鍵。Webhook署名秘密鍵の`whsec_...`とは別です。ブラウザやチャットには入力しません。RenderのEnvironmentに設定してください。
- `FARMPRO_STRIPE_PORTAL_CONFIGURATION_ID`: 専用のポータル設定を使用する場合、その本番`bpc_...` ID。未設定の場合は本番のデフォルト設定を読み取ります。
- 戻り先は既存の`FARMPRO_ALLOWED_ORIGIN`、次に`RENDER_EXTERNAL_URL`の`/settings`です。未設定なら`https://app.farmpro-app.jp/settings`。リクエストから任意のURLは受け付けません。

API鍵にはサブスクリプションの読取り、ポータル設定の読取り、ポータルセッションの作成が必要です。本番サーバーはテスト鍵を受け付けません。

## Stripeの本番カスタマーポータル設定

Stripe Dashboardのカスタマーポータル設定で、次を設定して保存します。既存の他サービスと設定を共用している場合は、FarmPro専用設定を作り、そのIDを上記環境変数へ登録してください。

- サブスクリプションのキャンセル: 有効
- キャンセル時期: 現在の請求期間の終了時（`at_period_end`）
- 請求書の履歴: 有効
- プラン変更、顧客情報変更、支払方法変更: 無効（今回の入口は契約確認と更新停止に限定）

FarmProは設定を読み取って確認し、変更はしません。即時解約の設定、契約の不明な紐づけ、複数利用者で共用する顧客、未取得の続きがある一覧は案内を止めます。メールアドレスでStripe顧客を推測しません。

## 運用確認

まずテスト環境の契約で、対象本人だけが表示されること、解約確定前に終了日を確認できること、期間末解約の予約中は有料プランを使えることを確認します。本番の実契約を試験目的で解約しないでください。

この入口を開く操作はポータルセッションだけを作成し、解約・返金・データ削除は行いません。利用者がStripe側で解約を確定すると、既存Webhookが契約終了イベントを受け取りFreeへ戻します。Webhook処理待ちの場合は契約状態の確認を依頼してください。退会時には既存の契約・未処理請求の検査を再度通過する必要があります。

設定不足時は画面に運営者への連絡を表示します。秘密鍵やポータル設定の本番値はリポジトリへ保存しません。

公式資料: https://docs.stripe.com/customer-management/integrate-customer-portal , https://docs.stripe.com/api/customer_portal/sessions/create , https://docs.stripe.com/billing/subscriptions/cancel
