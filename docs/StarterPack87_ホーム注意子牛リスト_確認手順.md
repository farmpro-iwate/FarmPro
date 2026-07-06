# Starter Pack 87 ホーム注意子牛リスト 確認手順

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

ホーム画面の給与アラート内に以下が表示されればOKです。

```text
注意子牛リスト
子牛
日齢
近い目安
直近実績日
不足
多め
メモ
```

## 8. 注意子牛がない場合

以下が表示されれば正常です。

```text
注意表示する子牛はありません。
```

## 9. API確認

Chromeで開きます。

```text
http://localhost:4000/api/reports/summary
```

JSONの中に以下があればOKです。

```text
feedingAlerts
details
```

## 10. GitHub保存

確認できてから保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 87 home alert calf list"
git push
```

## 11. 白い画面になった場合

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git restore .
git clean -fd
```
