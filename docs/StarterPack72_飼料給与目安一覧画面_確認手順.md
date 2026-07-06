# Starter Pack 72 飼料給与目安一覧画面 確認手順

## 1. ZIPを反映する

ZIPを解凍して、中身をプロジェクト本体へ上書きコピーします。

反映先:

```text
C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
```

## 2. client/src/App.tsx に手動追記する

### 追加1：import の近く

```ts
import { FeedingGuideList } from './pages/FeedingGuideList';
```

### 追加2：Route の近く

```tsx
<Route path="/feeding-guide" element={<AppLayout><FeedingGuideList /></AppLayout>} />
```

おすすめの場所は、飼養管理・飼料在庫のRouteの近くです。

```tsx
<Route path="/feedings" element={<AppLayout><FeedingList /></AppLayout>} />
<Route path="/feed-inventory" element={<AppLayout><FeedInventoryList /></AppLayout>} />
<Route path="/feeding-guide" element={<AppLayout><FeedingGuideList /></AppLayout>} />
```

## 3. client/src/components/AppLayout.tsx に手動追記する

navItems の中に追加します。

```ts
{ label: '給与目安', path: '/feeding-guide' },
```

おすすめの場所は、飼養管理・飼料在庫の近くです。

```ts
{ label: '飼養管理', path: '/feedings' },
{ label: '飼料在庫', path: '/feed-inventory' },
{ label: '給与目安', path: '/feeding-guide' },
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

## 6. 飼料給与目安画面を開く

Chromeで次を開きます。

```text
http://localhost:5173/feeding-guide
```

または上部メニューの「給与目安」を押します。

## 7. 確認すること

次が表示されればOKです。

```text
飼料給与目安表
日齢
月齢
ステージ
体重目安
スターター
育成配合
粗飼料
```

0日、30日、60日、90日などの行が出れば成功です。

## 8. API確認

serverが起動している状態で、Chromeで次を開きます。

```text
http://localhost:4000/api/feeding-guide
```

データが表示されればOKです。

## 9. GitHub保存

確認できてから保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 72 feeding guide list"
git push
```

## 10. 白い画面になった場合

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git restore .
git clean -fd
```
