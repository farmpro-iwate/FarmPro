# FarmPro Starter Pack 118 修正版 種付・受精卵移植 登録画面

## 内容

Starter Pack 118の修正版です。

## 修正点

- 正しい画面URLを `/breedings/new` に整理
- `BreedingForm` が `mode="create"` / `mode="edit"` を受け取れるように修正
- 保存後の戻り先を `/breedings` に修正
- API接続を `/api/breeding` と `/api/breedings` の両方に対応

## 更新ファイル

```text
client/src/pages/BreedingForm.tsx
client/src/services/breedingApi.ts
docs/StarterPack118_修正版_確認手順.md
README_StarterPack118_BreedingFormEnhance_Repair.md
```

## 手動追記

不要です。

現在のApp.tsxの以下はそのままでOKです。

```tsx
<Route path="/breedings" element={<AppLayout><BreedingList /></AppLayout>} />
<Route path="/breedings/new" element={<AppLayout><BreedingForm mode="create" /></AppLayout>} />
<Route path="/breedings/:id/edit" element={<AppLayout><BreedingForm mode="edit" /></AppLayout>} />
```

## 確認URL

```text
http://localhost:5173/breedings/new
```

## GitHub保存

画面確認後に保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Repair Starter Pack 118 breeding form route"
git push
```
