# Starter Pack 207 農場別データ分離 確認手順

## 目的

ログイン利用者の `farmId` ごとに、牛・繁殖・販売・経費・マスター・設定・バックアップ対象データを別フォルダへ保存します。

## 保存先

初期確認用農場では次へ保存されます。

```text
server/data/farms/farm-demo/
```

利用者情報だけは全農場共通の認証情報なので、従来どおり次へ保存します。

```text
server/data/users.json
```

## 既存データの引き継ぎ

初期農場 `farm-demo` が初めて各データへアクセスした際、次の順番で既存データを探し、新しい農場別フォルダへコピーします。

1. `server/data/<ファイル名>`
2. `server/src/data/<ファイル名>`

元ファイルは削除しません。

## 確認手順

1. `feature/farm-data-isolation` へ切り替える
2. server/client buildを確認する
3. server/clientを起動する
4. `demo@farmpro.local / password` でログインする
5. 牛台帳、販売一覧、マスター画面などを開く
6. 次を実行する

```powershell
Get-ChildItem .\server\data\farms\farm-demo
```

7. `cattle.json`、`sales.json`、`masters.json` など、開いた機能のファイルが表示されることを確認する
8. 次を実行する

```powershell
git status --short
```

9. `server/data` 配下がGit差分に出ないことを確認する

## 分離の仕組み

- 認証ミドルウェアがログイン利用者の `farmId` を取得
- そのリクエスト中だけ農場コンテキストを保持
- 既存の `readJson` / `writeJson` が自動で農場別保存先を選択
- 各画面・各APIを個別に書き換えず、全体を一括して分離

## 今回の範囲

このStarter Packでは保存先の農場分離までを行います。知り合い用の2つ目のアカウント作成と利用者管理画面は次工程です。
