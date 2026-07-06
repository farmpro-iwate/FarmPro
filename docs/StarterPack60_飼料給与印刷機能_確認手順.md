# Starter Pack 60 飼料給与印刷機能 確認手順

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

## 5. 飼養管理画面を開く

```text
http://localhost:5173/feedings
```

## 6. 確認すること

画面右上に以下が表示されればOKです。

```text
印刷
CSV出力
新規登録
```

## 7. 印刷テスト

飼料給与データが1件以上ある状態で「印刷」を押します。

ブラウザの印刷画面が開けばOKです。

## 8. PDF保存テスト

印刷画面でプリンターを「PDFに保存」や「Microsoft Print to PDF」にします。

PDFとして保存できればOKです。

## 9. 絞り込み後印刷テスト

検索や日付絞り込みをした状態で印刷します。

表示中のデータだけ印刷対象になればOKです。

## 10. GitHub保存

確認できてから保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 60 feeding print"
git push
```

## 11. 白い画面になった場合

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git restore .
git clean -fd
```
