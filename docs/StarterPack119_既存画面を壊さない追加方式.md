# Starter Pack 119 既存画面を壊さない追加方式

## 1. 目的

FarmProに新機能を追加するとき、既存画面を壊さないためのルールです。

---

## 2. やらない方がよいこと

いきなり以下を上書きしないようにします。

```text
client/src/pages/BreedingForm.tsx
client/src/pages/BreedingList.tsx
client/src/services/breedingApi.ts
```

理由:

```text
既存のApp.tsx
既存の一覧画面
既存の編集画面
他の画面からの参照
```

とつながっているためです。

---

## 3. 安全なやり方

新しい機能は、まず別ファイルで作ります。

例:

```text
client/src/pages/BreedingAdvancedForm.tsx
client/src/pages/BreedingAdvancedList.tsx
client/src/services/breedingAdvancedApi.ts
```

---

## 4. URLも分ける

既存URL:

```text
/breedings
/breedings/new
/breedings/:id/edit
```

新しいURL:

```text
/breedings-advanced
/breedings-advanced/new
/breedings-advanced/:id/edit
```

これなら、新しい画面が失敗しても、既存の繁殖管理は残ります。

---

## 5. App.tsxに追加する時の注意

新しい画面を追加するときだけ、App.tsxへ追記します。

例:

```ts
import { BreedingAdvancedForm } from './pages/BreedingAdvancedForm';
```

```tsx
<Route path="/breedings-advanced/new" element={<AppLayout><BreedingAdvancedForm /></AppLayout>} />
```

既存の `/breedings/new` は触りません。

---

## 6. メニュー追加は後回しでもよい

最初はメニューに追加しなくてもOKです。

直接URLで確認します。

```text
http://localhost:5173/breedings-advanced/new
```

問題なければ、あとでメニューに追加します。

---

## 7. server APIも分ける方法

必要ならserver側も分けます。

既存:

```text
/api/breedings
/api/breeding
```

新規:

```text
/api/breedings-advanced
```

ただし、最初は既存の繁殖APIを使っても構いません。

---

## 8. 失敗した時の戻し方

新規ファイル方式なら、戻す範囲が小さくなります。

例:

```text
client/src/pages/BreedingAdvancedForm.tsx
client/src/services/breedingAdvancedApi.ts
```

を削除または `git restore` するだけで戻しやすいです。

---

## 9. 今後の基本ルール

```text
既存画面を直接上書きしない
新機能は別ファイルで作る
新URLで確認する
成功後に統合を検討する
白画面になったらGitHub保存しない
```

---

## 10. 結論

FarmProはかなり機能が増えてきました。

これからは、速さよりも「壊さない追加」を優先します。
