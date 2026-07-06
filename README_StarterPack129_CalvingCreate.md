# FarmPro Starter Pack 129 分娩記録 登録画面

## 内容

Starter Pack 129では、分娩記録を登録する画面を追加します。

## 追加ファイル

```text
client/src/services/calvingsApi.ts
client/src/pages/CalvingForm.tsx
client/src/pages/CalvingList.tsx
docs/StarterPack129_分娩記録登録画面_確認手順.md
README_StarterPack129_CalvingCreate.md
```

## App.tsx 手動追記

### import欄

```ts
import { CalvingForm } from './pages/CalvingForm';
import { CalvingList } from './pages/CalvingList';
```

### Route欄

```tsx
<Route path="/calvings" element={<AppLayout><CalvingList /></AppLayout>} />
<Route path="/calvings/new" element={<AppLayout><CalvingForm /></AppLayout>} />
```

## 確認URL

```text
http://localhost:5173/calvings/new
```

API確認:

```text
http://localhost:4000/api/calvings
```

## できること

```text
分娩記録の新規登録
予定日との差を表示
分娩結果を少ない選択肢で入力
初乳確認を少ない選択肢で入力
JSON保存
```

## 今回まだやらないこと

```text
本格的な一覧表示
編集
削除
子牛台帳への連携
```

## GitHub保存

確認後に保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 129 calving create page"
git push
```
