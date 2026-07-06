# Starter Pack 113 給与目安本反映後チェック

## 1. 目的

給与目安を本反映したあと、アプリ全体でおかしな表示になっていないか確認します。

---

## 2. API確認

Chromeで開きます。

```text
http://localhost:4000/api/feeding-guide
```

確認すること:

```text
新しい日齢が表示される
数値が入っている
JSONが途中で壊れていない
```

---

## 3. 給与目安画面

Chromeで開きます。

```text
http://localhost:5173/feeding-guide
```

確認すること:

```text
給与目安一覧が表示される
日齢順に見える
スターターが数字で表示される
育成配合が数字で表示される
粗飼料が数字で表示される
メモが読める
```

---

## 4. ホーム確認

```text
http://localhost:5173
```

確認すること:

```text
給与アラートが極端に増えすぎていない
注意子牛リストが表示される
エラーが出ていない
```

もしアラートが急に大量に増えた場合、給与目安の数値が厳しすぎる可能性があります。

---

## 5. 子牛カルテ確認

子牛一覧から子牛カルテを開きます。

```text
http://localhost:5173/calves
```

確認すること:

```text
給与目安が表示される
日齢に近い目安が出る
対応履歴が表示される
```

---

## 6. レポート確認

```text
http://localhost:5173/reports
```

確認すること:

```text
給与アラート集計が表示される
対応記録集計が表示される
エラーが出ていない
```

---

## 7. おかしい場合の戻し方

本反映時に自動バックアップが作られています。

例:

```text
server/src/data/feedingGuide_backup_auto_20260705_153000.json
```

戻す場合は、その中身を以下へコピーします。

```text
server/src/data/feedingGuide.json
```

Gitで戻す場合:

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git restore server/src/data/feedingGuide.json
```

---

## 8. もう一度serverを起動

戻したあと、serverを起動し直します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1\server
npm run dev
```

---

## 9. 問題なければGitHub保存

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Apply feeding guide real data"
git push
```
