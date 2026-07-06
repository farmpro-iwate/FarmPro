# Starter Pack 115 ホーム画面スマホ表示改善 確認手順

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

## 4. clientを起動する

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1\client
npm run dev
```

## 5. ホーム画面を確認

Chromeで開きます。

```text
http://localhost:5173
```

## 6. PCで確認すること

PCでは、今まで通り以下が表で表示されればOKです。

```text
注意が必要な対応記録
注意子牛リスト
```

## 7. スマホ幅で確認する方法

PCのChromeでも確認できます。

1. ホーム画面を開く
2. キーボードで F12 を押す
3. 左上付近のスマホ・タブレットのアイコンを押す
4. 画面幅を狭くする

## 8. スマホ表示で確認すること

スマホ幅では以下がカード表示になれば成功です。

```text
注意が必要な対応記録
注意子牛リスト
```

カードには以下が表示されます。

```text
子牛名
期限状態
優先度
次回確認日
対応内容
編集する
```

または、

```text
子牛名
日齢
近い目安
直近実績日
不足
多め
対応記録を追加
```

## 9. ボタン確認

スマホ幅で以下のボタンが押しやすく表示されればOKです。

```text
編集する
対応記録を追加
給与目安で確認
対応記録を見る
レポートで確認
```

## 10. 画面が古い場合

Chromeで押します。

```text
Ctrl + F5
```

## 11. GitHub保存

確認できてから保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 115 home smartphone layout"
git push
```

## 12. 白い画面になった場合

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git restore .
git clean -fd
```
