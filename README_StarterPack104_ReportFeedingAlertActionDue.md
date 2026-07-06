# FarmPro Starter Pack 104 レポートに対応記録期限アラート表示 追加版

## 内容

Starter Pack 104では、レポート画面に給与アラート対応記録の期限アラート集計を表示します。

Starter Pack 102で追加した server 集計を使い、レポート画面で期限切れ・今日確認・まもなく確認・再確認必要・未対応を確認できます。

## 更新ファイル

- client/src/pages/ReportPage.tsx
- docs/StarterPack104_レポート対応記録期限アラート_確認手順.md
- README_StarterPack104_ReportFeedingAlertActionDue.md

## 手動追記

今回は不要です。

## 追加されること

- レポート画面に対応記録期限アラート集計
- 期限切れ件数
- 今日確認件数
- まもなく確認件数
- 再確認必要件数
- 未対応件数
- 注意件数
- 対応記録一覧へのボタン

## 確認URL

```text
http://localhost:5173/reports
```

## API確認

```text
http://localhost:4000/api/reports/summary
```

## GitHub保存

動作確認後に保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 104 report feeding alert action due"
git push
```
