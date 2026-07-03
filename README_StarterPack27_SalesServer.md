# FarmPro Starter Pack 27 出荷・販売管理 server側追加版

## 内容

今回は client 画面は変更しません。
白い画面を避けるため、server 側の出荷・販売管理ファイルだけ追加します。

## 追加ファイル

- server/src/data/sales.json
- server/src/routes/sales.ts
- docs/StarterPack27_出荷販売APIメモ.md
- docs/StarterPack27_反映後確認手順.md

## 重要

今回は安全のため、client画面は変更していません。

また、server/src/index.ts は自動上書きしません。
index.tsを丸ごと上書きすると、既存機能が壊れる可能性があるためです。

APIを有効にするには、server/src/index.ts に次の2行を追加します。

```ts
import salesRouter from './routes/sales';
```

```ts
app.use('/api/sales', salesRouter);
```

追加場所は、他の routes import や app.use が並んでいる場所です。

## 反映先

C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1

## GitHub保存

表示確認・server起動確認ができたら保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 27 sales server"
git push
```
