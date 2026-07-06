# FarmPro Starter Pack 136 分娩記録から繁殖記録候補検索API

## 内容

Starter Pack 136では、分娩記録から関連しそうな繁殖記録候補を探すAPIを追加します。

## 更新ファイル

```text
server/src/routes/calvings.ts
client/src/services/calvingsApi.ts
docs/StarterPack136_分娩記録から繁殖記録候補検索API_確認手順.md
README_StarterPack136_CalvingBreedingCandidates.md
```

## 手動追記

不要です。

## 追加API

```text
GET /api/calvings/:id/breeding-candidates
```

## 確認例

```text
http://localhost:4000/api/calvings/calving_sample_001/breeding-candidates
```

## 候補検索の条件

```text
分娩記録のbreedingIdと一致
母牛IDが一致
母牛名が一致
分娩予定日が近い
実分娩日と繁殖側予定日が近い
繁殖側状態が妊娠・確認待ちなど
```

## 今回まだやらないこと

```text
繁殖記録を分娩済みにする
画面上で候補を選ぶ
分娩記録に自動でbreedingIdを入れる
```

## GitHub保存

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 136 calving breeding candidates API"
git push
```
