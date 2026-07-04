# FarmPro Starter Pack 38 経費管理 server API追加版

## 内容

Starter Pack 38では、経費管理のserver APIを追加します。

今回は画面はまだ追加しません。
まずはserver側で経費データを登録・取得・編集・削除できるようにします。

## 追加ファイル

- server/src/data/expenses.json
- server/src/routes/expenses.ts
- docs/StarterPack38_経費管理ServerAPI_確認手順.md

## 手動追記が必要なファイル

- server/src/app.ts

## 追加されるAPI

```text
GET    /api/expenses
GET    /api/expenses/:id
POST   /api/expenses
PUT    /api/expenses/:id
DELETE /api/expenses/:id
```

## 登録項目

- 支払日
- 経費区分
- 内容
- 支払先
- 金額
- 支払方法
- 対象
- メモ

## 反映先

C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1

## GitHub保存

確認できてから保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 38 expense server API"
git push
```
