# Starter Pack 32 出荷販売削除機能 確認手順

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

## 5. 削除ボタンを確認

一覧の各行に次の2つが出ればOKです。

```text
編集
削除
```

## 6. 削除テスト

削除ボタンを押すと確認メッセージが出ます。

OKを押すと削除され、一覧から消えれば成功です。

## 7. 注意

削除すると元に戻せません。
本番データでは慎重に操作してください。

## 8. GitHub保存

確認できてから保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 32 sales delete"
git push
```

## 9. 白い画面になった場合

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git restore .
git clean -fd
```
