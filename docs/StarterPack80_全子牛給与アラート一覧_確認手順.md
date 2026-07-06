# Starter Pack 80 全子牛給与アラート一覧 確認手順

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
全子牛の給与アラート一覧
不足気味の子牛
多めの子牛
実績なし
```

## 7. 一覧の確認

子牛が登録されている場合、一覧に以下が表示されます。

```text
子牛
生年月日
日齢
近い目安
直近実績日
不足
多め
良好
注意メモ
```

## 8. 子牛が出ない場合

子牛管理に子牛がまだ登録されていない可能性があります。

その場合は、子牛管理で生年月日つきの子牛を登録してください。

## 9. 実績がない場合

注意メモに以下が表示されれば正常です。

```text
実績なし
```

この場合は、飼養管理でその子牛の給与実績を登録すると比較できます。

## 10. API確認

Chromeで確認できます。

```text
http://localhost:4000/api/calves
```

```text
http://localhost:4000/api/feedings
```

```text
http://localhost:4000/api/feeding-guide
```

## 11. GitHub保存

確認できてから保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 80 all calf feeding alerts"
git push
```

## 12. 白い画面になった場合

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git restore .
git clean -fd
```
