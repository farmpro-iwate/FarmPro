# Starter Pack 90 給与アラート対応記録 基本設計

## 1. 目的

給与アラートは、子牛の給与量が目安に対して不足気味・多め・実績なしになっていることを知らせます。

ただし、実際の農場管理では「見た」だけでは不十分です。

次のような対応を記録できるようにします。

```text
確認した
給与量を増やした
給与量を減らした
粗飼料を調整した
スターターを調整した
様子を見る
獣医・指導員に相談する
その他メモ
```

これにより、あとから

```text
いつ確認したか
誰が確認したか
どんな対応をしたか
その後どうなったか
```

を追いやすくします。

## 2. 追加する機能の全体像

### 2-1. 給与アラート対応記録

新しく「給与アラート対応記録」を作ります。

記録する内容は以下です。

```text
ID
対応日
子牛ID
子牛名
日齢
アラート種別
対応内容
対応メモ
次回確認日
状態
作成日時
更新日時
```

## 3. アラート種別

アラート種別は、まず以下を想定します。

```text
不足気味
多め
実績なし
生年月日なし
給与目安なし
その他
```

## 4. 対応内容

対応内容は、まず以下を想定します。

```text
確認のみ
給与量を増やした
給与量を減らした
スターターを調整
育成配合を調整
粗飼料を調整
給与実績を登録
生年月日を確認
目安表を見直し
様子を見る
相談する
その他
```

## 5. 状態

状態は以下を想定します。

```text
未対応
対応中
対応済み
様子見
再確認必要
```

## 6. JSONデータ案

保存先予定:

```text
server/src/data/feedingAlertActions.json
```

データ例:

```json
[
  {
    "id": "faa_001",
    "actionDate": "2026-07-05",
    "calfId": "calf_001",
    "calfName": "子牛A",
    "ageDays": "92",
    "alertType": "不足気味",
    "actionType": "スターターを調整",
    "memo": "スターターを0.5kg増やして様子を見る",
    "nextCheckDate": "2026-07-08",
    "status": "様子見",
    "createdAt": "2026-07-05T10:00:00.000Z",
    "updatedAt": "2026-07-05T10:00:00.000Z"
  }
]
```

## 7. server API案

次のStarter Pack 91で、以下のAPIを追加予定です。

```text
GET    /api/feeding-alert-actions
GET    /api/feeding-alert-actions/:id
POST   /api/feeding-alert-actions
PUT    /api/feeding-alert-actions/:id
DELETE /api/feeding-alert-actions/:id
```

## 8. 画面案

### 8-1. 一覧画面

URL予定:

```text
/feeding-alert-actions
```

表示内容:

```text
対応日
子牛名
アラート種別
対応内容
状態
次回確認日
メモ
編集
削除
```

### 8-2. 新規登録画面

URL予定:

```text
/feeding-alert-actions/new
```

入力内容:

```text
対応日
子牛
アラート種別
対応内容
対応メモ
次回確認日
状態
```

### 8-3. ホーム連携

ホームの注意子牛リストから、

```text
対応記録を追加
```

ボタンで新規登録画面へ移動できるようにする予定です。

## 9. レポート連携案

将来的にはレポートに以下を表示します。

```text
未対応件数
対応中件数
対応済み件数
再確認必要件数
今週の対応件数
```

## 10. CSV・印刷案

対応記録も以下に対応する予定です。

```text
CSV出力
印刷
検索・絞り込み
```

## 11. 今後のStarter Pack予定

```text
Starter Pack 91：給与アラート対応記録 server API
Starter Pack 92：給与アラート対応記録 一覧画面
Starter Pack 93：給与アラート対応記録 新規登録
Starter Pack 94：給与アラート対応記録 編集・削除
Starter Pack 95：検索・絞り込み
Starter Pack 96：CSV出力
Starter Pack 97：印刷
Starter Pack 98：ホーム注意子牛リストから対応記録追加
Starter Pack 99：レポートに対応記録集計
Starter Pack 100：仕上げ・全体確認
```
