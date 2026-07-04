# Starter Pack 50 月別収支CSV・印刷 確認手順

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

## 5. 月別収支画面を開く

```text
http://localhost:5173/monthly-balance
```

## 6. 確認すること

画面上部に次が出ればOKです。

```text
印刷
CSV出力
```

## 7. CSV出力テスト

月別収支データがある状態で「CSV出力」を押します。

次のようなファイルがダウンロードされればOKです。

```text
farmpro_monthly_balance_20260703.csv
```

## 8. 印刷テスト

月別収支データがある状態で「印刷」を押します。

ブラウザの印刷画面が開けばOKです。

PDF保存もできます。

## 9. GitHub保存

確認できてから保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 50 monthly balance csv print"
git push
```

## 10. 白い画面になった場合

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git restore .
git clean -fd
```
