# Starter Pack 111 給与目安 実データ記入シート 確認手順

## 1. 目的

実際の給与目安表を、FarmProに入れやすい形へ整理します。

今回はアプリ本体のデータは変更しません。

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

## 4. 追加されるCSV

以下のファイルが追加されます。

```text
docs/feedingGuide_real_data_input_sheet.csv
```

---

## 5. CSVを開く

エクスプローラーで以下を開きます。

```text
C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1\docs
```

その中の以下をダブルクリックします。

```text
feedingGuide_real_data_input_sheet.csv
```

Excelで開けます。

---

## 6. 入力する項目

実際の表を見ながら、以下を入力します。

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

---

## 7. 重要な入力ルール

kgやcmなどの単位は、列名に入っています。

そのため、セルには数字だけ入力します。

よい例:

```text
1.5
85
105
```

避ける例:

```text
1.5kg
85cm
105センチ
```

---

## 8. 空欄でもよい項目

まだ分からない場合は、以下は空欄でも大丈夫です。

```text
体重目安kg
体高目安cm
胸囲目安cm
代用乳・ミルク
メモ
```

ただし、給与アラートに使うため、以下はできるだけ入力します。

```text
スターターkg
育成配合kg
粗飼料kg
```

---

## 9. アプリ画面

今回はCSV追加だけなので、アプリ画面は変わりません。

現在の給与目安はそのままです。

```text
http://localhost:5173/feeding-guide
```

---

## 10. 次にやること

CSVに実際の表の数値を入力したあと、次に以下を行います。

```text
CSVをfeedingGuide.jsonへ変換
FarmProの給与目安として反映
画面で確認
ホームの給与アラート確認
子牛カルテ確認
```

---

## 11. GitHub保存

CSVを追加した状態を保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 111 feeding guide input sheet"
git push
```
