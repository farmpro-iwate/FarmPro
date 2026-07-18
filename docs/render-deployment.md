# FarmPro Render公開手順

## 構成

- clientとserverを1つのRender Web Serviceで公開します。
- Expressがclientのbuild済み画面を配信します。
- APIは同じURLの `/api` で利用します。
- 実データは永続ディスクの `/var/data/farmpro` に保存します。

## Renderでの作成

1. RenderへGitHubアカウントでログインします。
2. New > Blueprintを選びます。
3. `farmpro-iwate/FarmPro` を選びます。
4. ルートの `render.yaml` を読み込ませます。
5. 作成内容を確認して適用します。

## 自動設定される項目

- Node本番環境
- Singaporeリージョン
- client/serverのbuild
- server起動
- `/api/health` のヘルスチェック
- 認証秘密鍵の自動生成
- 1GB永続ディスク
- データ保存先 `/var/data/farmpro`

## 初回公開後

公開直後は利用者データが空です。RenderのShellから試用利用者を作成します。

```bash
cd server
npm run user:create -- --farm-id farm-test --farm-name "知り合い試用農場" --name "試用利用者" --email "trial@example.com" --password "十分に長い初期パスワード"
```

初期パスワードは8文字以上とし、本人へ安全な方法で伝えます。

## 公開前確認

- 公開URLでログイン画面が表示される
- `/api/health` が `status: ok` を返す
- 試用利用者でログインできる
- 牛を1件登録し、再デプロイ後も残る
- バックアップをダウンロードできる
- 別農場バックアップの復元が拒否される

## 注意

永続ディスクを外したり、`FARMPRO_DATA_DIR` をディスク外へ変更すると、再デプロイ時にデータを失う可能性があります。
