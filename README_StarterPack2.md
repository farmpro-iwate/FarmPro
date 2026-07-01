# 繁殖Farm Pro - Starter Pack 2

Starter Pack 2 では、牛台帳に以下を追加します。

- 牛の新規登録
- 牛の編集
- 牛の削除
- SQLite保存
- サンプルデータではなく、実際に登録したデータを保存

## 反映方法

このZIPの中身を、既存の `FarmPro` フォルダへ上書きコピーしてください。

## 再インストール

server側にSQLite用パッケージを追加するため、serverフォルダで再度インストールします。

```bash
cd server
npm install
npm run dev
```

client側も必要に応じて起動します。

```bash
cd client
npm install
npm run dev
```

## GitHub保存

動作確認後、FarmProフォルダで以下を実行します。

```bash
git add .
git commit -m "Add Starter Pack 2 cattle CRUD"
git push
```
