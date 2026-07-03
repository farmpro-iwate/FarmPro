# Starter Pack 31 確認手順

## 1. serverを起動

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1\server
npm run dev
```

## 2. clientを起動

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1\client
npm run dev
```

## 3. 出荷販売一覧を開く

```text
http://localhost:5173/sales
```

## 4. 編集ボタンを確認

一覧の各行に「編集」ボタンが出ればOKです。

## 5. 編集テスト

「編集」を押し、メモや販売金額などを変更して「更新する」を押します。

一覧へ戻って、変更内容が反映されていればOKです。

## 6. 白い画面になった場合

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git restore .
git clean -fd
```

## 7. GitHub保存

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 31 sales edit"
git push
```
