# Starter Pack 89 ホーム注意子牛リスト印刷 確認手順

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
印刷
```

## 8. 印刷確認

「印刷」を押します。

別ウィンドウで印刷用画面が開き、以下が表示されれば成功です。

```text
ホーム注意子牛リスト
印刷日時
全子牛
不足気味
多め
実績なし
子牛ごとの一覧
```

## 9. 印刷ダイアログ

印刷用画面の上部にある「印刷する」ボタンを押すと印刷ダイアログが開きます。

## 10. 開かない場合

ブラウザのポップアップがブロックされている可能性があります。

Chromeのアドレスバー右側にブロック表示が出た場合は、許可してください。

## 11. GitHub保存

確認できてから保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 89 home alert calf print"
git push
```

## 12. 白い画面になった場合

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git restore .
git clean -fd
```
