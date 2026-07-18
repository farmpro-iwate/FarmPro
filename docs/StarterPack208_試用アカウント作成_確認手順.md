# Starter Pack 208 試用アカウント作成 確認手順

## 目的

知り合いに試用してもらうため、既存の `farm-demo` とは別の農場ID・別のログイン情報を安全に追加します。

作成した利用者は `server/data/users.json` に追加され、入力データは `server/data/farms/<農場ID>/` に保存されます。

## 作成コマンド

PowerShellでFarmProの `server` フォルダへ移動して実行します。

```powershell
npm run user:create -- --farm-id=trial-sekiguchi --farm-name="知り合い試用農場" --name="試用利用者" --email="trial@example.com" --password="8文字以上の仮パスワード"
```

実際には、次の値を知り合い用に変更してください。

- `farm-id`: 半角英数字・ハイフン・アンダーバーのみ。ほかの農場と重複しない値
- `farm-name`: 画面へ表示する農場名
- `name`: 利用者名
- `email`: ログイン用メールアドレス。既存利用者と重複不可
- `password`: 8文字以上

## 安全上の注意

- パスワードはGitHub、チャット、確認手順書へ記録しない
- 初期パスワードは本人へ個別に伝える
- 同じメールアドレスは登録できない
- `farm-id` を後から変更すると保存フォルダも変わるため、作成時に決めておく

## 確認手順

1. server buildを実行する
2. 上記コマンドで試用アカウントを作成する
3. server/clientを起動する
4. 作成したメールアドレスとパスワードでログインする
5. 牛台帳などに試験データを1件登録する
6. 次のフォルダが作成されることを確認する

```text
server/data/farms/<農場ID>/
```

7. 元の `demo@farmpro.local` でログインし、試用農場のデータが表示されないことを確認する
8. `git status --short` が空であることを確認する

## 次工程

Starter Pack 209で、バックアップJSONに農場ID・農場名を含め、別農場のバックアップを誤って復元できないよう強化します。
