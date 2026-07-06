# Starter Pack 88 ホーム注意子牛リストCSV出力 確認手順

## 1. ZIPを反映する

ZIPを解凍して、中身をプロジェクト本体へ上書きコピーします。

反映先:

```text
C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
```

## 2. 手動追記

今回は不要です。

## 3. serverを起動する

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1\server
npm run dev
```

## 4. clientを起動し直す

client側の黒い画面で一度止めます。

```text
Ctrl + C
```

その後、もう一度起動します。

```bash
npm run dev
```

## 5. ホーム画面を開く

```text
http://localhost:5173
```

## 6. 強制更新

Chromeでホーム画面を開いた状態で押します。

```text
Ctrl + F5
```

## 7. 確認すること

ホーム画面の「注意子牛リスト」の右側に以下が表示されればOKです。

```text
CSV出力
```

## 8. CSV出力確認

「CSV出力」を押します。

次のようなファイルがダウンロードされれば成功です。

```text
ホーム注意子牛リスト_20260705.csv
```

## 9. CSVの中身

CSVには以下が入ります。

```text
子牛
生年月日
日齢
近い目安日齢
近い目安ステージ
直近実績日
不足件数
多め件数
良好件数
注意メモ
```

## 10. GitHub保存

確認できてから保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 88 home alert calf csv"
git push
```

## 11. 白い画面になった場合

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git restore .
git clean -fd
```
