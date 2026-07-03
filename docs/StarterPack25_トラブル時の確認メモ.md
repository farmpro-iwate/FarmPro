# FarmPro トラブル時の確認メモ

## 目的

白い画面、起動しない、保存できないなどのトラブルが出たときに確認する手順です。

---

# 1. 白い画面になった場合

## まずやること

Chromeで強制更新します。

```text
Ctrl + F5
```

変わらない場合は、server と client を止めます。

```text
Ctrl + C
```

node を完全停止します。

```bash
taskkill /F /IM node.exe
```

## Gitで戻す

プロジェクト本体で実行します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git restore .
git clean -fd
```

## clientキャッシュ削除

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1\client
rmdir /s /q node_modules\.vite
```

見つかりません、と出ても問題ありません。

---

# 2. server が起動しない場合

## 正しい場所か確認

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1\server
```

```bash
npm run dev
```

成功表示:

```text
FarmPro server running at http://localhost:4000
```

## ポート4000使用中の場合

```bash
taskkill /F /IM node.exe
```

その後、もう一度 server を起動します。

---

# 3. client が起動しない場合

## 正しい場所か確認

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1\client
```

```bash
npm run dev
```

成功表示:

```text
Local: http://localhost:5173/
```

---

# 4. 保存できない場合

server が止まっている可能性があります。

server側で次の表示が出ているか確認します。

```text
FarmPro server running at http://localhost:4000
```

出ていなければ、server を起動します。

---

# 5. GitHub保存でエラーが出た場合

まずプロジェクト本体にいるか確認します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
```

`not a git repository` と出る場合は、フォルダの場所が違います。

正しい場所:

```text
C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
```

---

# 6. ZIPを反映したのに変わらない場合

確認すること:

- 上書き先が正しいか
- ZIPの中身だけをコピーしたか
- clientを再起動したか
- Chromeで Ctrl + F5 を押したか

---

# 7. やってはいけないこと

## エラー中にGitHub保存しない

白い画面やエラーがある状態で、次を実行しないでください。

```bash
git add .
git commit
git push
```

まず復旧してから保存します。

## いろいろなZIPを重ねて入れない

うまくいかない時に、複数のZIPを何度も重ねると原因がわかりにくくなります。

一度 Git で戻してから、次の作業に進みます。

---

# 8. 困った時に見る画面

エラーが出たら、次の画面を確認します。

- serverの黒い画面
- clientの黒い画面
- ChromeのConsole画面
- git status の結果

スクリーンショットを残すと原因確認がしやすいです。
