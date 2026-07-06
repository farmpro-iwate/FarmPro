# FarmPro Starter Pack 126 機能整理・実運用優先方針

## 内容

Starter Pack 126では、FarmProの機能を増やしすぎないための方針を整理します。

ここまでで飼料給与管理や妊娠鑑定管理など、多くの機能を追加してきました。

ただし、実際の農場で使うには、機能が多すぎると逆に使いにくくなります。

そのため、今後は以下の方針にします。

```text
飼料給与管理はこれ以上深追いしない
ステータスを増やしすぎない
CSV・印刷・アラートを増やしすぎない
繁殖・分娩・子牛台帳の流れを優先する
現場で毎日使う画面を絞る
```

## 追加ファイル

```text
docs/StarterPack126_機能整理_実運用優先方針.md
docs/StarterPack126_飼料給与管理_現状維持方針.md
docs/StarterPack126_ステータス整理方針.md
docs/StarterPack126_今後の優先順位.md
README_StarterPack126_OperationPriorityCleanup.md
```

## 手動追記

今回は不要です。

## アプリ画面の変更

今回は docs のみなので、アプリ画面は変わりません。

## 次の候補

```text
Starter Pack 127：分娩記録 基本設計
Starter Pack 128：分娩記録 server API
Starter Pack 129：分娩記録 登録画面
Starter Pack 130：分娩記録から子牛台帳へ連携
```

## GitHub保存

確認できてから保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 126 operation priority cleanup"
git push
```
