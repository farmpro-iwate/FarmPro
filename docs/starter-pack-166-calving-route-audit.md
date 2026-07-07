# Starter Pack 166: 分娩記録まわりの既存ルート・API確認

## 目的

Starter Pack 165で整理した「分娩記録と子牛登録の紐づけ方針」を、既存コードに合わせて実装できるようにする。

今回は、分娩記録まわりの画面、URL、API、既存の子牛台帳登録処理を確認し、Starter Pack 167以降で安全にUI改善できる場所を整理する。

## 確認したファイル

- `client/src/App.tsx`
- `client/src/pages/CalvingList.tsx`
- `client/src/pages/CalvingForm.tsx`
- `client/src/pages/CalvingEditForm.tsx`
- `client/src/services/calvingsApi.ts`

## 既存ルート

現在の分娩記録まわりのルートは次の通り。

- `/calvings` : 分娩記録一覧
- `/calvings/new` : 分娩記録 新規登録
- `/calvings/:id/edit` : 分娩記録 編集

現時点では、`/calvings/:id` の分娩記録詳細画面は存在しない。

## 既存画面の役割

### CalvingList

分娩記録一覧画面。

既に次の機能がある。

- 分娩記録一覧表示
- 検索
- 分娩結果フィルター
- 初乳確認フィルター
- 分娩結果別の件数表示
- 子牛台帳未登録件数の警告
- 初乳未確認・要確認件数の警告
- 分娩記録の削除
- 分娩記録から子牛台帳へ登録

`子牛台帳へ登録` は既に実装済み。
このため、次の実装では新しい登録処理を別に作るより、既存処理を分かりやすく見せる方が安全。

### CalvingForm

分娩記録の新規登録画面。

主な入力項目:

- 母牛耳標番号 `cowId`
- 母牛名 `cowName`
- 分娩予定日 `expectedCalvingDate`
- 実分娩日 `actualCalvingDate`
- 子牛耳標番号 `calfName`
- 性別 `calfSex`
- 出生体重 `birthWeightKg`
- 分娩結果 `calvingResult`
- 初乳確認 `colostrumStatus`
- メモ `memo`

新規登録後は `/calvings` に戻る。

### CalvingEditForm

分娩記録の編集画面。

新規登録とほぼ同じ項目を編集できる。
すでに子牛台帳登録済みの場合は、分娩記録を変更しても子牛台帳側は自動更新されないことを警告している。

## 既存API

`client/src/services/calvingsApi.ts` で確認した主なAPI:

- `fetchCalvings()`
- `fetchCalving(id)`
- `createCalving(record)`
- `updateCalving(id, record)`
- `deleteCalving(id)`
- `registerCalvingToCalfLedger(id)`

子牛台帳登録APIは次のエンドポイントを使う。

```text
POST /api/calvings/:id/register-calf
```

## CalvingRecord の主な項目

現在の型には、子牛登録連携に必要な項目が既にある。

- `id`
- `cowId`
- `cowName`
- `expectedCalvingDate`
- `actualCalvingDate`
- `calfName`
- `calfSex`
- `birthWeightKg`
- `calvingResult`
- `colostrumStatus`
- `memo`
- `registeredToCalfLedger`
- `calfId`
- `daysFromExpected`

`registeredToCalfLedger` と `calfId` があるため、分娩記録と子牛台帳の紐づけ状態はすでに扱える。

## 現状で分かったこと

### すでにできていること

- 分娩記録から子牛台帳へ登録できる。
- 登録済み・未登録の状態を一覧で見られる。
- 死産は子牛台帳登録対象外として扱っている。
- 子牛耳標番号がない場合は登録できないようにしている。
- 登録済みの分娩記録を編集するときは注意表示が出る。

### 足りないこと

- 分娩記録の詳細画面がない。
- 登録済みの子牛について、子牛カルテへ直接移動する導線がない。
- `子牛台帳を確認` は `/calves` へ移動するだけで、該当子牛カルテへは飛ばない。
- 一覧カード上で、登録済み子牛の `calfId` を活かしきれていない。
- 分娩記録から子牛登録した後に、登録された子牛の確認導線がやや弱い。
- 子牛側から分娩記録へ戻る導線はまだない。

## 次の実装方針

### Starter Pack 167

`CalvingList.tsx` を改善する。

優先する変更:

- 登録済みで `calfId` がある場合、`子牛カルテを確認` ボタンを `/calves/:calfId` へ向ける。
- `calfId` がない場合は従来通り `/calves` へ向ける。
- 子牛台帳登録ボタンの前に、登録される内容をカード上でより分かりやすく表示する。
- `子牛台帳へ登録` の文言を、現場向けに少し分かりやすくする。

### Starter Pack 168

`CalvingList.tsx` または分娩記録詳細導線を検討する。

候補:

- 分娩記録カード内に登録済み子牛情報を強調表示
- 子牛カルテへのリンク追加
- 未登録時の注意メッセージ整理

### Starter Pack 169

子牛側に `calvingRecordId` または分娩記録由来メモがある場合、子牛カルテから分娩記録に戻る導線を検討する。

ただし、現状の `Calf` 型に `calvingRecordId` が安定して存在するかは追加確認が必要。

## 注意点

- 既存の `registerCalvingToCalfLedger` を壊さない。
- 新しい子牛登録処理を重複して作らない。
- まずは一覧画面の導線改善から進める。
- 表示は耳標番号中心にする。
- `calfName` は実質的に子牛耳標番号として扱われているため、文言に注意する。
- `calfId` がない登録済みデータもあり得るため、リンク処理はフォールバックを用意する。

## 完了条件

このStarter Packでは、既存の分娩記録ルート・画面・APIの確認と、次の実装方針の整理までを完了とする。
Starter Pack 167から、`CalvingList.tsx` の導線改善に入る。
