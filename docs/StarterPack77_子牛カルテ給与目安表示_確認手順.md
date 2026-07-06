# Starter Pack 77 子牛カルテ給与目安表示 確認手順

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

## 5. 子牛一覧を開く

```text
http://localhost:5173/calves
```

## 6. 子牛カルテを開く

子牛一覧から詳細・カルテを開きます。

画面に以下が表示されればOKです。

```text
日齢から見た給与目安
現在日齢
近い目安
体重目安
スターター
育成配合
粗飼料
```

## 7. 生年月日がない場合

以下のような表示が出れば正常です。

```text
この子牛には生年月日が登録されていないため、給与目安を自動表示できません。
```

## 8. エラーになった場合

現在の子牛カルテ画面ファイル名が `client/src/pages/CalfDetail.tsx` ではない可能性があります。

その場合は、まず戻します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git restore .
git clean -fd
```

その後、実際の子牛カルテファイル名を確認して修正版を作ります。

## 9. API確認

Chromeで以下を確認します。

```text
http://localhost:4000/api/feeding-guide/nearest/92
```

データが1件表示されれば、給与目安APIは正常です。

## 10. GitHub保存

確認できてから保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 77 calf detail feeding guide"
git push
```
