# Starter Pack 43 経費管理検索・絞り込み 確認手順

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

## 6. 確認すること

次が表示されればOKです。

```text
全体
飼料費
診療・医薬品
繁殖費
その他
検索
経費区分
支払方法
検索条件をクリア
```

## 7. テスト

経費区分で絞り込みしてください。

支払方法で絞り込みしてください。

検索欄に支払先や内容を入れて絞り込みしてください。

## 8. GitHub保存

確認できてから保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 43 expense filters"
git push
```

## 9. 白い画面になった場合

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git restore .
git clean -fd
```
