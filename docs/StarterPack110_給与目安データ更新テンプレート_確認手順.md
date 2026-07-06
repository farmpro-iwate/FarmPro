# Starter Pack 110 給与目安データ更新テンプレート 確認手順

## 1. 目的

実際の給与目安表に合わせてデータを変更する前に、入力用テンプレートを用意します。

今回はアプリで使っている本データは上書きしません。

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

## 4. 追加されるテンプレート

以下のファイルが追加されます。

```text
server/src/data/feedingGuide_real_data_template.json
```

---

## 5. アプリ画面

今回はテンプレート追加だけなので、アプリ画面は変わりません。

現在の給与目安画面は今まで通りです。

```text
http://localhost:5173/feeding-guide
```

---

## 6. テンプレートの使い方

実際の表を見ながら、以下を埋めます。

```text
ageDays
stageName
starterKg
growingFeedKg
roughageKg
memo
```

例:

```json
{
  "id": "guide_real_090",
  "ageDays": "90",
  "stageName": "離乳期",
  "starterKg": "1.5",
  "growingFeedKg": "0.5",
  "roughageKg": "0.5",
  "memo": "体重目安: 90kg / 離乳後の食い込み確認"
}
```

---

## 7. 注意

kgなどの単位は入れません。

よい例:

```text
1.5
```

避ける例:

```text
1.5kg
1.5キロ
```

---

## 8. 本反映はまだしない

今回のテンプレートはまだ本番データではありません。

本番で使うファイル:

```text
server/src/data/feedingGuide.json
```

テンプレート:

```text
server/src/data/feedingGuide_real_data_template.json
```

実際の表の数値が整理できてから、次のPackで本反映します。

---

## 9. GitHub保存

確認できてから保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 110 feeding guide real data template"
git push
```
