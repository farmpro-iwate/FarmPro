# Starter Pack 65 飼料在庫編集機能 確認手順

## 1. ZIPを反映する

ZIPを解凍して、中身をプロジェクト本体へ上書きコピーします。

反映先:

```text
C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
```

## 2. client/src/App.tsx に手動追記する

### 追加1：import の近く

```ts
import { FeedInventoryEditForm } from './pages/FeedInventoryEditForm';
```

### 追加2：Route の近く

```tsx
<Route path="/feed-inventory/:id/edit" element={<AppLayout><FeedInventoryEditForm /></AppLayout>} />
```

おすすめの並び:

```tsx
<Route path="/feed-inventory" element={<AppLayout><FeedInventoryList /></AppLayout>} />
<Route path="/feed-inventory/new" element={<AppLayout><FeedInventoryForm /></AppLayout>} />
<Route path="/feed-inventory/:id/edit" element={<AppLayout><FeedInventoryEditForm /></AppLayout>} />
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

## 6. 編集テスト

飼料在庫が1件以上ある場合、一覧に「編集」ボタンが出ます。

押すと次のようなURLへ移動します。

```text
http://localhost:5173/feed-inventory/feed_inventory_xxxxx/edit
```

数量やメモを変更して「更新」を押します。

一覧に戻り、変更内容が反映されていれば成功です。

## 7. GitHub保存

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 65 feed inventory edit"
git push
```
