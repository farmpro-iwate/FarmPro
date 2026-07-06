# FarmPro Starter Pack 123 妊娠鑑定 一覧確認画面

## 内容

Starter Pack 123では、妊娠鑑定の一覧確認画面を追加します。

## 追加ファイル

```text
client/src/pages/PregnancyCheckList.tsx
docs/StarterPack123_妊娠鑑定一覧確認画面_確認手順.md
README_StarterPack123_PregnancyCheckList.md
```

## 手動追記

App.tsxに2行だけ追記します。

import:

```ts
import { PregnancyCheckList } from './pages/PregnancyCheckList';
```

Route:

```tsx
<Route path="/pregnancy-checks" element={<AppLayout><PregnancyCheckList /></AppLayout>} />
```

## 確認URL

```text
http://localhost:5173/pregnancy-checks
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
妊娠鑑定期限切れの確認
今日鑑定の確認
鑑定待ちの確認
再確認の確認
妊娠・不受胎・流産の確認
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
git commit -m "Add Starter Pack 123 pregnancy check list"
git push
```
