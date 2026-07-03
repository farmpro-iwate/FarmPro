# GitHub保存手順

## 目的

FarmProの変更内容をGitHubへ保存する手順です。

Starter Packを反映したあと、表示確認ができたらGitHubへ保存します。

## 保存前に確認すること

アプリが正しく表示されていることを確認してください。

白い画面になった場合や、エラーがある場合は保存しないでください。

## 基本手順

プロジェクト本体へ移動します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
```

状態を確認します。

```bash
git status
```

変更を追加します。

```bash
git add .
```

保存メッセージをつけます。

```bash
git commit -m "Update FarmPro"
```

GitHubへ送ります。

```bash
git push
```

## Starter Packごとの保存メッセージ例

Starter Pack 23 の場合:

```bash
git commit -m "Add Starter Pack 23 backup guide"
```

データ入力後の場合:

```bash
git commit -m "Update farm data"
```

画面修正後の場合:

```bash
git commit -m "Fix FarmPro screen"
```

## よくある表示

### nothing to commit, working tree clean

```text
nothing to commit, working tree clean
```

これは、保存する変更がない状態です。
問題ありません。

### untracked files

```text
Untracked files:
```

新しいファイルが追加されています。
内容が正しければ `git add .` で追加します。

### modified

```text
modified:
```

既存ファイルが変更されています。
表示確認後に保存します。

## 重要

白い画面になった変更はGitHubに保存しないでください。
保存すると、戻すのが大変になります。

表示確認してOKになってから保存します。
