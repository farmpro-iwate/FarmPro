# FarmPro Starter Pack 83 レポートに給与アラート集計追加版

## 内容

Starter Pack 83では、レポート画面に給与アラート集計を追加します。

飼料給与目安表、子牛、飼料給与実績から、全子牛の給与アラート状況を集計します。

## 更新ファイル

- server/src/routes/reports.ts
- client/src/pages/ReportPage.tsx
- docs/StarterPack83_レポート給与アラート集計_確認手順.md
- README_StarterPack83_ReportFeedingAlerts.md

## 手動追記

今回は不要です。

## 追加されること

- レポートAPIに給与アラート集計を追加
- 全子牛数
- 給与目安あり頭数
- 実績なし頭数
- 不足気味の子牛数
- 多めの子牛数
- 概ね良好の子牛数
- レポート画面に給与アラートカード表示

## 使用するデータ

- server/src/data/calves.json
- server/src/data/feedings.json
- server/src/data/feedingGuide.json

## API確認

```text
http://localhost:4000/api/reports/summary
```

## GitHub保存

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 83 report feeding alerts"
git push
```
