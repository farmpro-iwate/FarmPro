# Starter Pack 31 出荷販売編集画面 追加手順

## 1. ZIPを反映する

ZIPを解凍して、中身をプロジェクト本体へ上書きコピーします。

反映先:

```text
C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
```

## 2. App.tsx に import を追加

```ts
import { SalesEditForm } from './pages/SalesEditForm';
```

## 3. App.tsx に Route を追加

`/sales` と `/sales/new` の近くに追加します。

```tsx
<Route path="/sales/:id/edit" element={<AppLayout><SalesEditForm /></AppLayout>} />
```

おすすめの並び:

```tsx
<Route path="/sales" element={<AppLayout><SalesList /></AppLayout>} />
<Route path="/sales/new" element={<AppLayout><SalesForm /></AppLayout>} />
<Route path="/sales/:id/edit" element={<AppLayout><SalesEditForm /></AppLayout>} />
```

## 4. 保存

```text
Ctrl + S
```
