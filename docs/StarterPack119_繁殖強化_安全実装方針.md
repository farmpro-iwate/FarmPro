# Starter Pack 119 繁殖強化 安全実装方針

## 1. 目的

FarmProの繁殖管理を強化します。

ただし、既存の画面を壊さないことを最優先にします。

Pack118では、既存の `BreedingForm.tsx` を直接上書きしたため、既存のApp.tsxやBreedingListとの相性で白画面になる可能性がありました。

今後は、同じ失敗を避けるために安全な進め方へ変更します。

---

## 2. 今回の結論

今後の繁殖強化は、以下の方針で進めます。

```text
既存の繁殖画面はそのまま残す
新しい強化画面を別ファイルで作る
新しい強化画面を別URLで開く
動作確認後に既存画面へ統合する
```

---

## 3. 既存画面を守る理由

既存の繁殖管理は、すでに以下の画面とつながっています。

```text
繁殖一覧
繁殖新規登録
繁殖編集
カレンダー
アラート
個体カルテ
印刷
```

このため、既存ファイルを一気に上書きすると、思わぬ場所で白画面になる可能性があります。

---

## 4. 今後使う安全な追加方式

次からは、新しい画面を別名で追加します。

例:

```text
client/src/pages/BreedingAdvancedForm.tsx
client/src/pages/BreedingAdvancedList.tsx
client/src/services/breedingAdvancedApi.ts
```

URLも別にします。

```text
/breedings-advanced/new
/breedings-advanced
```

既存のURLは触りません。

```text
/breedings
/breedings/new
/breedings/:id/edit
```

---

## 5. これで何が安全になるか

```text
今までの繁殖画面はそのまま使える
新しい画面で失敗しても既存画面に影響しにくい
確認できてから統合できる
白画面になっても戻しやすい
```

---

## 6. 次に作るもの

次は、新しい繁殖強化画面を別URLで追加するのがおすすめです。

```text
Starter Pack 120：繁殖強化 新規登録専用画面を別URLで追加
```

内容:

```text
BreedingAdvancedForm.tsx を追加
breedingAdvancedApi.ts を追加
/breedings-advanced/new で開けるようにする
既存の /breedings/new は触らない
```

---

## 7. 分娩管理について

分娩管理も同じ方針で進めます。

いきなり既存の子牛管理や繁殖管理に統合しません。

まずは別データ・別画面で作ります。

```text
server/src/data/calvings.json
server/src/routes/calvings.ts
client/src/pages/CalvingList.tsx
client/src/pages/CalvingForm.tsx
```

うまく動いてから、子牛台帳と連携します。

---

## 8. 今後の優先順位

おすすめ順:

```text
1. 繁殖強化 新規登録専用画面
2. 繁殖強化 一覧確認画面
3. 妊娠鑑定管理
4. 分娩記録 server API
5. 分娩記録 登録画面
6. 子牛台帳連携
7. 繁殖・分娩アラート
```

---

## 9. GitHub保存のタイミング

画面を触るPackでは、必ず以下の順番にします。

```text
ZIP反映
server起動
client起動
画面確認
API確認
問題なければGitHub保存
```

白画面の時は保存しません。

---

## 10. まとめ

繁殖・分娩管理はFarmProの重要機能です。

急がず、既存機能を壊さない形で強化します。
