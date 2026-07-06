# FarmPro Starter Pack 138 分娩記録から繁殖記録を分娩済みにするServer API

## 内容

Starter Pack 138では、分娩記録から繁殖記録を「分娩済み」に更新するserver APIを追加します。

## 更新ファイル

```text
server/src/routes/calvings.ts
client/src/services/calvingsApi.ts
docs/StarterPack138_分娩記録から繁殖記録を分娩済みにするServerAPI_確認手順.md
README_StarterPack138_CompleteBreedingServer.md
```

## 手動追記

不要です。

## 追加API

```text
POST /api/calvings/:id/complete-breeding
```

## このAPIで行うこと

```text
分娩記録のbreedingIdを確認
対象の繁殖記録を探す
繁殖記録のstatusを分娩済みにする
繁殖記録に実分娩日・分娩結果・子牛名・分娩記録IDを保存
分娩記録のbreedingLinkedをtrueにする
```

## 今回まだやらないこと

```text
画面ボタンの追加
繁殖画面側の見た目調整
```

## GitHub保存

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 138 complete breeding server API"
git push
```
