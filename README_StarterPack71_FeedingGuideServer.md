# FarmPro Starter Pack 71 飼料給与目安 server API追加版

## 内容

Starter Pack 71では、飼料給与目安表のserver APIを追加します。

今回は画面はまだ追加しません。
まずserver側で、日齢ごとの給与目安をJSON保存できるようにします。

## 追加ファイル

- server/src/data/feedingGuide.json
- server/src/routes/feedingGuide.ts
- docs/StarterPack71_飼料給与目安ServerAPI_確認手順.md
- README_StarterPack71_FeedingGuideServer.md

## 手動追記が必要なファイル

- server/src/app.ts

## 追加されるAPI

```text
GET    /api/feeding-guide
GET    /api/feeding-guide/:id
GET    /api/feeding-guide/nearest/:ageDays
POST   /api/feeding-guide
PUT    /api/feeding-guide/:id
DELETE /api/feeding-guide/:id
```

## 登録項目

- 日齢
- 月齢
- ステージ名
- 体重目安
- 体高目安
- 胸囲目安
- スターター給与量
- 育成配合給与量
- 粗飼料給与量
- その他給与量
- メモ

## 初期データ

以下の日齢目安を初期登録しています。

```text
0日
30日
60日
90日
120日
150日
180日
210日
240日
275日
```

数値は仮の目安です。
画像表や実際の農場基準に合わせて、後で編集できる形にします。

## GitHub保存

確認できてから保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 71 feeding guide server API"
git push
```
