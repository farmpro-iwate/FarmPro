# FarmPro Starter Pack 31 出荷・販売 編集画面追加版

Starter Pack 31では、出荷・販売管理に「編集画面」を追加します。

## 追加・更新ファイル

- client/src/pages/SalesEditForm.tsx
- client/src/pages/SalesList.tsx
- client/src/services/salesApi.ts
- docs/StarterPack31_出荷販売編集画面_追加手順.md
- docs/StarterPack31_確認手順.md

## 手動追加

白い画面を避けるため、App.tsx は自動上書きしません。

App.tsx の import に追加:

```ts
import { SalesEditForm } from './pages/SalesEditForm';
```

Route に追加:

```tsx
<Route path="/sales/:id/edit" element={<AppLayout><SalesEditForm /></AppLayout>} />
```

## GitHub保存

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 31 sales edit"
git push
```
