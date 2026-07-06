# Starter Pack 59 飼料給与CSV出力 確認手順

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

## 5. 飼養管理画面を開く

```text
http://localhost:5173/feedings
```

## 6. 確認すること

画面右上に以下が表示されればOKです。

```text
CSV出力
新規登録
```

## 7. CSV出力テスト

飼料給与データが1件以上ある状態で「CSV出力」を押します。

次のようなファイルがダウンロードされればOKです。

```text
farmpro_feedings_20260703.csv
```

## 8. 絞り込み後CSVテスト

検索や日付絞り込みをした状態でCSV出力します。

表示中のデータだけCSVに入っていればOKです。

## 9. GitHub保存

確認できてから保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 59 feeding csv"
git push
```

## 10. 白い画面になった場合

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git restore .
git clean -fd
```
