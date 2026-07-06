# Starter Pack 113 給与目安JSON本反映 確認手順

## 1. 目的

CSVから変換した給与目安JSONを、FarmPro本体の給与目安データへ反映します。

今回使う変換後ファイル:

```text
server/src/data/feedingGuide_from_csv.json
```

反映先:

```text
server/src/data/feedingGuide.json
```

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

## 4. 先にCSV変換が必要です

まだ以下のファイルがない場合は、先にCSV変換をします。

```text
server/src/data/feedingGuide_from_csv.json
```

CSV変換コマンド:

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
node tools/convert_feeding_guide_csv_to_json.js
```

---

## 5. 本反映コマンド

プロジェクト本体で実行します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
```

次に:

```bash
node tools/apply_feeding_guide_from_csv.js
```

---

## 6. 成功表示

以下のように表示されればOKです。

```text
現在の feedingGuide.json をバックアップしました。
給与目安データを本反映しました。
件数: 〇件
```

---

## 7. 自動バックアップ

反映前のデータは自動でバックアップされます。

例:

```text
server/src/data/feedingGuide_backup_auto_20260705_153000.json
```

このファイルがあれば、戻すことができます。

---

## 8. serverを起動し直す

serverが起動中の場合は一度止めます。

```text
Ctrl + C
```

その後:

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1\server
npm run dev
```

clientも必要なら起動します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1\client
npm run dev
```

---

## 9. API確認

Chromeで開きます。

```text
http://localhost:4000/api/feeding-guide
```

新しい給与目安が表示されればOKです。

---

## 10. 画面確認

Chromeで開きます。

```text
http://localhost:5173/feeding-guide
```

確認すること:

```text
日齢
ステージ名
スターター
育成配合
粗飼料
メモ
```

---

## 11. GitHub保存

問題なければ保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Apply feeding guide from csv"
git push
```
