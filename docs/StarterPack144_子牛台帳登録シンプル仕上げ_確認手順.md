# Starter Pack 144 子牛台帳登録シンプル仕上げ 確認手順

## 1. 内容

分娩記録一覧の「子牛台帳へ登録」まわりを、実運用向けに分かりやすくします。

---

## 2. 更新ファイル

```text
client/src/pages/CalvingList.tsx
docs/StarterPack144_子牛台帳登録シンプル仕上げ_確認手順.md
README_StarterPack144_CalvingToCalfLedgerSimpleFinish.md
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

## 6. 確認URL

```text
http://localhost:5173/calvings
```

---

## 7. 確認すること

子牛台帳の表示が以下のようになっていればOKです。

```text
未登録
登録済み
対象外
```

意味:

```text
未登録: 子牛台帳へ登録できる
登録済み: すでに子牛台帳へ登録済み
対象外: 死産のため子牛台帳へ登録しない
```

---

## 8. 登録前確認

「子牛台帳へ登録」を押したときに、以下が表示されればOKです。

```text
母牛
子牛
性別
出生日
出生体重
```

内容を確認してからOKを押します。

---

## 9. 子牛名がない場合

子牛名・耳標番号がない場合は、子牛台帳へ登録できません。

先に「編集」から子牛名を入れます。

---

## 10. 消えているべきもの

以下は表示されない方針です。

```text
繁殖記録候補
この候補を使う
breedingIdだけ保存
繁殖記録を分娩済みにする
```

---

## 11. GitHub保存

確認できてから保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Polish calving to calf ledger simple flow"
git push
```
