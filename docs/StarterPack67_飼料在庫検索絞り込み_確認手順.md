# Starter Pack 67 飼料在庫検索・絞り込み 確認手順

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

## 5. 飼料在庫画面を開く

```text
http://localhost:5173/feed-inventory
```

## 6. 確認すること

画面に以下が表示されればOKです。

```text
検索・絞り込み
キーワード検索
区分
単位
開始日
終了日
条件クリア
```

## 7. 絞り込みテスト

以下を試してください。

```text
区分を「入庫」にする
区分を「出庫」にする
単位を「kg」にする
開始日・終了日を入れる
キーワードに飼料名を入れる
```

表示件数と集計が変われば成功です。

## 8. GitHub保存

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 67 feed inventory filter"
git push
```
