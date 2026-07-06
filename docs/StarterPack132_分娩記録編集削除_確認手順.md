# Starter Pack 132 分娩記録 編集・削除 確認手順

## 1. 内容

分娩記録の編集画面と削除ボタンを追加します。

---

## 2. 更新ファイル

```text
client/src/pages/CalvingEditForm.tsx
client/src/pages/CalvingList.tsx
docs/StarterPack132_分娩記録編集削除_確認手順.md
README_StarterPack132_CalvingEditDelete.md
```

---

## 3. ZIPを反映する

ZIPを解凍して、中身をプロジェクト本体へ上書きコピーします。

反映先:

```text
C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
```

---

## 4. App.tsxに追記する

`client/src/App.tsx` を開きます。

### import欄に追加

```ts
import { CalvingEditForm } from './pages/CalvingEditForm';
```

### Route欄に追加

```tsx
<Route path="/calvings/:id/edit" element={<AppLayout><CalvingEditForm /></AppLayout>} />
```

他の `<Route ... />` が並んでいるところに入れればOKです。

---

## 5. serverを起動

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1\server
npm run dev
```

---

## 6. clientを起動

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1\client
npm run dev
```

---

## 7. 分娩記録一覧を開く

```text
http://localhost:5173/calvings
```

---

## 8. 編集確認

一覧の「編集」を押します。

以下のようなURLに移動すればOKです。

```text
http://localhost:5173/calvings/calving_sample_001/edit
```

内容を少し変更して、

```text
分娩記録を更新
```

を押します。

一覧へ戻ればOKです。

---

## 9. 削除確認

一覧の「削除」を押します。

確認メッセージが出ます。

OKを押すと削除されます。

---

## 10. 子牛台帳登録済み記録の注意

子牛台帳へ登録済みの分娩記録を編集・削除する場合は注意が出ます。

```text
分娩記録を修正しても、子牛台帳側は自動更新されません。
分娩記録を削除しても、子牛台帳の子牛は自動削除されません。
```

これは安全のためです。

---

## 11. API確認

```text
http://localhost:4000/api/calvings
```

編集・削除結果が反映されていればOKです。

---

## 12. 今回まだやらないこと

```text
子牛台帳側の自動更新
子牛台帳側の自動削除
編集後の子牛台帳反映
```

ここは自動でやると危ないので、今は分けています。

---

## 13. GitHub保存

確認できてから保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 132 calving edit delete"
git push
```
