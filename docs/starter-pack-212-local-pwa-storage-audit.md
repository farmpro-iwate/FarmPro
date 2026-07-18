# Starter Pack 212：スマホ内保存への移行調査

## 1. 目的

FarmProを当面「スマホ1台・1農家・端末内保存」で利用できるようにするため、
現在のサーバーJSON保存から、PWA＋IndexedDB方式へ移行できる範囲を調査する。

## 2. 現在の保存データ

server/src/data で次のJSONファイルを確認した。

- breeding.json
- breedings.json
- calves.json
- calvings.json
- cattle.json
- expenses.json
- feedingAlertActions.json
- feedingGuide.json
- feedingGuide_backup_before_real_data.json
- feedingGuide_real_data_template.json
- feedings.json
- feedInventory.json
- masters.json
- sales.json
- schedules.json
- settings.json
- treatments.json
- vaccines.json

### 注意点

- breeding.json と breedings.json が併存しているため、用途の整理が必要
- feedingGuideには本体、旧バックアップ、実データ用テンプレートがある
- バックアップ用・テンプレート用JSONは通常データと分離して扱う
- 空または初期状態のJSONも存在する

## 3. クライアントが利用している主なAPI

- /api/cattle
- /api/calves
- /api/breeding
- /api/breedings
- /api/calvings
- /api/expenses
- /api/feedings
- /api/feeding-guide
- /api/feed-inventory
- /api/feeding-alert-actions
- /api/sales
- /api/monthly-balance
- /api/reports/summary
- /api/reports/csv/*
- /api/auth/login

## 4. 登録・編集・削除・読み取り

複数の機能で、次の一般的なCRUD構成を確認した。

- GET：一覧・詳細の読み取り
- POST：新規登録
- PUT：編集
- DELETE：削除

確認できた主な対象：

- 分娩
- 経費
- 給餌アラート対応
- 飼料給与目安
- 飼料給与
- 飼料在庫
- 販売
- 予定
- 治療
- ワクチン
- 農場設定

## 5. IndexedDBへ移せる範囲

通常の記録データは、原則としてIndexedDBへ移行可能と判断する。

対象候補：

- 牛台帳
- 子牛台帳
- 繁殖記録
- 分娩記録
- 経費
- 販売
- 飼料給与
- 飼料在庫
- 飼料給与目安
- 給餌アラート対応
- 予定
- 治療
- ワクチン
- マスター
- 農場設定

クライアントの画面処理を直接IndexedDBへ結び付けず、
保存処理を共通のデータアクセス層へ分離する。

## 6. serverを残す必要がある処理

初期の端末内保存版では、通常のCRUD処理にserverは必須ではない。

ただし、次の処理はブラウザ側への移植または将来のserver利用を検討する。

- 複数データをまとめる帳票集計
- CSV出力
- ログイン認証
- 農場ごとのデータ分離
- 複数端末同期
- 外部バックアップ
- 外部AIとの安全な接続
- 正式なクラウド運用

## 7. バックアップ対象

端末内保存版では、次を一括バックアップ対象とする。

- IndexedDB内の全記録
- マスターデータ
- 農場設定
- 写真データ
- データ形式のバージョン番号
- バックアップ作成日時
- FarmProのバージョン

復元前に内容を検証し、不正または古すぎる形式を直接取り込まない。

## 8. 写真データ

現在のコードからは、写真アップロードと写真保存の本格実装を確認できなかった。

将来の写真保存方式：

- 写真本体はIndexedDBへBlobとして保存
- 通常の記録には写真IDだけを保存
- 大きすぎる写真は保存前に圧縮
- バックアップ時は記録と写真をまとめる
- JSON本文へ巨大なbase64画像を直接埋め込まない

## 9. PWAとオフライン対応の現状

現在確認できたのは通常のReact＋Vite構成である。

未実装：

- Web App Manifest
- Service Worker
- Workboxまたは同等のキャッシュ処理
- PWAインストール設定
- オフライン起動
- IndexedDB保存
- 更新版検出
- オフライン状態表示

## 10. PWA化に必要な追加作業

1. IndexedDB用の共通保存層を作る
2. データ種別ごとのストア構成を決める
3. JSONからIndexedDBへの初期移行処理を作る
4. 各APIサービスをローカル保存層へ段階的に置き換える
5. バックアップ／復元をIndexedDB対応へ変更する
6. manifestとアプリアイコンを追加する
7. Service Workerを追加する
8. アプリ本体をオフラインキャッシュする
9. オフライン状態と保存完了状態を画面に表示する
10. iPhoneでホーム画面追加と再起動後の保存維持を確認する
11. IndexedDBのバージョン更新・移行方式を作る
12. 写真Blob保存と容量管理を追加する

## 11. 推奨する移行順序

### 第1段階

- IndexedDBの基盤
- 農場設定
- マスターデータ
- 牛台帳
- 子牛台帳
- バックアップ／復元

### 第2段階

- 繁殖
- 分娩
- 治療
- ワクチン
- 予定

### 第3段階

- 飼料関係
- 販売
- 経費
- 月別収支
- 帳票・CSV

### 第4段階

- 写真
- PWAインストール
- 完全オフライン確認
- データ移行テスト

## 12. 結論

FarmProの通常データはJSON中心の構成であり、
大部分をIndexedDBへ移行できる可能性が高い。

初期試用版ではserver依存を外し、
スマホ1台のブラウザ内に保存する構成が実現可能である。

帳票、CSV、写真、バックアップ、PWAキャッシュは、
共通保存層を作った後に段階的に移行する。

Render公開用の既存構成は削除せず、
複数端末同期や正式運用が必要になった時点で再利用する。
