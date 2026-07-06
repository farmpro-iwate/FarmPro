# Starter Pack 83 レポート給与アラート集計 確認手順

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

## 5. API確認

Chromeで開きます。

```text
http://localhost:4000/api/reports/summary
```

JSONの中に以下があればOKです。

```text
feedingAlerts
totalCalves
shortageCalfCount
overCalfCount
noRecordCount
```

## 6. レポート画面確認

Chromeで開きます。

```text
http://localhost:5173/reports
```

画面に以下が表示されればOKです。

```text
給与アラート集計
全子牛
不足気味
多め
実績なし
```

## 7. 表示内容

給与アラート集計の下に、子牛ごとの一覧が表示されます。

```text
子牛
日齢
近い目安
直近実績日
不足
多め
良好
メモ
```

## 8. GitHub保存

確認できてから保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 83 report feeding alerts"
git push
```

## 9. 白い画面になった場合

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git restore .
git clean -fd
```
