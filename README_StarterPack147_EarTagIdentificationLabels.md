# FarmPro Starter Pack 147 ID表示を耳標番号と個体識別番号へ整理

## 内容

分娩記録画面の「ID」表示をやめて、耳標番号中心に整理します。

## 更新ファイル

```text
client/src/pages/CalvingForm.tsx
client/src/pages/CalvingEditForm.tsx
client/src/pages/CalvingList.tsx
docs/StarterPack147_ID表示を耳標番号と個体識別番号へ整理_確認手順.md
docs/StarterPack147_耳標番号と個体識別番号の運用ルール.md
README_StarterPack147_EarTagIdentificationLabels.md
```

## 手動追記

不要です。

## 表示変更

```text
母牛ID → 母牛耳標番号
子牛ID → 表示しない
子牛名・耳標番号 → 子牛耳標番号
```

## 方針

```text
画面で主に見るのは耳標番号
正式な番号は個体識別番号
個体識別番号は台帳やメモで管理
```

## GitHub保存

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Rename calving labels to ear tag identifiers"
git push
```
