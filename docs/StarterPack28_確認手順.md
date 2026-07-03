# Starter Pack 28 確認手順

## 1. serverを起動

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1\server
npm run dev
```

## 2. sales API確認

Chromeで開きます。

```text
http://localhost:4000/api/sales
```

最初は次の表示でOKです。

```json
[]
```

## 3. clientを起動

別の黒い画面で実行します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1\client
npm run dev
```

## 4. FarmProを開く

```text
http://localhost:5173
```

## 5. 出荷販売画面を開く

上部メニューの「出荷販売」をクリックします。

または直接開きます。

```text
http://localhost:5173/sales
```

## 6. 成功表示

まだデータがない場合、次のような表示になればOKです。

```text
出荷・販売記録はまだありません。server側APIは動いています。
```

## 7. 白い画面になった場合

すぐにGitで戻します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git restore .
git clean -fd
```

## 8. GitHub保存

表示確認できてから保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 28 sales list"
git push
```
