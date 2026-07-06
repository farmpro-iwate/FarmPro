# Starter Pack 63 飼料在庫一覧画面 確認手順

## 1. ZIPを反映する

ZIPを解凍して、中身をプロジェクト本体へ上書きコピーします。

反映先:

```text
C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
```

## 2. client/src/App.tsx に手動追記する

### 追加1：import の近く

```ts
import { FeedInventoryList } from './pages/FeedInventoryList';
```

### 追加2：Route の近く

```tsx
<Route path="/feed-inventory" element={<AppLayout><FeedInventoryList /></AppLayout>} />
```

おすすめの場所は、飼養管理のRouteの近くです。

```tsx
<Route path="/feedings" element={<AppLayout><FeedingList /></AppLayout>} />
<Route path="/feedings/new" element={<AppLayout><FeedingForm /></AppLayout>} />
<Route path="/feedings/:id/edit" element={<AppLayout><FeedingEditForm /></AppLayout>} />
<Route path="/feed-inventory" element={<AppLayout><FeedInventoryList /></AppLayout>} />
```

## 3. client/src/components/AppLayout.tsx に手動追記する

navItems の中に追加します。

```ts
{ label: '飼料在庫', path: '/feed-inventory' },
```

おすすめの場所は、飼養管理の近くです。

例:

```ts
{ label: '飼養管理', path: '/feedings' },
{ label: '飼料在庫', path: '/feed-inventory' },
{ label: 'レポート', path: '/reports' },
```

## 4. serverを起動する

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1\server
npm run dev
```

## 5. clientを起動する

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1\client
npm run dev
```

## 6. 飼料在庫画面を開く

Chromeで次を開きます。

```text
http://localhost:5173/feed-inventory
```

または上部メニューの「飼料在庫」を押します。

## 7. 確認すること

次が表示されればOKです。

```text
飼料在庫管理
表示件数
入庫数量合計
出庫数量合計
調整数量合計
現在在庫の目安
検索
```

最初はまだ飼料在庫データがないので、以下の表示でOKです。

```text
飼料在庫記録はまだありません。
```

## 8. API確認

serverが起動している状態で、Chromeで次を開きます。

```text
http://localhost:4000/api/feed-inventory
```

次のように表示されればOKです。

```json
[]
```

## 9. GitHub保存

確認できてから保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 63 feed inventory list"
git push
```

## 10. 白い画面になった場合

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git restore .
git clean -fd
```
