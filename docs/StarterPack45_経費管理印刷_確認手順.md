# Starter Pack 45 経費管理印刷 確認手順

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

## 6. 印刷ボタンを確認

画面上部に次のボタンが出ればOKです。

```text
印刷
```

## 7. 印刷テスト

経費記録が1件以上ある状態で「印刷」を押します。

ブラウザの印刷画面が開けばOKです。

PDF保存もできます。

## 8. 絞り込み後の印刷

経費区分や支払方法で絞り込んでから印刷すると、表示中のデータだけ印刷できます。

## 9. GitHub保存

確認できてから保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 45 expense print"
git push
```

## 10. 白い画面になった場合

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git restore .
git clean -fd
```
