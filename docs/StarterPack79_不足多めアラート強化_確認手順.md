# Starter Pack 79 不足・多めアラート強化 確認手順

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
判定まとめ
不足気味
多め
ちょうどよい
注意ポイント
```

## 7. 子牛を選択する

子牛を選んで「目安と実績を確認」を押します。

飼料給与実績がある場合、次のように表示されれば成功です。

```text
不足気味：0件
多め：1件
ちょうどよい：2件
```

または、

```text
不足気味：スターター
多め：粗飼料
ちょうどよい：育成配合
```

のような注意ポイントが表示されます。

## 8. 実績がない場合

以下の表示が出れば正常です。

```text
飼料給与実績がまだないため、比較判定はありません。
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
git commit -m "Add Starter Pack 79 feeding alert enhance"
git push
```

## 11. 白い画面になった場合

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git restore .
git clean -fd
```
