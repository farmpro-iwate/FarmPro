# FarmPro Starter Pack 78 給与目安と実績比較 追加版

## 内容

Starter Pack 78では、飼料給与目安表に「給与目安と実績比較」機能を追加します。

子牛を選択すると、生年月日から日齢を計算し、近い給与目安を表示します。
さらに、飼料給与実績から同じ子牛の記録を探し、目安量との差を表示します。

## 更新ファイル

- client/src/pages/FeedingGuideList.tsx
- docs/StarterPack78_給与目安と実績比較_確認手順.md
- README_StarterPack78_FeedingGuideCompare.md

## 手動追記

今回は不要です。

## 追加されること

- 飼料給与実績データの読み込み
- 選択した子牛の給与実績を検索
- スターターの目安と実績比較
- 育成配合の目安と実績比較
- 粗飼料の目安と実績比較
- 不足・多め・ちょうどよいの表示
- 実績がない場合の案内表示

## 使用するAPI

```text
GET /api/calves
GET /api/feedings
GET /api/feeding-guide/nearest/:ageDays
```

## GitHub保存

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 78 feeding guide comparison"
git push
```
