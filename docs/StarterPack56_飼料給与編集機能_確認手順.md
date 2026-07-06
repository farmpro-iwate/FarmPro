# Starter Pack 56 飼料給与編集機能 確認手順

## 1. ZIPを反映する

ZIPを解凍して、中身をプロジェクト本体へ上書きコピーします。

反映先:

```text
C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
```

## 2. client/src/App.tsx に手動追記する

### 追加1：import の近く

```ts
import { FeedingEditForm } from './pages/FeedingEditForm';
```

### 追加2：Route の近く

```tsx
<Route path="/feedings/:id/edit" element={<AppLayout><FeedingEditForm /></AppLayout>} />
```

おすすめの並び:

```tsx
<Route path="/feedings" element={<AppLayout><FeedingList /></AppLayout>} />
<Route path="/feedings/new" element={<AppLayout><FeedingForm /></AppLayout>} />
<Route path="/feedings/:id/edit" element={<AppLayout><FeedingEditForm /></AppLayout>} />
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

## 5. 飼養管理画面を開く

```text
http://localhost:5173/feedings
```

## 6. 編集ボタンを確認

飼料給与が1件以上ある場合、一覧に「編集」ボタンが出ます。

押すと次のようなURLへ移動します。

```text
http://localhost:5173/feedings/feeding_xxxxx/edit
```

## 7. 編集テスト

給与量やメモを変更して「更新」を押します。

一覧に戻り、変更内容が反映されていれば成功です。

## 8. GitHub保存

確認できてから保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 56 feeding edit"
git push
```

## 9. 白い画面になった場合

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git restore .
git clean -fd
```
