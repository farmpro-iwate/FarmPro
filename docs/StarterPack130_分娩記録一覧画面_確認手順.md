# Starter Pack 130 分娩記録 一覧画面 確認手順

## 1. 内容

分娩記録の一覧画面を本格版に更新します。

更新ファイル:

```text
client/src/pages/CalvingList.tsx
docs/StarterPack130_分娩記録一覧画面_確認手順.md
README_StarterPack130_CalvingList.md
```

---

## 2. ZIPを反映する

ZIPを解凍して、中身をプロジェクト本体へ上書きコピーします。

反映先:

```text
C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
```

---

## 3. 手動追記

今回は不要です。

Pack129で以下のRouteが追加済みなら、そのまま使えます。

```tsx
<Route path="/calvings" element={<AppLayout><CalvingList /></AppLayout>} />
<Route path="/calvings/new" element={<AppLayout><CalvingForm /></AppLayout>} />
```

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

## 6. 一覧画面を開く

Chromeで開きます。

```text
http://localhost:5173/calvings
```

---

## 7. 確認すること

以下が表示されればOKです。

```text
全記録
自然分娩
難産
外科的処置
死産
子牛台帳未登録
検索・絞り込み
分娩記録の表
```

---

## 8. 登録画面への移動

一覧画面の「分娩記録 新規登録」を押します。

```text
http://localhost:5173/calvings/new
```

に移動できればOKです。

---

## 9. 絞り込み確認

分娩結果で以下を選びます。

```text
自然分娩
難産
外科的処置
死産
```

選んだ結果だけ表示されればOKです。

---

## 10. 初乳確認の絞り込み

以下で絞り込めます。

```text
未確認
確認済み
要確認
```

---

## 11. API確認

Chromeで開きます。

```text
http://localhost:4000/api/calvings
```

一覧画面と同じ内容が表示されればOKです。

---

## 12. 今回まだやらないこと

```text
編集
削除
子牛台帳への登録ボタン
```

これらは次以降のStarter Packで追加します。

---

## 13. GitHub保存

確認できてから保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 130 calving list page"
git push
```
