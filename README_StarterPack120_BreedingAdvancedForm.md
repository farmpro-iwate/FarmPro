# FarmPro Starter Pack 120 繁殖強化 新規登録専用画面

## 内容

Starter Pack 120では、既存の繁殖画面を壊さないために、別URLで繁殖強化の新規登録画面を追加します。

## 追加ファイル

```text
client/src/pages/BreedingAdvancedForm.tsx
client/src/services/breedingAdvancedApi.ts
docs/StarterPack120_繁殖強化新規登録画面_確認手順.md
README_StarterPack120_BreedingAdvancedForm.md
```

## 手動追記

App.tsxに2行だけ追記します。

import:

```ts
import { BreedingAdvancedForm } from './pages/BreedingAdvancedForm';
```

Route:

```tsx
<Route path="/breedings-advanced/new" element={<AppLayout><BreedingAdvancedForm /></AppLayout>} />
```

## 確認URL

```text
http://localhost:5173/breedings-advanced/new
```

## 既存画面

既存の以下は触りません。

```text
/breedings
/breedings/new
/breedings/:id/edit
```

## できること

```text
人工授精の登録
自然交配の登録
受精卵移植の登録
分娩予定日の自動計算
妊娠鑑定予定日の自動計算
妊娠鑑定結果の入力
状態管理
```

## GitHub保存

画面確認後に保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 120 breeding advanced form"
git push
```
