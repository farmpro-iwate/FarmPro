# Starter Pack 117 繁殖API 項目一覧

## 1. 目的

強化した繁殖APIで扱う項目を整理します。

---

## 2. 基本項目

| 項目 | 内容 |
|---|---|
| id | 繁殖記録ID |
| cowId | 母牛ID |
| cowName | 母牛名 |
| breedingType | 繁殖区分 |
| serviceDate | 実施日 |
| expectedCalvingDate | 分娩予定日 |
| pregnancyCheckDate | 妊娠鑑定予定日 |
| pregnancyCheckActualDate | 妊娠鑑定実施日 |
| pregnancyResult | 妊娠鑑定結果 |
| status | 状態 |
| memo | メモ |

---

## 3. 繁殖区分

```text
人工授精
自然交配
受精卵移植
その他
```

---

## 4. 人工授精で使う項目

```text
sireName
semenNo
inseminatorName
```

表示名:

```text
種雄牛
精液番号
授精師
```

---

## 5. 自然交配で使う項目

```text
sireName
matingStartDate
matingEndDate
```

表示名:

```text
種雄牛
同居開始日
同居終了日
```

---

## 6. 受精卵移植で使う項目

```text
donorCowId
donorCowName
sireName
embryoNo
embryoType
embryoRank
transferOperatorName
```

表示名:

```text
ドナー牛ID
ドナー牛名
種雄牛
受精卵番号
新鮮卵 / 凍結卵
受精卵ランク
移植者
```

---

## 7. 妊娠鑑定結果

```text
未鑑定
妊娠
不受胎
再確認
流産
不明
```

---

## 8. 状態

```text
実施済み
鑑定待ち
妊娠
不受胎
再確認
分娩済み
中止
```

---

## 9. 自動計算

## 9-1. 分娩予定日

実施日から自動計算します。

```text
実施日 + 285日
```

## 9-2. 妊娠鑑定予定日

実施日から自動計算します。

```text
実施日 + 40日
```

必要に応じて画面側で変更できるようにします。

---

## 10. API一覧

## 一覧取得

```text
GET /api/breeding
```

## 詳細取得

```text
GET /api/breeding/:id
```

## 新規登録

```text
POST /api/breeding
```

## 更新

```text
PUT /api/breeding/:id
```

## 削除

```text
DELETE /api/breeding/:id
```

## アラート

```text
GET /api/breeding/alerts
```

---

## 11. アラート内容

現在のserver APIでは以下を返します。

```text
妊娠鑑定期限切れ
妊娠鑑定今日
分娩予定日超過
```

今後追加したいアラート:

```text
妊娠鑑定まもなく
分娩予定日まもなく
不受胎後の再種付未登録
分娩予定後の分娩記録未登録
```
