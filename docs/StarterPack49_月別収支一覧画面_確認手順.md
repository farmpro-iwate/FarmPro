# Starter Pack 49 月別収支一覧画面 確認手順

## 1. ZIPを反映する

ZIPを解凍して、中身をプロジェクト本体へ上書きコピーします。

反映先:

```text
C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
```

## 2. client/src/App.tsx に手動追記する

### 追加1：import の近く

```ts
import { MonthlyBalancePage } from './pages/MonthlyBalancePage';
```

### 追加2：Route の近く

```tsx
<Route path="/monthly-balance" element={<AppLayout><MonthlyBalancePage /></AppLayout>} />
```

おすすめの場所は、経費管理やレポートのRouteの近くです。

## 3. client/src/components/AppLayout.tsx に手動追記する

navItems の中に追加します。

```ts
{ label: '月別収支', path: '/monthly-balance' },
```

おすすめの場所は、経費管理とレポートの間です。

例:

```ts
{ label: '経費管理', path: '/expenses' },
{ label: '月別収支', path: '/monthly-balance' },
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

## 6. 月別収支画面を開く

Chromeで次を開きます。

```text
http://localhost:5173/monthly-balance
```

または上部メニューの「月別収支」を押します。

## 7. 確認すること

次が表示されればOKです。

```text
月別収支
売上合計
経費合計
差引収支
販売頭数
平均販売金額
経費件数
飼料費
診療・医薬品費
繁殖費
その他経費
```

## 8. API確認

serverが起動している状態で、Chromeで次を開きます。

```text
http://localhost:4000/api/monthly-balance
```

rows と totals が出ればOKです。

## 9. GitHub保存

確認できてから保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 49 monthly balance list"
git push
```

## 10. 白い画面になった場合

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git restore .
git clean -fd
```
