# FarmPro Starter Pack 27 出荷・販売 server 修正版

## 修正内容

server/src/routes/sales.ts で __dirname を使っていたため、ES module環境でエラーが出ていました。

今回の修正版では、__dirname を使わずに process.cwd() を使う形へ変更しています。

## 反映先

C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1

## 反映方法

ZIPを解凍して、中身をプロジェクト本体へ上書きコピーしてください。

## 反映後

server を再起動してください。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1\server
npm run dev
```

確認:

```text
http://localhost:4000/api/sales
```

[] と出ればOKです。
