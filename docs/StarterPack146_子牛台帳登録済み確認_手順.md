# Starter Pack 146 子牛台帳登録済み確認 手順

## 1. 内容

分娩記録一覧で、子牛台帳へ登録済みの記録を分かりやすくします。

---

## 2. 更新ファイル

```text
client/src/pages/CalvingList.tsx
docs/StarterPack146_子牛台帳登録済み確認_手順.md
README_StarterPack146_CalvingRegisteredCalfCheck.md
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

子牛台帳へ登録済みの記録で、以下が表示されればOKです。

```text
登録済み
子牛ID
子牛台帳を確認
```

一覧表では以下の列が追加されます。

```text
子牛ID
```

---

## 8. 子牛台帳確認ボタン

登録済みの記録には、

```text
子牛台帳を確認
```

または、

```text
台帳確認
```

が表示されます。

押すと子牛台帳へ移動します。

```text
http://localhost:5173/calves
```

---

## 9. 未登録の場合

未登録の場合は、今まで通り

```text
子牛台帳へ登録
```

が表示されます。

---

## 10. 死産の場合

死産の場合は

```text
対象外
```

のままです。

---

## 11. GitHub保存

確認できてから保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Improve registered calf ledger check"
git push
```
