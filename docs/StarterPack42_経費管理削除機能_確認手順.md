# Starter Pack 42 経費管理削除機能 確認手順

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

## 5. 経費管理画面を開く

```text
http://localhost:5173/expenses
```

## 6. 削除ボタンを確認

経費が1件以上ある場合、一覧に次の2つが出ます。

```text
編集
削除
```

## 7. 削除テスト

削除ボタンを押すと確認メッセージが出ます。

OKを押すと削除され、一覧から消えれば成功です。

## 8. 注意

削除すると元に戻せません。
本番データでは慎重に操作してください。

## 9. GitHub保存

確認できてから保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 42 expense delete"
git push
```

## 10. 白い画面になった場合

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git restore .
git clean -fd
```
