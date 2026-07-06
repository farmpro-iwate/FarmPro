# FarmPro Starter Pack 131 分娩記録から子牛台帳へ連携

## 内容

Starter Pack 131では、分娩記録から子牛台帳へ登録できるボタンを追加します。

## 更新ファイル

```text
server/src/routes/calvings.ts
client/src/services/calvingsApi.ts
client/src/pages/CalvingList.tsx
docs/StarterPack131_分娩記録から子牛台帳連携_確認手順.md
README_StarterPack131_CalvingToCalfLedger.md
```

## 手動追記

不要です。

## 確認URL

```text
http://localhost:5173/calvings
```

## できること

```text
分娩記録から子牛台帳へ登録
登録済み表示
死産は対象外
子牛名の重複チェック
同じ母牛・同じ生年月日の重複チェック
```

## API

```text
POST /api/calvings/:id/register-calf
```

## 確認

```text
http://localhost:4000/api/calvings
http://localhost:4000/api/calves
```

## GitHub保存

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 131 calving to calf ledger"
git push
```
