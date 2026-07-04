# Starter Pack 44 経費管理CSV出力 確認手順

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

## 5. 経費管理画面を開く

```text
http://localhost:5173/expenses
```

## 6. CSV出力ボタンを確認

画面上部に次のボタンが出ればOKです。

```text
CSV出力
```

## 7. CSV出力テスト

経費記録が1件以上ある状態で「CSV出力」を押します。

次のようなファイルがダウンロードされればOKです。

```text
farmpro_expenses_20260703.csv
```

## 8. 絞り込み後のCSV

経費区分や支払方法で絞り込んでからCSV出力すると、表示中のデータだけ出力されます。

## 9. GitHub保存

確認できてから保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 44 expense csv export"
git push
```

## 10. 白い画面になった場合

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git restore .
git clean -fd
```
