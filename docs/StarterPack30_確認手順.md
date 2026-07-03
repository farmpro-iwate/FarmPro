# Starter Pack 30 確認手順

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

## 4. 出荷販売画面を開く

```text
http://localhost:5173/sales
```

## 5. 確認すること

出荷・販売管理画面の右上あたりに、次のボタンが出ればOKです。

```text
新規登録
```

## 6. ボタンを押す

「新規登録」を押して、次の画面に移動すればOKです。

```text
http://localhost:5173/sales/new
```

## 7. 登録確認

テストで1件登録して、一覧に戻ればOKです。

## 8. 白い画面になった場合

すぐにGitで戻します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git restore .
git clean -fd
```

## 9. GitHub保存

確認できてから保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 30 sales new button"
git push
```
