# FarmPro Starter Pack 118 種付・受精卵移植 登録画面 強化

## 内容

Starter Pack 118では、繁殖記録の登録画面を強化します。

## 更新・追加ファイル

- client/src/pages/BreedingForm.tsx
- client/src/services/breedingApi.ts
- docs/StarterPack118_種付受精卵移植登録画面_確認手順.md
- README_StarterPack118_BreedingFormEnhance.md

## 手動追記

基本的には不要です。

ただし、`/breeding/new` が開けない場合は `client/src/App.tsx` にルートが必要です。

候補:

```ts
import { BreedingForm } from './pages/BreedingForm';
```

```tsx
<Route path="/breeding/new" element={<AppLayout><BreedingForm /></AppLayout>} />
```

すでにある場合は二重に入れないでください。

## 改善内容

```text
人工授精の入力欄
自然交配の入力欄
受精卵移植の入力欄
受卵牛・ドナー牛入力
種雄牛・精液番号
受精卵番号・卵区分・ランク
分娩予定日自動計算
妊娠鑑定予定日自動計算
妊娠鑑定結果
状態
```

## 確認URL

```text
http://localhost:5173/breeding/new
```

API確認:

```text
http://localhost:4000/api/breeding
```

## 次の候補

- Starter Pack 119：繁殖記録 一覧画面強化
- Starter Pack 120：繁殖記録 編集画面強化
- Starter Pack 121：妊娠鑑定管理
- Starter Pack 122：分娩記録 server API

## GitHub保存

画面確認後に保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 118 breeding form enhance"
git push
```
