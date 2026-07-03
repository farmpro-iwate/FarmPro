# Starter Pack 29 確認手順

## 1. serverを起動

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1\server
npm run dev
```

## 2. sales API確認

```text
http://localhost:4000/api/sales
```

`[]` または登録済みデータが表示されればOKです。

## 3. clientを起動

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1\client
npm run dev
```

## 4. 新規登録画面を開く

```text
http://localhost:5173/sales/new
```

## 5. テスト登録

例:

```text
区分: 子牛
対象番号: C-001
対象名: テスト子牛
性別: オス
販売先・購買者: テスト市場
市場名: テスト家畜市場
販売体重: 285
販売金額: 650000
状態: 販売済み
メモ: テスト登録
```

## 6. 登録後

登録すると `/sales` に戻ります。

一覧に表示されればOKです。

## 7. server側データ確認

次のファイルにデータが保存されます。

```text
server/src/data/sales.json
```

## 8. 白い画面になった場合

すぐにGitで戻します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git restore .
git clean -fd
```

## 9. GitHub保存

表示確認・登録確認できてから保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 29 sales create"
git push
```
