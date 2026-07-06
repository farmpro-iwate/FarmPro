# FarmPro Starter Pack 90 給与アラート対応記録 基本設計

## 内容

Starter Pack 90では、給与アラート対応記録の基本設計を追加します。

これまでのStarter Packでは、給与目安と実績を比較し、不足気味・多め・実績なしを表示できるようにしました。

次の段階では、そのアラートに対して、

- 確認した
- 給与量を調整した
- 様子を見る
- 獣医・指導員に相談する
- メモを残す

といった対応履歴を残せるようにします。

## 更新ファイル

- docs/StarterPack90_給与アラート対応記録_基本設計.md
- docs/StarterPack90_給与アラート対応記録_確認手順.md
- README_StarterPack90_FeedingAlertActionDesign.md

## 手動追記

今回は不要です。

## アプリ画面の変更

今回は設計書のみなので、アプリ画面は変わりません。

## 次の予定

- Starter Pack 91：給与アラート対応記録 server API
- Starter Pack 92：給与アラート対応記録 一覧画面
- Starter Pack 93：給与アラート対応記録 新規登録
- Starter Pack 94：ホーム・給与アラートから対応記録へ連携

## GitHub保存

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 90 feeding alert action design"
git push
```
