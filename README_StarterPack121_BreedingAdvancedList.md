# FarmPro Starter Pack 121 繁殖強化 一覧確認画面

## 内容

Starter Pack 121では、既存の繁殖画面を壊さないために、別URLで繁殖強化の一覧確認画面を追加します。

## 追加・更新ファイル

```text
client/src/pages/BreedingAdvancedList.tsx
client/src/services/breedingAdvancedApi.ts
docs/StarterPack121_繁殖強化一覧確認画面_確認手順.md
README_StarterPack121_BreedingAdvancedList.md
```

## 手動追記

App.tsxに2行だけ追記します。

import:

```ts
import { BreedingAdvancedList } from './pages/BreedingAdvancedList';
```

Route:

```tsx
<Route path="/breedings-advanced" element={<AppLayout><BreedingAdvancedList /></AppLayout>} />
```

Pack120の新規登録ルートも残します。

```tsx
<Route path="/breedings-advanced/new" element={<AppLayout><BreedingAdvancedForm /></AppLayout>} />
```

## 確認URL

```text
http://localhost:5173/breedings-advanced
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
人工授精の確認
自然交配の確認
受精卵移植の確認
妊娠鑑定予定日の確認
分娩予定日の確認
検索・絞り込み
スマホではカード表示
PCでは表表示
```

## GitHub保存

画面確認後に保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 121 breeding advanced list"
git push
```
