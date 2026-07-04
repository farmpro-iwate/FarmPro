# FarmPro Starter Pack 36 レポートに販売集計追加版

## 内容

Starter Pack 36では、レポート画面に出荷・販売の集計を追加します。

## 更新ファイル

- server/src/routes/reports.ts
- client/src/pages/ReportPage.tsx
- docs/StarterPack36_レポート販売集計_確認手順.md

## 追加されること

レポート画面に以下を追加します。

- 販売件数
- 販売金額合計
- 販売済み頭数
- 平均販売金額
- 平均販売体重
- 出荷予定件数
- 出荷済み件数
- 取消件数

## 反映先

C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1

## 注意

既存のレポート機能を更新します。
反映後に白い画面になった場合は、すぐにGitで戻してください。

## GitHub保存

確認できてから保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 36 sales report summary"
git push
```
