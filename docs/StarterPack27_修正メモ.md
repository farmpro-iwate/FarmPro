# Starter Pack 27 修正メモ

## 出ていたエラー

```text
ReferenceError: __dirname is not defined in ES module scope
```

## 原因

server/src/routes/sales.ts で __dirname を使っていたためです。

## 修正内容

次の書き方をやめました。

```ts
path.join(__dirname, '..', 'data', 'sales.json')
```

次の書き方に変更しました。

```ts
path.join(process.cwd(), 'src', 'data', 'sales.json')
```

## 確認方法

server を再起動して、Chromeで確認します。

```text
http://localhost:4000/api/sales
```

次の表示ならOKです。

```json
[]
```
