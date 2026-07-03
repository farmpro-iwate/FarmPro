# Starter Pack 27 出荷・販売APIメモ

## 目的

出荷・販売管理を将来追加するため、server側にAPIを追加する準備です。

## 追加ファイル

```text
server/src/data/sales.json
server/src/routes/sales.ts
```

## API案

```text
GET    /api/sales
GET    /api/sales/:id
POST   /api/sales
PUT    /api/sales/:id
DELETE /api/sales/:id
```

## データ保存先

```text
server/src/data/sales.json
```

## データ項目

```text
id
targetType
targetNumber
targetName
sex
birthday
motherName
shippingPlanDate
shippingDate
saleDate
buyer
marketName
saleWeight
salePrice
status
reason
memo
createdAt
updatedAt
```

## 状態

```text
出荷予定
出荷済み
販売済み
取消
```

## 対象区分

```text
子牛
成牛
その他
```

## 注意

今回のStarter Pack 27では、client画面は追加していません。

理由:

- 白い画面トラブルを避けるため
- server側だけ先に安全確認するため
- 次のStarter Packで画面を小さく追加するため
