# Starter Pack 111 CSVからJSONへ反映する準備

## 1. 目的

記入したCSVを、FarmProが使う `feedingGuide.json` に反映する準備です。

---

## 2. CSVファイル

記入するCSV:

```text
docs/feedingGuide_real_data_input_sheet.csv
```

---

## 3. FarmProが使う本データ

FarmProが実際に読んでいる給与目安データ:

```text
server/src/data/feedingGuide.json
```

---

## 4. 反映前に必ず確認するバックアップ

以下があるか確認します。

```text
server/src/data/feedingGuide_backup_before_real_data.json
```

なければ、先に現在の `feedingGuide.json` をコピーしてバックアップします。

---

## 5. CSVからJSONへ入れる項目

CSVの列とJSONの対応は以下です。

| CSV列 | JSON項目 | 備考 |
|---|---|---|
| 日齢 | ageDays | 数字 |
| ステージ名 | stageName | 文字 |
| スターターkg | starterKg | 数字 |
| 育成配合kg | growingFeedKg | 数字 |
| 粗飼料kg | roughageKg | 数字 |
| 体重目安kg | memo | メモにまとめる |
| 体高目安cm | memo | メモにまとめる |
| 胸囲目安cm | memo | メモにまとめる |
| 代用乳・ミルク | memo | メモにまとめる |
| メモ | memo | 文章 |

---

## 6. JSONの形

FarmProの給与目安は、以下のような形です。

```json
{
  "id": "guide_real_090",
  "ageDays": "90",
  "stageName": "離乳期",
  "starterKg": "1.5",
  "growingFeedKg": "0.5",
  "roughageKg": "0.5",
  "memo": "体重目安: 90kg / 体高: 85cm / 胸囲: 105cm / 離乳後の食い込み確認"
}
```

---

## 7. CSV記入後に確認すること

```text
日齢が空欄ではない
ステージ名がある
スターターkgに単位が入っていない
育成配合kgに単位が入っていない
粗飼料kgに単位が入っていない
同じ日齢が重複していない
```

---

## 8. 次のPackでできること

CSVが埋まったら、次のPackで以下を作れます。

```text
CSVをJSONへ変換するスクリプト
変換後のfeedingGuide.json
反映確認手順
戻し方
```

これで、実際の給与目安表をFarmProに安全に入れられます。
