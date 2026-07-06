# Starter Pack 120 繁殖強化 新規登録専用画面 確認手順

## 1. 内容

既存の繁殖画面を壊さずに、別URLで繁殖強化の新規登録画面を追加します。

新しいURL:

```text
/breedings-advanced/new
```

既存URLは触りません。

```text
/breedings
/breedings/new
```

---

## 2. ZIPを反映する

ZIPを解凍して、中身をプロジェクト本体へ上書きコピーします。

反映先:

```text
C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
```

---

## 3. 追加ファイル

```text
client/src/pages/BreedingAdvancedForm.tsx
client/src/services/breedingAdvancedApi.ts
```

---

## 4. App.tsxに手動追記

`client/src/App.tsx` を開きます。

importのところに追加します。

```ts
import { BreedingAdvancedForm } from './pages/BreedingAdvancedForm';
```

次に `<Routes>` の中に追加します。

おすすめの場所は、既存の繁殖ルートの近くです。

```tsx
<Route path="/breedings-advanced/new" element={<AppLayout><BreedingAdvancedForm /></AppLayout>} />
```

既存の以下は触りません。

```tsx
<Route path="/breedings" element={<AppLayout><BreedingList /></AppLayout>} />
<Route path="/breedings/new" element={<AppLayout><BreedingForm mode="create" /></AppLayout>} />
<Route path="/breedings/:id/edit" element={<AppLayout><BreedingForm mode="edit" /></AppLayout>} />
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
http://localhost:5173/breedings-advanced/new
```

---

## 8. 確認すること

以下が表示されればOKです。

```text
繁殖強化 新規登録
繁殖区分
人工授精
自然交配
受精卵移植
分娩予定日
妊娠鑑定予定日
```

---

## 9. 自動計算確認

実施日を変更すると以下が自動で変わればOKです。

```text
分娩予定日 = 実施日 + 285日
妊娠鑑定予定日 = 実施日 + 40日
```

---

## 10. 登録確認

登録後、既存の繁殖一覧へ戻ります。

```text
http://localhost:5173/breedings
```

APIでも確認できます。

```text
http://localhost:4000/api/breedings
```

または、

```text
http://localhost:4000/api/breeding
```

---

## 11. 白画面になった場合

今回は既存画面は上書きしていません。

まずApp.tsxに追加した2行を確認します。

確認する行:

```ts
import { BreedingAdvancedForm } from './pages/BreedingAdvancedForm';
```

```tsx
<Route path="/breedings-advanced/new" element={<AppLayout><BreedingAdvancedForm /></AppLayout>} />
```

まだ白い場合は、clientの黒い画面の赤いエラーを送ってください。

---

## 12. GitHub保存

動作確認後に保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 120 breeding advanced form"
git push
```
