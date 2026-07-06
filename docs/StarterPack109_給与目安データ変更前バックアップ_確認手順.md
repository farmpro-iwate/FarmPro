# Starter Pack 109 給与目安データ変更前バックアップ 確認手順

## 1. 目的

実際の給与目安表に合わせてデータを変更する前に、現在の給与目安データをバックアップします。

給与目安データは、ホーム・給与アラート・子牛カルテ・レポートに関係するため、変更前バックアップが大事です。

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

## 4. 追加されるバックアップ用ファイル

以下が追加されます。

```text
server/src/data/feedingGuide_backup_before_real_data.json
```

---

## 5. 大事な作業

ZIPを反映しただけでは、現在の給与目安データの完全コピーにはなりません。

現在の実データは以下にあります。

```text
server/src/data/feedingGuide.json
```

この中身をコピーして、以下へ貼り付けます。

```text
server/src/data/feedingGuide_backup_before_real_data.json
```

これで変更前バックアップになります。

---

## 6. 一番安全なコピー方法

エクスプローラーで以下を開きます。

```text
C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1\server\src\data
```

そこで、

```text
feedingGuide.json
```

をコピーして、同じ場所に貼り付けます。

貼り付け後のファイル名を変更します。

```text
feedingGuide_backup_before_real_data.json
```

これが一番簡単で安全です。

---

## 7. すでにバックアップファイルがある場合

上書きしてよいか確認してください。

心配な場合は、日付付きにします。

例:

```text
feedingGuide_backup_20260705.json
```

---

## 8. 画面確認

Chromeで開きます。

```text
http://localhost:5173/feeding-guide
```

給与目安一覧が今まで通り表示されればOKです。

---

## 9. API確認

Chromeで開きます。

```text
http://localhost:4000/api/feeding-guide
```

JSONが表示されればOKです。

---

## 10. GitHub保存

バックアップができたら、GitHubへ保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 109 feeding guide backup"
git push
```

---

## 11. 次に進む前の確認

以下がOKなら次に進めます。

```text
feedingGuide.json がある
feedingGuide_backup_before_real_data.json がある
給与目安画面が表示される
/api/feeding-guide が表示される
GitHub保存できた
```
