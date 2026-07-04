# Starter Pack 36 レポート販売集計 確認手順

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

## 4. レポート画面を開く

```text
http://localhost:5173/reports
```

または上部メニューの「レポート」を開きます。

## 5. 確認すること

レポート画面に次が表示されればOKです。

```text
出荷・販売サマリー
販売記録
販売済み頭数
出荷予定
出荷済み
取消
販売金額合計
平均販売金額
平均販売体重
```

## 6. CSV確認

CSV出力欄に次のボタンがあればOKです。

```text
出荷販売CSV
```

## 7. API確認

serverが起動している状態で、Chromeで次を開きます。

```text
http://localhost:4000/api/reports/summary
```

次のような項目が見えればOKです。

```text
salesCount
salesTotalAmount
salesAverageAmount
salesAverageWeight
```

## 8. GitHub保存

確認できてから保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 36 sales report summary"
git push
```

## 9. 白い画面になった場合

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git restore .
git clean -fd
```
