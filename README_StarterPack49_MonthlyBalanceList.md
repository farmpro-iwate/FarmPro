# FarmPro Starter Pack 49 月別収支 一覧画面追加版

## 内容

Starter Pack 49では、月別収支の一覧画面を追加します。

Starter Pack 48で追加した `/api/monthly-balance` を使って、出荷・販売の売上と経費管理の支出を月別に表示します。

## 追加ファイル

- client/src/services/monthlyBalanceApi.ts
- client/src/pages/MonthlyBalancePage.tsx
- docs/StarterPack49_月別収支一覧画面_確認手順.md
- README_StarterPack49_MonthlyBalanceList.md

## 手動追記が必要なファイル

- client/src/App.tsx
- client/src/components/AppLayout.tsx

## 追加されること

- 月別収支画面
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
git commit -m "Add Starter Pack 49 monthly balance list"
git push
```
