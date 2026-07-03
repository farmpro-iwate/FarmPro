# Starter Pack 35 出荷販売印刷 確認手順

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

## 4. 出荷販売一覧を開く

```text
http://localhost:5173/sales
```

## 5. 印刷ボタンを確認

画面上部に次のボタンが出ればOKです。

```text
印刷
```

## 6. 印刷テスト

記録が1件以上ある状態で「印刷」を押します。

ブラウザの印刷画面が開けばOKです。

PDF保存もできます。

## 7. 絞り込み後の印刷

状態や区分で絞り込んでから印刷すると、表示中のデータだけ印刷できます。

## 8. GitHub保存

確認できてから保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 35 sales print"
git push
```

## 9. 白い画面になった場合

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git restore .
git clean -fd
```
