# Starter Pack 90 給与アラート対応記録 基本設計 確認手順

## 1. ZIPを反映する

ZIPを解凍して、中身をプロジェクト本体へ上書きコピーします。

反映先:

```text
C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
```

## 2. 手動追記

今回は不要です。

## 3. アプリ起動

今回は設計書のみなので、server/client の起動確認は必須ではありません。

すでに起動中なら、そのままでOKです。

## 4. 確認するファイル

以下のファイルが追加されていればOKです。

```text
docs/StarterPack90_給与アラート対応記録_基本設計.md
docs/StarterPack90_給与アラート対応記録_確認手順.md
README_StarterPack90_FeedingAlertActionDesign.md
```

## 5. アプリ画面

今回は画面変更はありません。

そのため、ホーム画面や給与目安画面が変わらなくても正常です。

## 6. 次に作るもの

次は server API を追加します。

```text
Starter Pack 91：給与アラート対応記録 server API
```

予定API:

```text
GET    /api/feeding-alert-actions
GET    /api/feeding-alert-actions/:id
POST   /api/feeding-alert-actions
PUT    /api/feeding-alert-actions/:id
DELETE /api/feeding-alert-actions/:id
```

## 7. GitHub保存

確認できてから保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 90 feeding alert action design"
git push
```
