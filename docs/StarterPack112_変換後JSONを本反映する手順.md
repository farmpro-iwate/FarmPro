# Starter Pack 112 変換後JSONを本反映する手順

## 1. 目的

CSVから変換したJSONを、実際にFarmProが使う給与目安データへ反映する手順です。

---

## 2. 変換後ファイル

```text
server/src/data/feedingGuide_from_csv.json
```

---

## 3. 本番ファイル

```text
server/src/data/feedingGuide.json
```

---

## 4. 本反映前に必ず確認

以下のバックアップがあることを確認します。

```text
server/src/data/feedingGuide_backup_before_real_data.json
```

---

## 5. 手動で反映する方法

一番分かりやすい方法です。

```text
1. feedingGuide_from_csv.json を開く
2. 中身をすべてコピーする
3. feedingGuide.json を開く
4. 中身をすべて置き換える
5. 保存する
```

---

## 6. 反映後にserverを起動し直す

serverの黒い画面で押します。

```text
Ctrl + C
```

その後:

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1\server
npm run dev
```

---

## 7. API確認

Chromeで開きます。

```text
http://localhost:4000/api/feeding-guide
```

新しい給与目安が表示されればOKです。

---

## 8. 画面確認

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

## 9. ホーム確認

```text
http://localhost:5173
```

確認すること:

```text
給与アラートが極端に増えすぎていない
注意子牛リストが表示される
```

---

## 10. おかしい場合の戻し方

バックアップから戻します。

```text
feedingGuide_backup_before_real_data.json
```

の中身を、

```text
feedingGuide.json
```

へコピーします。

Gitで戻す場合:

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git restore server/src/data/feedingGuide.json
```

---

## 11. 問題なければGitHub保存

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Update feeding guide from csv"
git push
```
