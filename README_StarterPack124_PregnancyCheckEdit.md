# FarmPro Starter Pack 124 妊娠鑑定 結果更新画面

## 内容

Starter Pack 124では、妊娠鑑定の結果更新画面を追加します。

## 追加・更新ファイル

```text
client/src/pages/PregnancyCheckEdit.tsx
client/src/services/breedingAdvancedApi.ts
docs/StarterPack124_妊娠鑑定結果更新画面_確認手順.md
README_StarterPack124_PregnancyCheckEdit.md
```

## 手動追記

App.tsxに2行だけ追記します。

import:

```ts
import { PregnancyCheckEdit } from './pages/PregnancyCheckEdit';
```

Route:

```tsx
<Route path="/pregnancy-checks/:id/edit" element={<AppLayout><PregnancyCheckEdit /></AppLayout>} />
```

## 確認URLの例

```text
http://localhost:5173/pregnancy-checks/breeding_sample_ai_001/edit
```

## できること

```text
妊娠鑑定実施日の入力
妊娠に更新
不受胎に更新
再確認に更新
流産に更新
状態の更新
メモの追加
```

## 既存画面

既存の以下は触りません。

```text
/breedings
/breedings/new
/breedings/:id/edit
```

## GitHub保存

画面確認後に保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 124 pregnancy check edit"
git push
```
