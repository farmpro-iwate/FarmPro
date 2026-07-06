# FarmPro Starter Pack 75 子牛の日齢から給与目安を表示 追加版

## 内容

Starter Pack 75では、飼料給与目安表に「日齢から給与目安を確認」機能を追加します。

## 更新ファイル

- client/src/pages/FeedingGuideList.tsx
- docs/StarterPack75_日齢から給与目安表示_確認手順.md
- README_StarterPack75_FeedingGuideNearest.md

## 手動追記

今回は不要です。

## 追加されること

- 日齢入力欄
- 日齢に一番近い給与目安を取得
- 近い目安の日齢・月齢・ステージを表示
- 体重目安
- 体高目安
- 胸囲目安
- スターター給与量
- 育成配合給与量
- 粗飼料給与量
- その他給与量
- メモ表示

## 使用するAPI

```text
GET /api/feeding-guide/nearest/:ageDays
```

## GitHub保存

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 75 feeding guide nearest"
git push
```
