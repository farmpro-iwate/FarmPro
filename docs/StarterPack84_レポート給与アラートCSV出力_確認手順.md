# Starter Pack 84 レポート給与アラートCSV出力 確認手順

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

「給与アラート集計」の右側に、以下のボタンが表示されればOKです。

```text
CSV出力
```

## 7. CSV出力確認

「CSV出力」を押します。

次のようなファイルがダウンロードされれば成功です。

```text
レポート給与アラート_20260705.csv
```

## 8. CSVの中身

CSVには以下が入ります。

```text
全子牛
給与目安あり
生年月日なし
給与目安なし
実績なし
不足気味
多め
概ね良好
子牛ごとの詳細
```

## 9. GitHub保存

確認できてから保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 84 report feeding alert csv"
git push
```

## 10. 白い画面になった場合

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git restore .
git clean -fd
```
