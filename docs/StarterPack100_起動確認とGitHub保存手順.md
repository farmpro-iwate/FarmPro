# Starter Pack 100 起動確認とGitHub保存手順

## 1. 黒い画面を2つ開く

使う黒い画面は2つです。

```text
server用
client用
```

---

## 2. serverを起動

server用の黒い画面で実行します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1\server
npm run dev
```

成功したら以下が出ます。

```text
FarmPro server running at http://localhost:4000
```

---

## 3. clientを起動

client用の黒い画面で実行します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1\client
npm run dev
```

成功したら以下が出ます。

```text
Local: http://localhost:5173/
```

---

## 4. Chromeで確認

```text
http://localhost:5173
```

ホームが表示されればOKです。

---

## 5. API確認

```text
http://localhost:4000/api/reports/summary
```

文字がたくさん出ればOKです。

---

## 6. GitHub保存

プロジェクト本体に移動します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
```

状態確認:

```bash
git status
```

保存対象に追加:

```bash
git add .
```

記録:

```bash
git commit -m "Add Starter Pack 100 final check docs"
```

GitHubへ送信:

```bash
git push
```

---

## 7. 保存できたか確認

最後に以下のような表示が出ればOKです。

```text
Everything up-to-date
```

または、

```text
Writing objects
```

```text
To https://github.com/farmpro-iwate/FarmPro
```

のような表示が出ればOKです。

---

## 8. 作業を終えるとき

server側の黒い画面で押します。

```text
Ctrl + C
```

client側の黒い画面でも押します。

```text
Ctrl + C
```

そのあと黒い画面を閉じます。

---

## 9. 次回再開するとき

次回はまたserverとclientを起動します。

server:

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1\server
npm run dev
```

client:

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1\client
npm run dev
```

Chrome:

```text
http://localhost:5173
```
