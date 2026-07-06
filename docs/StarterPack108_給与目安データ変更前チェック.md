# Starter Pack 108 給与目安データ変更前チェック

## 1. 目的

給与目安データを変更する前に、必ずバックアップと確認を行います。

---

## 2. 変更前に確認するファイル

給与目安データはここにあります。

```text
server/src/data/feedingGuide.json
```

---

## 3. 変更前バックアップ

手動でバックアップする場合は、以下のファイルをコピーします。

```text
server/src/data/feedingGuide.json
```

おすすめのコピー名:

```text
feedingGuide_backup_before_real_data.json
```

保存場所:

```text
server/src/data
```

---

## 4. GitHub保存

変更前の状態をGitHubに保存しておくと安心です。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Backup before feeding guide real data update"
git push
```

---

## 5. 現在の目安を画面で確認

Chromeで開きます。

```text
http://localhost:5173/feeding-guide
```

以下を確認します。

```text
登録件数
日齢
ステージ名
スターター
育成配合
粗飼料
メモ
```

---

## 6. 置き換え前に決めること

実際の表を見ながら、以下を決めます。

```text
何日齢ごとに登録するか
スターターをどの列から取るか
育成配合をどの列から取るか
粗飼料をどの列から取るか
体重・体高・胸囲をメモに入れるか
```

---

## 7. 作業メモ表

以下の表に整理してから入力すると安全です。

| 日齢 | ステージ名 | スターターkg | 育成配合kg | 粗飼料kg | メモ |
|---:|---|---:|---:|---:|---|
| 0 | 出生直後 | 0 | 0 | 0 | 代用乳中心 |
| 30 | 哺乳期 | 0.2 | 0 | 0 | スターター慣らし |
| 60 | 離乳準備 | 1.0 | 0 | 0.2 | 水・粗飼料確認 |
| 90 | 離乳期 | 1.5 | 0.5 | 0.5 | 離乳後の食い込み確認 |

※上の数値は例です。実際の表に合わせてください。

---

## 8. 変更後の確認

変更したら、以下を確認します。

```text
http://localhost:5173/feeding-guide
```

確認すること:

```text
日齢が正しい
数値が正しい
単位が混ざっていない
メモが読める
子牛選択で近い目安が出る
ホームの給与アラートが極端に増えすぎていない
```

---

## 9. 失敗した場合の戻し方

GitHubに保存済みなら戻せます。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git restore .
git clean -fd
```

または、バックアップしたファイルを戻します。

```text
feedingGuide_backup_before_real_data.json
↓ 名前を feedingGuide.json に戻す
```

---

## 10. 次に作るもの

次は安全に以下を作るのがおすすめです。

```text
Starter Pack 109：給与目安データ変更前バックアップ
```

その後に実際の数値へ更新します。
