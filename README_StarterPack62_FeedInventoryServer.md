# FarmPro Starter Pack 62 飼料在庫管理 server API追加版

## 内容

Starter Pack 62では、飼料在庫管理のserver APIを追加します。

今回は画面はまだ追加しません。
まずはserver側で、飼料在庫の入庫・出庫・調整記録を保存できるようにします。

## 追加ファイル

- server/src/data/feedInventory.json
- server/src/routes/feedInventory.ts
- docs/StarterPack62_飼料在庫ServerAPI_確認手順.md
- README_StarterPack62_FeedInventoryServer.md

## 手動追記が必要なファイル

- server/src/app.ts

## 追加されるAPI

```text
GET    /api/feed-inventory
GET    /api/feed-inventory/:id
POST   /api/feed-inventory
PUT    /api/feed-inventory/:id
DELETE /api/feed-inventory/:id
```

## 登録項目

- 入出庫日
- 飼料名
- 区分
- 数量
- 単位
- 単価
- 金額
- 仕入先
- メモ

## 区分

```text
入庫
出庫
調整
```

## 反映先

C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1

## GitHub保存

確認できてから保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 62 feed inventory server API"
git push
```
