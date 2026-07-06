# FarmPro Starter Pack 101 給与アラート対応記録 期限アラート 基本設計

## 内容

Starter Pack 101では、給与アラート対応記録の「期限アラート」基本設計を追加します。

対応記録には `次回確認日` と `状態` があるため、これを使って以下を見つけやすくします。

- 次回確認日が近い記録
- 次回確認日を過ぎた記録
- 再確認必要の記録
- 未対応のまま残っている記録

## 追加ファイル

- docs/StarterPack101_対応記録期限アラート_基本設計.md
- docs/StarterPack101_対応記録期限アラート_確認手順.md
- README_StarterPack101_FeedingAlertActionDueDesign.md

## 手動追記

今回は不要です。

## アプリ画面の変更

今回は docs のみなので、アプリ画面は変わりません。

## 次の予定

- Starter Pack 102：対応記録期限アラート server集計
- Starter Pack 103：ホームに期限アラート表示
- Starter Pack 104：レポートに期限アラート表示
- Starter Pack 105：期限アラートCSV・印刷

## GitHub保存

確認できてから保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 101 feeding alert action due design"
git push
```
