# Starter Pack 61 レポート飼料給与集計 確認手順

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

## 5. レポート画面を開く

```text
http://localhost:5173/reports
```

## 6. 画面確認

レポート画面に以下が表示されればOKです。

```text
飼料給与サマリー
飼料給与件数
飼料給与量合計
飼料給与金額合計
今月飼料給与金額
今年飼料給与金額
```

## 7. API確認

serverが起動している状態で、Chromeで次を開きます。

```text
http://localhost:4000/api/reports/summary
```

以下の項目が見えればOKです。

```text
feedingCount
feedingTotalAmount
feedingTotalPrice
thisMonthFeedingPrice
thisYearFeedingPrice
```

## 8. CSV確認

レポート画面のCSV出力に「飼料給与CSV」が追加されます。

押してCSVがダウンロードされればOKです。

## 9. GitHub保存

確認できてから保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 61 report feeding summary"
git push
```

## 10. serverエラーで戻したい場合

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git restore .
git clean -fd
```
