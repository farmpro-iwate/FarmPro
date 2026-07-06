# Starter Pack 134 安全な連携実装ステップ

## 1. 目的

分娩記録と繁殖記録を安全に連携するための実装順序です。

---

## 2. Step 1

## 分娩記録に繁殖記録IDを持たせる

追加候補:

```text
breedingId
breedingLinked
breedingLinkedAt
```

これを分娩記録に追加します。

ただし、既存データが壊れないように、空欄でも動くようにします。

---

## 3. Step 2

## 繁殖記録候補を探すAPI

分娩記録から、関連しそうな繁殖記録候補を探します。

候補API:

```text
GET /api/calvings/:id/breeding-candidates
```

探す条件:

```text
母牛ID
母牛名
分娩予定日
妊娠中の記録
```

---

## 4. Step 3

## 繁殖記録を分娩済みにするAPI

候補API:

```text
POST /api/calvings/:id/link-breeding
```

または、

```text
POST /api/calvings/:id/complete-breeding
```

処理内容:

```text
繁殖記録を分娩済みにする
分娩記録にbreedingLinkedを立てる
分娩記録にbreedingIdを保存する
```

---

## 5. Step 4

## 分娩記録一覧にボタン追加

一覧に以下を出します。

```text
繁殖未連携
繁殖連携済み
繁殖記録を分娩済みにする
```

---

## 6. Step 5

## 繁殖記録側で確認

繁殖記録一覧や繁殖強化一覧で、

```text
分娩済み
実分娩日
子牛名
```

が見えるようにします。

---

## 7. 実装で気をつけること

既存の繁殖機能は壊さないようにします。

```text
既存の /breedings は触りすぎない
まず /api/calvings 側に処理を追加する
分娩記録から操作する
確認できてから繁殖画面へ反映する
```

---

## 8. 失敗時の戻し方

画面がおかしくなった場合は、まず戻します。

```bash
git restore client/src/pages/CalvingList.tsx
git restore server/src/routes/calvings.ts
```

必要なら全体を戻します。

```bash
git restore .
git clean -fd
```

---

## 9. 次に進むおすすめ

次はまず軽く準備します。

```text
Starter Pack 135：分娩記録に繁殖記録IDを持たせる準備
```

いきなり繁殖データを書き換えない方が安全です。

---

## 10. 結論

分娩記録と繁殖記録の連携は重要ですが、段階的に進めます。

最初は、分娩記録側に連携情報を持たせるところから始めます。
