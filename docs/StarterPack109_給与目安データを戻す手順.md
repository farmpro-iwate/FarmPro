# Starter Pack 109 給与目安データを戻す手順

## 1. 目的

実際の給与目安表に合わせてデータを変更したあと、

```text
数値を間違えた
画面のアラートが多すぎる
元に戻したい
```

となった場合に戻す手順です。

---

## 2. 戻す対象

現在使われている給与目安データ:

```text
server/src/data/feedingGuide.json
```

バックアップ:

```text
server/src/data/feedingGuide_backup_before_real_data.json
```

---

## 3. エクスプローラーで戻す方法

以下のフォルダを開きます。

```text
C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1\server\src\data
```

次に、

```text
feedingGuide_backup_before_real_data.json
```

をコピーします。

コピーしたファイル名を以下に変更します。

```text
feedingGuide.json
```

既存の `feedingGuide.json` を上書きします。

---

## 4. Gitで戻す方法

GitHub保存前なら、以下で戻せます。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git restore server/src/data/feedingGuide.json
```

全体を戻す場合:

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git restore .
git clean -fd
```

---

## 5. 戻したあとに確認する画面

Chromeで開きます。

```text
http://localhost:5173/feeding-guide
```

以下を確認します。

```text
給与目安一覧が表示される
日齢が戻っている
スターター・育成配合・粗飼料の数値が戻っている
```

---

## 6. API確認

Chromeで開きます。

```text
http://localhost:4000/api/feeding-guide
```

JSONが表示されればOKです。

---

## 7. server再起動が必要な場合

表示が変わらない場合は、serverを起動し直します。

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

## 8. 注意

バックアップファイルを作る前に変更してしまうと、戻すのが大変になります。

そのため、給与目安を変更する前には必ずバックアップします。
