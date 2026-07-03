# 毎日のバックアップ手順

## 目的

FarmProのデータを安全に残すための手順です。

FarmProは現在、server/src/data の中に JSON ファイルとしてデータを保存しています。
そのため、バックアップ機能と GitHub 保存を組み合わせると安全です。

## 毎日おすすめの流れ

### 1. アプリを開く

server と client を起動して、Chromeで開きます。

```text
http://localhost:5173
```

### 2. バックアップ画面を開く

上部メニューの「バックアップ」を開きます。

### 3. 全データバックアップをダウンロード

「全データバックアップ」または「JSONダウンロード」を押します。

保存先はわかりやすく、たとえば以下がおすすめです。

```text
C:\Users\関口\Downloads\FarmPro_Backup
```

ファイル名には日付を入れると便利です。

```text
farmpro_backup_2026-07-03.json
```

### 4. 大きな入力をした日は GitHub にも保存

牛台帳、子牛、繁殖、治療などを多く入力した日は、GitHub保存もします。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Update farm data"
git push
```

## バックアップの目安

毎日やると安心です。

最低でも、次の作業をした日はバックアップしてください。

- 牛を登録した日
- 子牛を登録した日
- 繁殖記録を入力した日
- 治療記録を入力した日
- バックアップ復元をした日
- Starter Packを反映した日

## 注意

バックアップファイルは大切なデータです。
間違って消さないように、日付つきで保管してください。
