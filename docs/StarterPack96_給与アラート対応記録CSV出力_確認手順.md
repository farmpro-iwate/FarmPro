# Starter Pack 96 給与アラート対応記録 CSV出力 確認手順

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

## 5. 一覧画面を開く

Chromeで開きます。

```text
http://localhost:5173/feeding-alert-actions
```

## 6. 確認すること

一覧画面の上部に以下が表示されればOKです。

```text
CSV出力
```

## 7. CSV出力確認

「CSV出力」を押します。

次のようなファイルがダウンロードされれば成功です。

```text
給与アラート対応記録_20260705.csv
```

## 8. 絞り込み後のCSV確認

アラート種別や状態で絞り込みしてからCSV出力してください。

画面に表示されている記録だけCSVに出れば成功です。

## 9. CSVの中身

CSVには以下が入ります。

```text
対応日
子牛ID
子牛名
日齢
アラート種別
対応内容
状態
次回確認日
メモ
作成日時
更新日時
```

## 10. GitHub保存

確認できてから保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 96 feeding alert action csv"
git push
```

## 11. 白い画面になった場合

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git restore .
git clean -fd
```
