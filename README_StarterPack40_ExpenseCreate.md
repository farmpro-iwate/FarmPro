# FarmPro Starter Pack 40 経費管理 新規登録画面追加版

## 内容

Starter Pack 40では、経費管理に新規登録画面を追加します。

## 追加・更新ファイル

- client/src/pages/ExpenseForm.tsx
- client/src/pages/ExpenseList.tsx
- client/src/services/expensesApi.ts
- docs/StarterPack40_経費管理新規登録_確認手順.md

## 手動追記が必要なファイル

- client/src/App.tsx

## 追加されること

- 経費新規登録画面
- 支払日
- 経費区分
- 内容
- 支払先
- 金額
- 支払方法
- 対象
- メモ
- 登録後に経費一覧へ戻る

## 反映先

C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1

## GitHub保存

確認できてから保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 40 expense create"
git push
```
