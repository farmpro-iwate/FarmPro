# Starter Pack 52 確認手順

## 1. ZIPを反映する

ZIPを解凍して、中身をプロジェクト本体へ上書きコピーします。

反映先:

```text
C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
```

## 2. 追加されたdocsを確認する

以下のファイルが追加されていればOKです。

```text
docs/StarterPack52_飼養管理基本設計.md
docs/飼料給与管理_入力ルール.md
docs/飼料在庫管理_設計メモ.md
docs/群管理_設計メモ.md
docs/StarterPack52_確認手順.md
```

## 3. アプリ起動確認

docsのみなので、アプリの表示には影響しません。

いつも通り起動できればOKです。

server:

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1\server
npm run dev
```

client:

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1\client
npm run dev
```

## 4. GitHub保存

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 52 feeding management design"
git push
```
