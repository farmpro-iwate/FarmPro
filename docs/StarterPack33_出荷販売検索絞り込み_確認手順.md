# Starter Pack 33 出荷販売検索・絞り込み 確認手順

## 1. ZIPを反映する

ZIPを解凍して、中身をプロジェクト本体へ上書きコピーします。

反映先:

```text
C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
```

## 2. serverを起動

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1\server
npm run dev
```

## 3. clientを起動

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1\client
npm run dev
```

## 4. 出荷販売一覧を開く

```text
http://localhost:5173/sales
```

## 5. 確認すること

次の項目が出ていればOKです。

- 全体件数
- 出荷予定件数
- 出荷済み件数
- 販売済み件数
- 取消件数
- 検索欄
- 状態の絞り込み
- 区分の絞り込み
- 検索条件をクリア

## 6. テスト

販売済み、出荷予定などで絞り込みしてください。

子牛、成牛などで絞り込みしてください。

検索欄に対象番号や販売先を入れて絞り込みしてください。

## 7. GitHub保存

確認できてから保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 33 sales filters"
git push
```

## 8. 白い画面になった場合

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git restore .
git clean -fd
```
