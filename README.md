# 繁殖Farm Pro - Starter Pack 1

繁殖和牛農家向け管理Webアプリ「繁殖Farm Pro」のスタータープロジェクトです。

## 構成

```text
FarmPro/
├── client/   # React + TypeScript + Vite
├── server/   # Node.js + Express
├── database/
└── docs/
```

## 起動方法

### 1. clientを起動

```bash
cd client
npm install
npm run dev
```

通常は以下で開きます。

```text
http://localhost:5173
```

### 2. serverを起動

別のコマンドプロンプトを開いて実行します。

```bash
cd server
npm install
npm run dev
```

API確認：

```text
http://localhost:4000/api/health
```

## 叩き台完成チェック

FarmPro をいったん叩き台として動作確認する場合は、以下の資料を使います。

- [動作確認手順書](docs/manual-test-guide.md)
- [叩き台完成チェックリスト](docs/prototype-checklist.md)

確認する主な内容：

- 起動確認
- 主要画面の表示確認
- 実作業の流れ確認
- 耳標番号中心の確認
- スマホ表示確認
- 使用感メモ

## Ver.1.0.0 Starter Pack 1 の内容

- ログイン画面
- ホーム画面
- 牛台帳一覧画面
- API通信の土台
- Node.jsサーバー
- サンプル牛データAPI

## 次のStarter Pack 2で追加予定

- 牛登録
- 牛編集
- 牛削除
- SQLite保存
