# FarmPro Starter Pack 110 給与目安データ更新用テンプレート

## 内容

Starter Pack 110では、実際の給与目安表に合わせてデータを整理するためのテンプレートを追加します。

今回は、現在使っている `feedingGuide.json` は上書きしません。

安全のため、まず別ファイルとしてテンプレートを追加します。

## 追加ファイル

- server/src/data/feedingGuide_real_data_template.json
- docs/StarterPack110_給与目安データ更新テンプレート_確認手順.md
- docs/StarterPack110_給与目安データ入力作業表.md
- docs/StarterPack110_給与目安データ本反映手順.md
- README_StarterPack110_FeedingGuideRealDataTemplate.md

## 手動追記

今回は不要です。

## アプリ画面の変更

今回はテンプレート追加なので、アプリ画面は変わりません。

## 大事な注意

今回追加するファイルは以下です。

```text
server/src/data/feedingGuide_real_data_template.json
```

このファイルはまだアプリ本体では使いません。

実際に使うファイルは以下です。

```text
server/src/data/feedingGuide.json
```

実際の表の数値を確認してから、次の段階で本反映します。

## 次の候補

- Starter Pack 111：実際の表をもとに feedingGuide.json を本更新
- Starter Pack 112：給与目安画面に体重・体高・胸囲メモを見やすく表示
- Starter Pack 113：スマホ表示の改善

## GitHub保存

確認できてから保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 110 feeding guide real data template"
git push
```
