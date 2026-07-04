# FarmPro Starter Pack 48 月別収支 server API追加版

## 内容

Starter Pack 48では、月別収支のserver APIを追加します。

今回は画面はまだ追加しません。
まずはserver側で、出荷・販売データと経費データを月別に集計できるようにします。

## 追加ファイル

- server/src/routes/monthlyBalance.ts
- docs/StarterPack48_月別収支ServerAPI_確認手順.md
- README_StarterPack48_MonthlyBalanceServer.md

## 手動追記が必要なファイル

- server/src/app.ts

## 追加されるAPI

```text
GET /api/monthly-balance
```

## 集計内容

- 年月
- 売上合計
- 経費合計
- 差引収支
- 販売頭数
- 平均販売金額
- 平均販売体重
- 経費件数
- 飼料費
- 診療・医薬品費
- 繁殖費
- その他経費

## 反映先

C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1

## GitHub保存

確認できてから保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 48 monthly balance server API"
git push
```
