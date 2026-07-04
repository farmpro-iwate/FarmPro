# Starter Pack 51 レポート収支集計 確認手順

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

## 6. 確認すること

レポート画面に次が表示されればOKです。

```text
今月・今年の収支
今月売上
今月経費
今月収支
今年売上
今年経費
今年収支
```

## 7. API確認

serverが起動している状態で、Chromeで次を開きます。

```text
http://localhost:4000/api/reports/summary
```

次の項目が見えればOKです。

```text
thisMonthSalesAmount
thisMonthExpenseAmount
thisMonthBalanceAmount
thisYearSalesAmount
thisYearExpenseAmount
thisYearBalanceAmount
```

## 8. GitHub保存

確認できてから保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 51 report balance summary"
git push
```

## 9. serverエラーで戻したい場合

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git restore .
git clean -fd
```
