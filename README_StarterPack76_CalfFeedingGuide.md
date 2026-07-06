# FarmPro Starter Pack 76 子牛を選んで給与目安を自動表示 追加版

## 内容

Starter Pack 76では、飼料給与目安表に「子牛を選んで給与目安を自動表示」機能を追加します。

## 更新ファイル

- client/src/pages/FeedingGuideList.tsx
- docs/StarterPack76_子牛を選んで給与目安表示_確認手順.md
- README_StarterPack76_CalfFeedingGuide.md

## 手動追記

今回は不要です。

## 追加されること

- 子牛一覧の読み込み
- 子牛を選択
- 生年月日から日齢を自動計算
- 日齢に一番近い給与目安を自動取得
- 体重目安、給与量目安、メモを表示

## GitHub保存

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 76 calf feeding guide"
git push
```
