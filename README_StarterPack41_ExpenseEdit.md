# FarmPro Starter Pack 41 経費管理 編集機能追加版

## 内容

Starter Pack 41では、経費管理に編集機能を追加します。

## 追加・更新ファイル

- client/src/pages/ExpenseEditForm.tsx
- client/src/pages/ExpenseList.tsx
- client/src/services/expensesApi.ts
- docs/StarterPack41_経費管理編集機能_確認手順.md

## 手動追記が必要なファイル

- client/src/App.tsx

## 追加されること

- 経費一覧に「編集」ボタンを追加
- 経費編集画面
- 既存データの読み込み
- 修正して保存
- 保存後に経費一覧へ戻る

## 反映先

C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1

## GitHub保存

確認できてから保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 41 expense edit"
git push
```
