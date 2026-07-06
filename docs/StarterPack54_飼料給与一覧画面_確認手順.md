# Starter Pack 54 飼料給与一覧画面 確認手順

## 1. ZIPを反映する

ZIPを解凍して、中身をプロジェクト本体へ上書きコピーします。

反映先:

```text
C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
```

## 2. client/src/App.tsx に手動追記する

### 追加1：import の近く

```ts
import { FeedingList } from './pages/FeedingList';
```

### 追加2：Route の近く

```tsx
<Route path="/feedings" element={<AppLayout><FeedingList /></AppLayout>} />
```

おすすめの場所は、月別収支や経費管理のRouteの近くです。

## 3. client/src/components/AppLayout.tsx に手動追記する

navItems の中に追加します。

```ts
{ label: '飼養管理', path: '/feedings' },
```

おすすめの場所は、月別収支の近くです。

例:

```ts
{ label: '経費管理', path: '/expenses' },
{ label: '月別収支', path: '/monthly-balance' },
{ label: '飼養管理', path: '/feedings' },
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

## 6. 飼養管理画面を開く

Chromeで次を開きます。

```text
http://localhost:5173/feedings
```

または上部メニューの「飼養管理」を押します。

## 7. 確認すること

次が表示されればOKです。

```text
飼料給与管理
表示件数
給与量合計
金額合計
検索
```

最初はまだ飼料給与データがないので、以下の表示でOKです。

```text
飼料給与記録はまだありません。
```

## 8. API確認

serverが起動している状態で、Chromeで次を開きます。

```text
http://localhost:4000/api/feedings
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
git commit -m "Add Starter Pack 54 feeding list"
git push
```

## 10. 白い画面になった場合

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git restore .
git clean -fd
```
