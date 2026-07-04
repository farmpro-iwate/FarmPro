# Starter Pack 46 レポート経費集計 確認手順

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

成功表示:

```text
FarmPro server running at http://localhost:4000
```

## 4. clientを起動する

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1\client
npm run dev
```

## 5. レポート画面を開く

```text
http://localhost:5173/reports
```

## 6. 確認すること

レポート画面に次が表示されればOKです。

```text
経費サマリー
経費記録
経費合計
平均経費
飼料費合計
診療・医薬品費合計
繁殖費合計
その他経費合計
経費CSV
```

## 7. API確認

serverが起動している状態で、Chromeで次を開きます。

```text
http://localhost:4000/api/reports/summary
```

次の項目が見えればOKです。

```text
expenseCount
expenseTotalAmount
expenseFeedAmount
expenseMedicalAmount
expenseBreedingAmount
expenseOtherAmount
```

## 8. GitHub保存

確認できてから保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 46 expense report summary"
git push
```

## 9. serverエラーになった場合

黒い画面のエラーを確認してください。

戻したい場合:

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git restore .
git clean -fd
```
