# Starter Pack 124 妊娠鑑定 結果更新画面 確認手順

## 1. 内容

妊娠鑑定の結果を更新する画面を追加します。

新しいURL:

```text
/pregnancy-checks/:id/edit
```

既存の繁殖画面は触りません。

---

## 2. ZIPを反映する

ZIPを解凍して、中身をプロジェクト本体へ上書きコピーします。

反映先:

```text
C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
```

---

## 3. 追加・更新ファイル

```text
client/src/pages/PregnancyCheckEdit.tsx
client/src/services/breedingAdvancedApi.ts
docs/StarterPack124_妊娠鑑定結果更新画面_確認手順.md
README_StarterPack124_PregnancyCheckEdit.md
```

---

## 4. App.tsxに手動追記

`client/src/App.tsx` を開きます。

importのところに追加します。

```ts
import { PregnancyCheckEdit } from './pages/PregnancyCheckEdit';
```

次に `<Routes>` の中に追加します。

```tsx
<Route path="/pregnancy-checks/:id/edit" element={<AppLayout><PregnancyCheckEdit /></AppLayout>} />
```

Pack123の一覧ルートも残してください。

```tsx
<Route path="/pregnancy-checks" element={<AppLayout><PregnancyCheckList /></AppLayout>} />
```

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

## 7. まず妊娠鑑定一覧を開く

```text
http://localhost:5173/pregnancy-checks
```

---

## 8. 編集URLの確認方法

一覧画面にはまだ編集ボタンはありません。

まずAPIでIDを確認します。

Chromeで開きます。

```text
http://localhost:4000/api/breeding
```

または、

```text
http://localhost:4000/api/breedings
```

表示されたJSONの中から `id` を1つコピーします。

例:

```text
breeding_sample_ai_001
```

次に、このようにURLを作ります。

```text
http://localhost:5173/pregnancy-checks/breeding_sample_ai_001/edit
```

---

## 9. 確認すること

以下が表示されればOKです。

```text
妊娠鑑定 結果更新
対象記録
妊娠
不受胎
再確認
流産
妊娠鑑定実施日
妊娠鑑定結果
状態
メモ
```

---

## 10. 更新確認

妊娠・不受胎・再確認・流産のボタンを押します。

その後「鑑定結果を更新」を押します。

更新後、妊娠鑑定一覧へ戻ればOKです。

APIでも確認します。

```text
http://localhost:4000/api/breeding
```

---

## 11. 既存画面確認

既存の繁殖画面も確認します。

```text
http://localhost:5173/breedings
```

ここが今まで通り開けば、既存画面を壊していません。

---

## 12. 白画面になった場合

まずApp.tsxに追加した2行を確認します。

```ts
import { PregnancyCheckEdit } from './pages/PregnancyCheckEdit';
```

```tsx
<Route path="/pregnancy-checks/:id/edit" element={<AppLayout><PregnancyCheckEdit /></AppLayout>} />
```

まだ白い場合は、clientの黒い画面の赤いエラーを送ってください。

---

## 13. GitHub保存

動作確認後に保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 124 pregnancy check edit"
git push
```
