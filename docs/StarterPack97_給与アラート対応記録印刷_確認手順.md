# Starter Pack 97 給与アラート対応記録 印刷 確認手順

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

## 5. 一覧画面を開く

Chromeで開きます。

```text
http://localhost:5173/feeding-alert-actions
```

## 6. 確認すること

一覧画面の上部に以下が表示されればOKです。

```text
印刷
```

## 7. 印刷確認

「印刷」を押します。

別ウィンドウで印刷用画面が開き、以下が表示されれば成功です。

```text
給与アラート対応記録
印刷日時
表示件数
絞り込み条件
一覧表
```

## 8. 絞り込み後の印刷確認

アラート種別や状態で絞り込みしてから印刷してください。

画面に表示されている記録だけ印刷用画面に出れば成功です。

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
git commit -m "Add Starter Pack 97 feeding alert action print"
git push
```

## 12. 白い画面になった場合

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git restore .
git clean -fd
```
