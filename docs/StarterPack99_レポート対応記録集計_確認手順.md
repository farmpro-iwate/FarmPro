# Starter Pack 99 レポート対応記録集計 確認手順

## 1. ZIPを反映する

ZIPを解凍して、中身をプロジェクト本体へ上書きコピーします。

反映先:

```text
C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
```

## 2. 手動追記

今回は不要です。

## 3. serverを起動し直す

server側の黒い画面で一度止めます。

```text
Ctrl + C
```

その後、起動します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1\server
npm run dev
```

## 4. clientを起動し直す

client側の黒い画面で一度止めます。

```text
Ctrl + C
```

その後、起動します。

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
feedingAlertActions
```

## 6. 画面確認

Chromeで開きます。

```text
http://localhost:5173/reports
```

## 7. 確認すること

レポート画面に以下が表示されれば成功です。

```text
給与アラート対応記録集計
全対応記録
未対応
対応中
対応済み
様子見
再確認必要
今月の対応
```

## 8. 数字が0の場合

対応記録が少ない場合は0件でも正常です。

対応記録画面で新規登録してからレポートを再読み込みすると件数が増えます。

```text
http://localhost:5173/feeding-alert-actions
```

## 9. GitHub保存

確認できてから保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 99 report feeding alert actions"
git push
```

## 10. 白い画面になった場合

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git restore .
git clean -fd
```
