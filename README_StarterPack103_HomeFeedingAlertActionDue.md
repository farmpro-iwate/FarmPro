# FarmPro Starter Pack 103 ホームに対応記録期限アラート表示 追加版

## 内容

Starter Pack 103では、ホーム画面に給与アラート対応記録の期限アラートを表示します。

Starter Pack 102で追加した server 集計を使い、ホームで確認漏れしやすい対応記録を見つけやすくします。

## 更新ファイル

- client/src/pages/Home.tsx
- docs/StarterPack103_ホーム対応記録期限アラート_確認手順.md
- README_StarterPack103_HomeFeedingAlertActionDue.md

## 手動追記

今回は不要です。

## 追加されること

- ホームに対応記録期限アラート
- 期限切れ件数
- 今日確認件数
- まもなく確認件数
- 再確認必要件数
- 未対応件数
- 注意が必要な対応記録一覧
- 編集画面へのボタン
- 対応記録一覧へのボタン

## 確認URL

```text
http://localhost:5173
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
git commit -m "Add Starter Pack 103 home feeding alert action due"
git push
```
