# Starter Pack 110 給与目安データ本反映手順

## 1. 目的

テンプレートに入力した給与目安データを、実際にFarmProで使うデータへ反映する手順です。

---

## 2. 本番データとテンプレート

本番データ:

```text
server/src/data/feedingGuide.json
```

テンプレート:

```text
server/src/data/feedingGuide_real_data_template.json
```

---

## 3. 本反映前に必ず確認

以下があることを確認します。

```text
server/src/data/feedingGuide_backup_before_real_data.json
```

なければ、先にバックアップしてください。

---

## 4. 本反映の方法

一番簡単な方法は以下です。

```text
1. feedingGuide_real_data_template.json を開く
2. 中身をすべてコピーする
3. feedingGuide.json を開く
4. 中身をすべて置き換える
5. 保存する
```

---

## 5. 反映後にserverを起動し直す

serverの黒い画面で押します。

```text
Ctrl + C
```

その後:

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1\server
npm run dev
```

clientも必要なら起動し直します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1\client
npm run dev
```

---

## 6. API確認

Chromeで開きます。

```text
http://localhost:4000/api/feeding-guide
```

入力した新しい給与目安が出ればOKです。

---

## 7. 画面確認

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

## 8. ホーム確認

```text
http://localhost:5173
```

確認すること:

```text
給与アラートが極端に増えすぎていない
注意子牛リストが表示される
```

---

## 9. 子牛カルテ確認

子牛カルテを開き、給与目安が自然に表示されるか確認します。

```text
http://localhost:5173/calves
```

---

## 10. おかしい場合の戻し方

バックアップを戻します。

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
git commit -m "Update feeding guide real data"
git push
```
