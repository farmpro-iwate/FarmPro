# Starter Pack 58 飼料給与検索・絞り込み 確認手順

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

画面に以下が表示されればOKです。

```text
検索・絞り込み
キーワード検索
給与目的
単位
開始日
終了日
条件クリア
```

## 7. テスト方法

### キーワード検索

飼料名や対象を入力して、表示件数が変わればOKです。

例:

```text
配合飼料
母牛群
```

### 給与目的

「維持」「増体」「分娩前」などを選んで、表示が絞られればOKです。

### 単位

「kg」「袋」「ロール」などを選んで、表示が絞られればOKです。

### 日付

開始日・終了日を指定して、期間内の記録だけになればOKです。

### 条件クリア

条件クリアを押して、すべての条件が消えればOKです。

## 8. GitHub保存

確認できてから保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 58 feeding filter"
git push
```

## 9. 白い画面になった場合

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git restore .
git clean -fd
```
