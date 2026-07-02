# Starter Pack 10 レポート操作メモ

## 追加されたこと

レポート画面を追加しました。

## 見られる集計

- 登録牛数
- 子牛数
- 繁殖記録数
- ワクチン記録数
- BLV陽性頭数
- 未完了予定数
- 治療中件数
- 休薬中件数

## CSV出力

以下のデータをCSVで出力できます。

- 牛台帳
- 子牛
- 繁殖
- ワクチン
- BLV
- 予定
- 治療

## API

GET http://localhost:4000/api/reports/summary

GET http://localhost:4000/api/reports/csv/cattle
GET http://localhost:4000/api/reports/csv/calves
GET http://localhost:4000/api/reports/csv/breedings
GET http://localhost:4000/api/reports/csv/vaccines
GET http://localhost:4000/api/reports/csv/blv
GET http://localhost:4000/api/reports/csv/schedules
GET http://localhost:4000/api/reports/csv/treatments
