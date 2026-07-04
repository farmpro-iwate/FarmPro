# FarmPro Starter Pack 39 経費管理 一覧画面追加版

## 内容

Starter Pack 39では、経費管理の一覧画面を追加します。

server APIはStarter Pack 38で追加済みの `/api/expenses` を使います。

## 追加ファイル

- client/src/services/expensesApi.ts
- client/src/pages/ExpenseList.tsx
- docs/StarterPack39_経費管理一覧画面_確認手順.md

## 手動追記が必要なファイル

- client/src/App.tsx
- client/src/components/AppLayout.tsx

## 追加されること

- 経費一覧画面
- 経費件数表示
- 経費合計金額表示
- 検索欄
- 経費区分、支払日、支払先、金額、支払方法などの表示

## 反映先

C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1

## GitHub保存

確認できてから保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 39 expense list"
git push
```
