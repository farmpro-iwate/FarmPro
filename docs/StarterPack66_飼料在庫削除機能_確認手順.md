# Starter Pack 66 飼料在庫削除機能 確認手順

## 1. ZIPを反映する

ZIPを解凍して、中身をプロジェクト本体へ上書きコピーします。

反映先:

```text
C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
```

## 2. 手動追記

今回は不要です。

## 3. serverを起動する

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1\server
npm run dev
```

## 4. clientを起動する

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1\client
npm run dev
```

## 5. 飼料在庫画面を開く

```text
http://localhost:5173/feed-inventory
```

## 6. 削除ボタンを確認

飼料在庫が1件以上ある場合、一覧に「削除」ボタンが出ます。

## 7. 削除テスト

削除ボタンを押すと確認メッセージが出ます。

```text
この飼料在庫記録を削除しますか？
```

OKを押して、一覧から消えれば成功です。

## 8. API確認

Chromeで開きます。

```text
http://localhost:4000/api/feed-inventory
```

削除したデータが消えていればOKです。

## 9. GitHub保存

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 66 feed inventory delete"
git push
```
