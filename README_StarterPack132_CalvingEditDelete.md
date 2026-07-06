# FarmPro Starter Pack 132 分娩記録 編集・削除

## 内容

Starter Pack 132では、分娩記録の編集画面と削除ボタンを追加します。

## 更新ファイル

```text
client/src/pages/CalvingEditForm.tsx
client/src/pages/CalvingList.tsx
docs/StarterPack132_分娩記録編集削除_確認手順.md
README_StarterPack132_CalvingEditDelete.md
```

## App.tsx 手動追記

### import欄

```ts
import { CalvingEditForm } from './pages/CalvingEditForm';
```

### Route欄

```tsx
<Route path="/calvings/:id/edit" element={<AppLayout><CalvingEditForm /></AppLayout>} />
```

## 確認URL

```text
http://localhost:5173/calvings
```

## できること

```text
分娩記録の編集
分娩記録の削除
削除前の確認
子牛台帳登録済み記録の注意表示
```

## 注意

子牛台帳へ登録済みの分娩記録を編集・削除しても、子牛台帳側は自動更新・自動削除しません。

## GitHub保存

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 132 calving edit delete"
git push
```
