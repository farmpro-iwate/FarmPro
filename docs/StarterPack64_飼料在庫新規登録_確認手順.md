# Starter Pack 64 飼料在庫新規登録 確認手順

## 1. ZIPを反映する

ZIPを解凍して、中身をプロジェクト本体へ上書きコピーします。

反映先:

```text
C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
```

## 2. client/src/App.tsx に手動追記する

### 追加1：import の近く

```ts
import { FeedInventoryForm } from './pages/FeedInventoryForm';
```

### 追加2：Route の近く

```tsx
<Route path="/feed-inventory/new" element={<AppLayout><FeedInventoryForm /></AppLayout>} />
```

おすすめの並び:

```tsx
<Route path="/feed-inventory" element={<AppLayout><FeedInventoryList /></AppLayout>} />
<Route path="/feed-inventory/new" element={<AppLayout><FeedInventoryForm /></AppLayout>} />
```

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

## 6. 新規登録を確認

飼料在庫管理画面の右上に「新規登録」ボタンが出ればOKです。

押すと次へ移動します。

```text
http://localhost:5173/feed-inventory/new
```

## 7. テスト登録

例:

```text
入出庫日: 今日の日付
飼料名: 配合飼料
区分: 入庫
数量: 500
単位: kg
単価: 80
金額: 40000
仕入先: JA
メモ: テスト登録
```

登録後、飼料在庫一覧に戻り、一覧に1件表示されれば成功です。

## 8. API確認

Chromeで開きます。

```text
http://localhost:4000/api/feed-inventory
```

登録したデータが表示されればOKです。

## 9. GitHub保存

確認できてから保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 64 feed inventory create"
git push
```
