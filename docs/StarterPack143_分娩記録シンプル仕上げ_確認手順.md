# Starter Pack 143 分娩記録シンプル仕上げ 確認手順

## 1. 内容

分娩記録の登録画面・編集画面の文言を、実運用向けにシンプルに整理します。

---

## 2. 更新ファイル

```text
client/src/pages/CalvingForm.tsx
client/src/pages/CalvingEditForm.tsx
docs/StarterPack143_分娩記録シンプル仕上げ_確認手順.md
README_StarterPack143_CalvingSimpleFinish.md
```

---

## 3. 手動追記

不要です。

---

## 4. ZIPを反映する

ZIPを解凍して、中身をプロジェクト本体へ上書きコピーします。

反映先:

```text
C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
```

---

## 5. 起動

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

---

## 6. 登録画面確認

```text
http://localhost:5173/calvings/new
```

以下のように分かれていればOKです。

```text
1. 母牛と分娩日
2. 子牛情報
3. 分娩結果と初乳確認
```

---

## 7. 分娩結果確認

分娩結果が以下の4つだけになっていればOKです。

```text
自然分娩
難産
外科的処置
死産
```

---

## 8. 編集画面確認

```text
http://localhost:5173/calvings
```

一覧から「編集」を押します。

編集画面も、登録画面と同じようにシンプルになっていればOKです。

---

## 9. 消えているべきもの

以下が表示されていないことを確認します。

```text
繁殖記録候補
この候補を使う
breedingIdだけ保存
繁殖記録を分娩済みにする
```

---

## 10. GitHub保存

確認できてから保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Polish calving forms simple operation"
git push
```
