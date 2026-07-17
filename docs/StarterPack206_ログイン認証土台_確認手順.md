# Starter Pack 206 ログイン認証土台 確認手順

## 目的

試用者がログインしない限り、FarmProの画面とデータAPIを利用できない状態にします。
この段階では認証の土台までを導入し、利用者ごとのデータ分離は次のStarter Packで行います。

## 初回確認用アカウント

- メールアドレス: `demo@farmpro.local`
- パスワード: `password`

初回ログイン時に `server/data/users.json` が自動作成されます。このファイルはGit管理対象外です。

## 確認手順

1. mainから `feature/auth-foundation` へ切り替える
2. serverとclientを起動する
3. `http://localhost:5173` を開く
4. 未ログインの場合にログイン画面へ移動することを確認する
5. 間違ったパスワードでエラーが表示されることを確認する
6. 初回確認用アカウントでログインできることを確認する
7. 牛台帳など既存画面が表示できることを確認する
8. 画面右上のログアウトを押し、ログイン画面へ戻ることを確認する
9. client/serverのbuildを確認する
10. `git status --short` に `server/data/users.json` が出ないことを確認する

## API確認

ログインなしでは次が401になることを確認します。

```powershell
Invoke-WebRequest http://localhost:4000/api/cattle -SkipHttpErrorCheck
```

ログインAPIは次で確認できます。

```powershell
$login = Invoke-RestMethod http://localhost:4000/api/auth/login -Method Post -ContentType 'application/json' -Body '{"email":"demo@farmpro.local","password":"password"}'
$login.user
```

## 注意

- 外部公開前に `FARMPRO_AUTH_SECRET` を長いランダム文字列へ変更します。
- 初期パスワードの変更画面、利用者追加、農場ごとのデータ分離は次工程です。
