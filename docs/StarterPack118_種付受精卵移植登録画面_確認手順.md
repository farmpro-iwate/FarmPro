# Starter Pack 118 種付・受精卵移植 登録画面 確認手順

## 1. 内容

繁殖記録の登録画面を強化します。

対応する繁殖区分:

```text
人工授精
自然交配
受精卵移植
その他
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

基本的には不要です。

既に `/breeding/new` が `BreedingForm` を表示している前提です。

もし「新規登録画面」が開けない場合は、`client/src/App.tsx` のルート確認が必要です。

候補:

```ts
import { BreedingForm } from './pages/BreedingForm';
```

```tsx
<Route path="/breeding/new" element={<AppLayout><BreedingForm /></AppLayout>} />
```

すでにある場合は二重に入れないでください。

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

## 6. 画面を確認

Chromeで開きます。

```text
http://localhost:5173/breeding/new
```

もしこのURLで開けない場合は、繁殖一覧画面から「新規登録」ボタンで開いてください。

---

## 7. 人工授精の確認

繁殖区分で以下を選びます。

```text
人工授精
```

表示される項目:

```text
母牛
授精日
種雄牛
精液番号
授精師
分娩予定日
妊娠鑑定予定日
妊娠鑑定結果
状態
メモ
```

---

## 8. 自然交配の確認

繁殖区分で以下を選びます。

```text
自然交配
```

表示される項目:

```text
母牛
交配日
種雄牛
同居開始日
同居終了日
分娩予定日
妊娠鑑定予定日
```

---

## 9. 受精卵移植の確認

繁殖区分で以下を選びます。

```text
受精卵移植
```

表示される項目:

```text
受卵牛
移植日
ドナー牛
種雄牛
受精卵番号
卵区分
受精卵ランク
移植者
分娩予定日
妊娠鑑定予定日
```

---

## 10. 自動計算の確認

実施日を変えると、以下が自動で変わります。

```text
分娩予定日 = 実施日 + 285日
妊娠鑑定予定日 = 実施日 + 40日
```

---

## 11. 登録確認

入力後に「登録する」を押します。

登録できたら、一覧へ戻ります。

APIでも確認できます。

```text
http://localhost:4000/api/breeding
```

登録した内容が出ればOKです。

---

## 12. 画面が古い場合

Chromeで押します。

```text
Ctrl + F5
```

---

## 13. GitHub保存

画面確認後に保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 118 breeding form enhance"
git push
```

---

## 14. 白い画面になった場合

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git restore .
git clean -fd
```
