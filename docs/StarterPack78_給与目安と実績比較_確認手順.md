# Starter Pack 78 給与目安と実績比較 確認手順

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
子牛を選んで給与目安・実績を確認
子牛を選択
目安と実績を確認
```

## 7. 子牛を選択する

子牛を選んで「目安と実績を確認」を押します。

以下が表示されれば成功です。

```text
子牛に該当する給与目安
給与目安と実績比較
スターター
育成配合
粗飼料
不足気味
多め
ちょうどよい
```

## 8. 実績がない場合

以下の表示が出れば正常です。

```text
この子牛の飼料給与実績がまだ見つかりません。
```

この場合は、飼養管理でその子牛の給与実績を登録すると比較できます。

## 9. API確認

Chromeで確認できます。

```text
http://localhost:4000/api/feedings
```

飼料給与実績が表示されるか確認します。

```text
http://localhost:4000/api/feeding-guide/nearest/92
```

給与目安APIも確認できます。

## 10. GitHub保存

確認できてから保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 78 feeding guide comparison"
git push
```

## 11. 白い画面になった場合

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git restore .
git clean -fd
```
