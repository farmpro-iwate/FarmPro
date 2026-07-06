# FarmPro Starter Pack 70 飼料給与目安表 基本設計版

## 内容

Starter Pack 70では、飼料給与目安表の基本設計を追加します。

今回は画面やAPIはまだ追加しません。
画像のような「日齢・月齢ごとの給与目安表」をFarmProに入れるための設計書です。

## 追加ファイル

- docs/StarterPack70_飼料給与目安表_基本設計.md
- README_StarterPack70_FeedingGuideDesign.md

## 手動追記

今回は不要です。

## 設計する内容

- 日齢ごとの給与目安
- 月齢ごとの給与目安
- 体重目安
- 体高目安
- 胸囲目安
- スターター給与量
- 育成配合給与量
- 粗飼料給与量
- 子牛の日齢との連動
- 実際の給与量との差の表示
- 将来のアラート化

## 今後の予定

```text
Starter Pack 71：飼料給与目安 server API
Starter Pack 72：飼料給与目安 一覧画面
Starter Pack 73：子牛の日齢から給与目安を表示
Starter Pack 74：給与目安と実績の比較
Starter Pack 75：不足・過多アラート
```

## GitHub保存

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 70 feeding guide design"
git push
```
