# Starter Pack 68 飼料在庫CSV出力 確認手順

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

## 6. CSV出力を確認

画面右上に「CSV出力」ボタンが出ればOKです。

## 7. CSV出力テスト

飼料在庫データが1件以上ある状態で「CSV出力」を押します。

以下のようなファイルがダウンロードされれば成功です。

```text
farmpro_feed_inventory_YYYYMMDD.csv
```

## 8. 絞り込み後CSVテスト

区分や日付で絞り込んだ状態でCSV出力します。

表示中のデータだけCSVに出力されればOKです。

## 9. GitHub保存

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 68 feed inventory csv"
git push
```
