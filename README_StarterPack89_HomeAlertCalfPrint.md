# FarmPro Starter Pack 89 ホーム注意子牛リスト印刷 追加版

## 内容

Starter Pack 89では、ホーム画面の注意子牛リストに印刷機能を追加します。

## 更新ファイル

- client/src/pages/Home.tsx
- docs/StarterPack89_ホーム注意子牛リスト印刷_確認手順.md
- README_StarterPack89_HomeAlertCalfPrint.md

## 手動追記

今回は不要です。

## 追加されること

- ホーム注意子牛リスト印刷
- 印刷用の別ウィンドウ表示
- 子牛名
- 生年月日
- 日齢
- 近い給与目安
- 直近実績日
- 不足件数
- 多め件数
- 良好件数
- 注意メモ
- 印刷日時

## 使用するAPI

```text
GET /api/reports/summary
```

## 確認URL

```text
http://localhost:5173
```

## GitHub保存

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 89 home alert calf print"
git push
```
