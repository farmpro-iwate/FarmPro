# Starter Pack 101 対応記録期限アラート 確認手順

## 1. ZIPを反映する

ZIPを解凍して、中身をプロジェクト本体へ上書きコピーします。

反映先:

```text
C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
```

## 2. 手動追記

今回は不要です。

## 3. アプリ画面

今回は設計書のみなので、アプリ画面は変わりません。

ホーム画面やレポート画面が変わらなくても正常です。

## 4. 確認するファイル

以下のファイルが追加されていればOKです。

```text
docs/StarterPack101_対応記録期限アラート_基本設計.md
docs/StarterPack101_対応記録期限アラート_確認手順.md
README_StarterPack101_FeedingAlertActionDueDesign.md
```

## 5. 次に作るもの

次は server 側で期限アラート集計を追加します。

```text
Starter Pack 102：対応記録期限アラート server集計
```

追加予定:

```text
feedingAlertActionDueAlerts
期限切れ
今日確認
まもなく確認
再確認必要
未対応
```

## 6. GitHub保存

確認できてから保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 101 feeding alert action due design"
git push
```
