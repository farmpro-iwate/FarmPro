# Starter Pack 85 レポート給与アラート印刷 確認手順

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

## 5. レポート画面を開く

```text
http://localhost:5173/reports
```

## 6. 確認すること

「給与アラート集計」の右側に、以下のボタンが表示されればOKです。

```text
CSV出力
印刷
```

## 7. 印刷確認

「印刷」を押します。

別ウィンドウで印刷用画面が開き、以下が表示されれば成功です。

```text
レポート給与アラート集計
印刷日時
全子牛
不足気味
多め
実績なし
子牛ごとの一覧
```

## 8. 印刷ダイアログ

印刷用画面の上部にある「印刷する」ボタンを押すと印刷ダイアログが開きます。

## 9. 開かない場合

ブラウザのポップアップがブロックされている可能性があります。

Chromeのアドレスバー右側にブロック表示が出た場合は、許可してください。

## 10. GitHub保存

確認できてから保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 85 report feeding alert print"
git push
```

## 11. 白い画面になった場合

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git restore .
git clean -fd
```
