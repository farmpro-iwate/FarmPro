# FarmPro Starter Pack 53 飼養管理 server API追加版

## 内容

Starter Pack 53では、飼養管理のserver APIを追加します。

今回は画面はまだ追加しません。
まずはserver側で、飼料給与データを登録・取得・編集・削除できるようにします。

## 追加ファイル

- server/src/data/feedings.json
- server/src/routes/feedings.ts
- docs/StarterPack53_飼養管理ServerAPI_確認手順.md
- README_StarterPack53_FeedingServer.md

## 手動追記が必要なファイル

- server/src/app.ts

## 追加されるAPI

```text
GET    /api/feedings
GET    /api/feedings/:id
POST   /api/feedings
PUT    /api/feedings/:id
DELETE /api/feedings/:id
```

## 登録項目

- 給与日
- 対象
- 飼料名
- 給与量
- 単位
- 単価
- 金額
- 給与目的
- メモ

## 反映先

C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1

## GitHub保存

確認できてから保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 53 feeding server API"
git push
```
