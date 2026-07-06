# Starter Pack 131 分娩記録から子牛台帳へ連携 確認手順

## 1. 内容

分娩記録から子牛台帳へ登録できるボタンを追加します。

自動登録ではなく、確認ボタン方式です。

```text
分娩記録を見る
↓
子牛台帳へ登録
↓
子牛台帳に追加
↓
分娩記録が登録済みになる
```

---

## 2. 更新ファイル

```text
server/src/routes/calvings.ts
client/src/services/calvingsApi.ts
client/src/pages/CalvingList.tsx
docs/StarterPack131_分娩記録から子牛台帳連携_確認手順.md
README_StarterPack131_CalvingToCalfLedger.md
```

---

## 3. 手動追記

今回は不要です。

Pack128の `app.ts` 追記、Pack129の `App.tsx` 追記が済んでいれば、そのまま使えます。

---

## 4. serverを起動

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1\server
npm run dev
```

---

## 5. clientを起動

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1\client
npm run dev
```

---

## 6. 分娩記録一覧を開く

```text
http://localhost:5173/calvings
```

---

## 7. 確認すること

死産ではない分娩記録で、子牛台帳が未登録の場合、

```text
子牛台帳へ登録
```

ボタンが表示されます。

---

## 8. ボタンを押す

「子牛台帳へ登録」を押します。

確認ダイアログが出ます。

OKを押すと、子牛台帳へ登録されます。

---

## 9. 子牛台帳を確認

```text
http://localhost:5173/calves
```

登録した子牛が表示されればOKです。

---

## 10. API確認

分娩記録:

```text
http://localhost:4000/api/calvings
```

`registeredToCalfLedger` が `true` になっていればOKです。

子牛台帳:

```text
http://localhost:4000/api/calves
```

登録した子牛が追加されていればOKです。

---

## 11. 二重登録防止

同じ子牛名、または同じ母牛・同じ生年月日の子牛がある場合は、登録を止めます。

エラー例:

```text
同じ子牛名、または同じ母牛・生年月日の子牛がすでに子牛台帳にある可能性があります。
```

---

## 12. 死産の場合

分娩結果が `死産` の記録は、子牛台帳へ登録しません。

一覧では `対象外` と表示されます。

---

## 13. 今回まだやらないこと

```text
分娩記録の編集
分娩記録の削除
子牛台帳側から分娩記録へ戻るリンク
```

---

## 14. GitHub保存

確認できてから保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 131 calving to calf ledger"
git push
```
