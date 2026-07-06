# FarmPro Starter Pack 80 全子牛の給与アラート一覧 追加版

## 内容

Starter Pack 80では、飼料給与目安表に「全子牛の給与アラート一覧」を追加します。

子牛全頭について、生年月日から日齢を計算し、給与目安と直近の飼料給与実績を比較します。
不足気味・多め・ちょうどよいを一覧で見られるようにします。

## 更新ファイル

- client/src/pages/FeedingGuideList.tsx
- docs/StarterPack80_全子牛給与アラート一覧_確認手順.md
- README_StarterPack80_AllCalfFeedingAlerts.md

## 手動追記

今回は不要です。

## 追加されること

- 全子牛の給与アラート一覧
- 子牛名
- 生年月日
- 日齢
- 近い給与目安
- 直近実績日
- 不足気味件数
- 多め件数
- ちょうどよい件数
- 注意メモ

## 使用するAPI

```text
GET /api/calves
GET /api/feedings
GET /api/feeding-guide
GET /api/feeding-guide/nearest/:ageDays
```

## GitHub保存

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 80 all calf feeding alerts"
git push
```
