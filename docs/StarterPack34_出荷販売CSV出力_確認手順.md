# Starter Pack 34 出荷販売CSV出力 確認手順

## 1. ZIPを反映する

ZIPを解凍して、中身をプロジェクト本体へ上書きコピーします。

反映先:

```text
C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
```

## 2. serverを起動

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1\server
npm run dev
```

## 3. clientを起動

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1\client
npm run dev
```

## 4. 出荷販売一覧を開く

```text
http://localhost:5173/sales
```

## 5. CSV出力ボタンを確認

画面上部に次のボタンが出ればOKです。

```text
CSV出力
```

## 6. CSV出力テスト

記録が1件以上ある状態で「CSV出力」を押します。

次のようなファイルがダウンロードされればOKです。

```text
farmpro_sales_20260703.csv
```

## 7. 絞り込み後のCSV

状態や区分で絞り込んでからCSV出力すると、表示中のデータだけ出力されます。

## 8. GitHub保存

確認できてから保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 34 sales csv export"
git push
```

## 9. 白い画面になった場合

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git restore .
git clean -fd
```
