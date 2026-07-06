# FarmPro Starter Pack 64 飼料在庫 新規登録画面追加版

## 内容

Starter Pack 64では、飼料在庫管理に新規登録画面を追加します。

## 追加・更新ファイル

- client/src/pages/FeedInventoryForm.tsx
- client/src/pages/FeedInventoryList.tsx
- client/src/services/feedInventoryApi.ts
- docs/StarterPack64_飼料在庫新規登録_確認手順.md
- README_StarterPack64_FeedInventoryCreate.md

## 手動追記が必要なファイル

- client/src/App.tsx

## 追加されること

- 飼料在庫新規登録画面
- 入出庫日
- 飼料名
- 区分
- 数量
- 単位
- 単価
- 金額
- 仕入先
- メモ
- 登録後に飼料在庫一覧へ戻る

## GitHub保存

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 64 feed inventory create"
git push
```
