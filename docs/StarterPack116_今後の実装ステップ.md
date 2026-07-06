# Starter Pack 116 今後の実装ステップ

## 1. 目的

繁殖・受精卵移植・分娩管理を、どの順番でFarmProへ入れるか整理します。

---

## 2. 大きな方針

一気に全部作ると壊れやすいため、以下の順番で進めます。

```text
設計
↓
server API
↓
一覧画面
↓
登録画面
↓
編集・削除
↓
アラート
↓
子牛台帳連携
```

---

## 3. Starter Pack 117 候補

## 繁殖記録 server API 強化

内容:

```text
繁殖区分を追加
人工授精・自然交配・受精卵移植に対応
種雄牛・精液番号・ドナー牛・受精卵番号を追加
妊娠鑑定項目を追加
状態管理を追加
```

更新候補:

```text
server/src/routes/breeding.ts
server/src/data/breeding.json
```

---

## 4. Starter Pack 118 候補

## 種付・受精卵移植 登録画面

内容:

```text
繁殖区分の選択
人工授精用入力欄
自然交配用入力欄
受精卵移植用入力欄
分娩予定日自動計算
妊娠鑑定予定日入力
```

更新候補:

```text
client/src/pages/BreedingForm.tsx
client/src/pages/BreedingList.tsx
```

---

## 5. Starter Pack 119 候補

## 妊娠鑑定管理

内容:

```text
妊娠鑑定日
妊娠鑑定結果
再確認日
不受胎・流産の記録
鑑定待ちアラート
```

---

## 6. Starter Pack 120 候補

## 分娩記録 server API

内容:

```text
分娩記録JSON保存
一覧取得
詳細取得
新規登録
編集
削除
```

追加候補:

```text
server/src/routes/calvings.ts
server/src/data/calvings.json
```

app.ts 追記候補:

```ts
import { calvingsRouter } from './routes/calvings';
app.use('/api/calvings', calvingsRouter);
```

---

## 7. Starter Pack 121 候補

## 分娩記録 登録画面

内容:

```text
母牛選択
関連繁殖記録選択
分娩日
分娩結果
子牛情報
初乳確認
母牛状態
子牛状態
メモ
```

追加候補:

```text
client/src/pages/CalvingList.tsx
client/src/pages/CalvingForm.tsx
client/src/services/calvingsApi.ts
```

---

## 8. Starter Pack 122 候補

## 分娩後に子牛台帳へ連携

内容:

```text
分娩記録から子牛台帳へ登録
母牛と子牛を自動ひも付け
繁殖記録を分娩済みに更新
二重登録防止
```

---

## 9. Starter Pack 123 候補

## 分娩予定・妊娠鑑定アラート

内容:

```text
妊娠鑑定予定日が近い
妊娠鑑定予定日を過ぎた
分娩予定日が近い
分娩予定日を過ぎた
分娩記録未登録
```

---

## 10. おすすめ順

次からは以下がおすすめです。

```text
117 繁殖記録 server API 強化
118 種付・受精卵移植 登録画面
119 妊娠鑑定管理
120 分娩記録 server API
121 分娩記録 登録画面
122 子牛台帳連携
123 繁殖・分娩アラート
```

---

## 11. 注意

繁殖・分娩は既存データに影響します。

画面を更新する前に、必ずGitHub保存とバックアップをしてから進めます。
