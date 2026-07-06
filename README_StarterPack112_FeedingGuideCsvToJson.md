# FarmPro Starter Pack 112 給与目安CSVをJSONへ変換

## 内容

Starter Pack 112では、記入した給与目安CSVをFarmPro用JSONへ変換するスクリプトを追加します。

今回は本番データ `feedingGuide.json` は上書きしません。

安全のため、変換結果は以下へ出力します。

```text
server/src/data/feedingGuide_from_csv.json
```

## 追加ファイル

- tools/convert_feeding_guide_csv_to_json.js
- docs/StarterPack112_給与目安CSVをJSONへ変換_確認手順.md
- docs/StarterPack112_変換後JSONを本反映する手順.md
- README_StarterPack112_FeedingGuideCsvToJson.md

## 入力ファイル

```text
docs/feedingGuide_real_data_input_sheet.csv
```

## 出力ファイル

```text
server/src/data/feedingGuide_from_csv.json
```

## 手動追記

今回は不要です。

## アプリ画面の変更

今回は変換スクリプト追加なので、アプリ画面は変わりません。

## 実行コマンド

プロジェクト本体で実行します。

```bash
node tools/convert_feeding_guide_csv_to_json.js
```

## 次の候補

- Starter Pack 113：変換後JSONを feedingGuide.json に本反映
- Starter Pack 114：給与目安画面に体重・体高・胸囲メモを見やすく表示
- Starter Pack 115：スマホ表示の改善

## GitHub保存

確認できてから保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 112 feeding guide csv to json"
git push
```
