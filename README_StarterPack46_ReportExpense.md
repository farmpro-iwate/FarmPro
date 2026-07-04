# FarmPro Starter Pack 46 レポートに経費集計追加版

## 内容

Starter Pack 46では、レポート画面に経費集計を追加します。

## 更新ファイル

- server/src/routes/reports.ts
- client/src/pages/ReportPage.tsx
- docs/StarterPack46_レポート経費集計_確認手順.md
- README_StarterPack46_ReportExpense.md

## 追加されること

レポート画面に以下を追加します。

- 経費件数
- 経費合計
- 飼料費合計
- 診療・医薬品費合計
- 繁殖費合計
- その他経費合計
- 経費CSV出力

## 手動追記

今回は不要です。

## 注意

server/src/routes/reports.ts を更新します。
もしserverが起動しない場合は、黒い画面のエラーを確認してください。

## 反映先

C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1

## GitHub保存

確認できてから保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 46 expense report summary"
git push
```
