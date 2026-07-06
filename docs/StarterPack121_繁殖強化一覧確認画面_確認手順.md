# Starter Pack 121 繁殖強化 一覧確認画面 確認手順

## 1. 内容

既存の繁殖画面を壊さずに、別URLで繁殖強化の一覧確認画面を追加します。

新しいURL:

```text
/breedings-advanced
```

既存URLは触りません。

```text
/breedings
/breedings/new
/breedings/:id/edit
```

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
client/src/pages/BreedingAdvancedList.tsx
client/src/services/breedingAdvancedApi.ts
docs/StarterPack121_繁殖強化一覧確認画面_確認手順.md
README_StarterPack121_BreedingAdvancedList.md
```

`breedingAdvancedApi.ts` はPack120で追加済みですが、今回は一覧取得にも対応するため更新します。

---

## 4. App.tsxに手動追記

`client/src/App.tsx` を開きます。

importのところに追加します。

```ts
import { BreedingAdvancedList } from './pages/BreedingAdvancedList';
```

次に `<Routes>` の中に追加します。

```tsx
<Route path="/breedings-advanced" element={<AppLayout><BreedingAdvancedList /></AppLayout>} />
```

Pack120の新規登録ルートも残してください。

```tsx
<Route path="/breedings-advanced/new" element={<AppLayout><BreedingAdvancedForm /></AppLayout>} />
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

## 7. 確認URL

Chromeで開きます。

```text
http://localhost:5173/breedings-advanced
```

---

## 8. 確認すること

以下が表示されればOKです。

```text
繁殖強化 一覧確認
全記録
人工授精
受精卵移植
未鑑定
検索・絞り込み
繁殖強化 新規登録ボタン
```

---

## 9. 新規登録とのつながり確認

画面の「繁殖強化 新規登録」ボタンを押します。

```text
http://localhost:5173/breedings-advanced/new
```

に移動できればOKです。

---

## 10. 既存画面確認

既存の繁殖画面も確認します。

```text
http://localhost:5173/breedings
```

ここが今まで通り開けば、既存画面を壊していません。

---

## 11. 白画面になった場合

今回も既存画面は上書きしていません。

まずApp.tsxに追加した2行を確認します。

```ts
import { BreedingAdvancedList } from './pages/BreedingAdvancedList';
```

```tsx
<Route path="/breedings-advanced" element={<AppLayout><BreedingAdvancedList /></AppLayout>} />
```

まだ白い場合は、clientの黒い画面の赤いエラーを送ってください。

---

## 12. GitHub保存

動作確認後に保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 121 breeding advanced list"
git push
```
