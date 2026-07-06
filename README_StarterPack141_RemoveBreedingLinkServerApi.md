# FarmPro Starter Pack 141 繁殖連携Server API撤去

## 内容

分娩記録APIから、繁殖記録連携まわりのserver APIを撤去します。

## 撤去するAPI

```text
GET /api/calvings/:id/breeding-candidates
POST /api/calvings/:id/complete-breeding
```

## 残すAPI

```text
GET /api/calvings
GET /api/calvings/summary
GET /api/calvings/:id
POST /api/calvings
PUT /api/calvings/:id
DELETE /api/calvings/:id
POST /api/calvings/:id/register-calf
```

## 更新ファイル

```text
server/src/routes/calvings.ts
docs/StarterPack141_繁殖連携ServerAPI撤去_確認手順.md
README_StarterPack141_RemoveBreedingLinkServerApi.md
```

## 手動追記

不要です。

## 確認URL

```text
http://localhost:4000/api/calvings
http://localhost:4000/api/calvings/summary
http://localhost:5173/calvings
```

## GitHub保存

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Remove calving breeding link server APIs"
git push
```
