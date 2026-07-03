# FarmPro 復旧手順

## 目的

白い画面やエラーが出たとき、動いていた状態へ戻すための手順です。

## まずやること

server と client の黒い画面で、それぞれ止めます。

```text
Ctrl + C
```

次に node を完全停止します。

```bash
taskkill /F /IM node.exe
```

## Gitで元に戻す方法

プロジェクト本体へ移動します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
```

状態を確認します。

```bash
git status
```

未保存の変更を戻します。

```bash
git restore .
```

追加された不要ファイルを消します。

```bash
git clean -fd
```

## clientキャッシュ削除

画面が古いままの場合は、client の Vite キャッシュを削除します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1\client
rmdir /s /q node_modules\.vite
```

「見つかりません」と出ても問題ありません。

## 起動し直し

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

表示後に押します。

```text
Ctrl + F5
```

## 復旧できたか確認

プロジェクト本体で確認します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
```

次の表示ならOKです。

```text
nothing to commit, working tree clean
```

## 注意

エラーが出た状態では `git add .` や `git commit` はしないでください。
まず復旧してから保存します。
