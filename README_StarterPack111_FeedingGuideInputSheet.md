# FarmPro Starter Pack 111 給与目安 実データ記入シート

## 内容

Starter Pack 111では、実際の給与目安表をFarmPro用データに整理するためのCSV記入シートを追加します。

このCSVはExcelで開けます。

## 追加ファイル

- docs/feedingGuide_real_data_input_sheet.csv
- docs/StarterPack111_給与目安実データ記入シート_確認手順.md
- docs/StarterPack111_CSVからJSONへ反映する準備.md
- README_StarterPack111_FeedingGuideInputSheet.md

## 手動追記

今回は不要です。

## アプリ画面の変更

今回はCSVとdocsのみなので、アプリ画面は変わりません。

## CSVに入っている項目

```text
日齢
月齢目安
ステージ名
スターターkg
育成配合kg
粗飼料kg
体重目安kg
体高目安cm
胸囲目安cm
代用乳・ミルク
メモ
```

## 次の候補

- Starter Pack 112：記入済みCSVを feedingGuide.json に変換
- Starter Pack 113：給与目安画面に体重・体高・胸囲を表示
- Starter Pack 114：スマホ表示の改善

## GitHub保存

確認できてから保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 111 feeding guide input sheet"
git push
```
