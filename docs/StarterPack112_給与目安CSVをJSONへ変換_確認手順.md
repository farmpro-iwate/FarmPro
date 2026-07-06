# Starter Pack 112 給与目安CSVをJSONへ変換 確認手順

## 1. 目的

記入したCSVを、FarmProで使えるJSON形式に変換します。

今回は安全のため、本番データは上書きしません。

---

## 2. ZIPを反映する

ZIPを解凍して、中身をプロジェクト本体へ上書きコピーします。

反映先:

```text
C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
```

---

## 3. 手動追記

今回は不要です。

---

## 4. 入力CSVを確認

以下のファイルがあるか確認します。

```text
docs/feedingGuide_real_data_input_sheet.csv
```

このCSVに実際の給与目安表の数値を入力します。

---

## 5. 変換スクリプト

以下のファイルが追加されます。

```text
tools/convert_feeding_guide_csv_to_json.js
```

---

## 6. コマンドを実行

黒い画面でプロジェクト本体へ移動します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
```

変換を実行します。

```bash
node tools/convert_feeding_guide_csv_to_json.js
```

---

## 7. 成功表示

以下のように表示されればOKです。

```text
給与目安CSVをJSONへ変換しました。
出力: ...server\src\data\feedingGuide_from_csv.json
件数: 〇件
```

---

## 8. 出力ファイル

以下が作成されます。

```text
server/src/data/feedingGuide_from_csv.json
```

このファイルは確認用です。

まだ本番データではありません。

---

## 9. 中身を確認

エクスプローラーで開きます。

```text
C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1\server\src\data
```

以下のファイルをメモ帳などで開きます。

```text
feedingGuide_from_csv.json
```

確認すること:

```text
日齢が正しい
ステージ名が正しい
スターターkgが数字だけ
育成配合kgが数字だけ
粗飼料kgが数字だけ
memoに体重・体高・胸囲などが入っている
```

---

## 10. 重要な注意

今回の変換では、まだ以下は上書きしていません。

```text
server/src/data/feedingGuide.json
```

そのため、アプリ画面の給与目安はまだ変わりません。

---

## 11. 次にやること

変換結果を確認して問題なければ、次に本反映します。

```text
feedingGuide_from_csv.json
↓
feedingGuide.json
```

これは次のStarter Packで安全に進めます。

---

## 12. エラーになった場合

CSVの列名が変わっている可能性があります。

必要な列名:

```text
日齢
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

列名は変えないでください。
