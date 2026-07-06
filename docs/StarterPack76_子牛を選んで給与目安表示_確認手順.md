# Starter Pack 76 子牛を選んで給与目安表示 確認手順

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

## 5. 飼料給与目安画面を開く

```text
http://localhost:5173/feeding-guide
```

## 6. 確認すること

画面上部に以下が表示されればOKです。

```text
子牛を選んで給与目安を確認
子牛を選択
子牛の目安を確認
```

## 7. 子牛選択テスト

子牛管理に生年月日が入っている子牛がいる場合、子牛を選択して「子牛の目安を確認」を押します。

以下が表示されれば成功です。

```text
選択中
生年月日
日齢
子牛に該当する給与目安
体重目安
スターター
育成配合
粗飼料
```

## 8. 子牛が出ない場合

子牛管理に子牛がまだ登録されていない可能性があります。

この場合は、まず子牛管理で生年月日つきの子牛を登録してください。

## 9. 直接入力も確認

下の「日齢を直接入力して確認」で、次を入力します。

```text
92
```

90日付近の目安が表示されればOKです。

## 10. API確認

Chromeで開きます。

```text
http://localhost:4000/api/calves
```

子牛一覧が表示されるか確認します。

次も確認できます。

```text
http://localhost:4000/api/feeding-guide/nearest/92
```

## 11. GitHub保存

確認できてから保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 76 calf feeding guide"
git push
```
