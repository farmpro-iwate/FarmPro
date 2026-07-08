import { useEffect, useState } from 'react';
import { Button, Card, CardContent, Divider, Stack, Typography } from '@mui/material';
import { FarmSettings } from '../types/settings';
import { getFarmSettings } from '../services/settingsApi';

const emptySettings: FarmSettings = {
  farmName: '繁殖Farm Pro',
  ownerName: '',
  staffName: '',
  phone: '',
  address: '',
  memo: ''
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardContent>
        <Stack spacing={1}>
          <Typography variant="h6" fontWeight={800}>{title}</Typography>
          {children}
        </Stack>
      </CardContent>
    </Card>
  );
}

function Line({ children }: { children: React.ReactNode }) {
  return <Typography sx={{ lineHeight: 1.8 }}>{children}</Typography>;
}

export function HelpPage() {
  const [settings, setSettings] = useState<FarmSettings>(emptySettings);

  useEffect(() => {
    getFarmSettings().then(setSettings).catch(() => setSettings(emptySettings));
  }, []);

  return (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" className="no-print">
        <Typography variant="h5" fontWeight={800}>ヘルプ・操作ガイド</Typography>
        <Button variant="contained" onClick={() => window.print()}>印刷する</Button>
      </Stack>

      <Card className="print-card">
        <CardContent>
          <Stack spacing={1}>
            <Typography variant="h5" fontWeight={800}>繁殖Farm Pro 操作ガイド</Typography>
            <Typography color="text.secondary">
              農場名：{settings.farmName || '未設定'}
              {settings.staffName ? ` / 担当者：${settings.staffName}` : ''}
            </Typography>
            <Typography color="text.secondary">
              迷った時は、まずホームを開いて主要業務メニューから確認します。
            </Typography>
          </Stack>
        </CardContent>
      </Card>

      <Section title="基本の使い方">
        <Line>1. まず「ホーム」を開きます。</Line>
        <Line>2. 今日見るものは「アラート」と「カレンダー」で確認します。</Line>
        <Line>3. 母牛は「繁殖牛台帳」、子牛は「子牛台帳」で確認します。</Line>
        <Line>4. 出荷・販売、経費、月別収支は「出荷・販売と収支」から確認します。</Line>
        <Line>5. データを守るため、定期的に「バックアップ」を行います。</Line>
      </Section>

      <Section title="最初に登録するもの">
        <Line>1. 「設定」で農場名・担当者名などを登録します。</Line>
        <Line>2. 「繁殖牛台帳」で母牛・繁殖牛の基本情報を登録します。</Line>
        <Line>3. 「繁殖管理」で授精日・妊娠鑑定・分娩予定日を登録します。</Line>
        <Line>4. 「分娩記録」で分娩結果、初乳確認、子牛台帳登録の状態を確認します。</Line>
        <Line>5. 生まれた子牛は「子牛台帳」で確認します。</Line>
      </Section>

      <Section title="毎日の確認の流れ">
        <Line>1. ホームを開いて、登録漏れや確認待ちを確認します。</Line>
        <Line>2. 「アラート」で期限切れ・近日予定・治療中・休薬中を確認します。</Line>
        <Line>3. 「カレンダー」で今月の予定を確認します。</Line>
        <Line>4. 子牛の体調や治療は「子牛台帳」または「治療」から確認します。</Line>
        <Line>5. 作業が終わったら、各画面で状態やメモを更新します。</Line>
      </Section>

      <Section title="母牛・繁殖の管理">
        <Line>繁殖牛台帳：母牛・繁殖牛の耳標番号、名号、生年月日、父牛、母牛、BLV状態を確認します。</Line>
        <Line>繁殖牛カルテ：繁殖牛ごとの繁殖記録、ワクチン、BLV、予定、治療履歴を確認します。</Line>
        <Line>繁殖管理：発情日、授精日、種雄牛、妊娠結果、分娩予定日を管理します。</Line>
        <Line>分娩記録：分娩日、分娩結果、初乳確認、子牛台帳への登録状態を確認します。</Line>
      </Section>

      <Section title="子牛・健康の管理">
        <Line>子牛台帳：現在在籍している子牛を一覧で確認します。販売済み・死亡など非在籍の子牛は通常一覧から外れます。</Line>
        <Line>子牛カルテ：子牛の基本情報、治療記録、ワクチン記録、出荷・販売記録、給与目安、対応履歴をまとめて確認します。</Line>
        <Line>治療：症状、診断名、薬剤、投薬量、休薬終了日、経過を管理します。</Line>
        <Line>ワクチン：接種日、次回予定日、接種状態を管理します。</Line>
        <Line>対応記録：給餌アラートなどへの対応履歴を確認します。</Line>
      </Section>

      <Section title="出荷・販売と収支">
        <Line>出荷・販売：子牛や繁殖牛の出荷予定、出荷済み、販売済みを管理します。</Line>
        <Line>収支管理：売上、経費、差引収支を月別に確認します。</Line>
        <Line>経費管理：飼料費、診療・医薬品費、繁殖費、その他経費を登録します。</Line>
        <Line>レポート：登録数や近日予定などをまとめて確認します。</Line>
      </Section>

      <Section title="印刷・CSV・バックアップ">
        <Line>印刷：上部ナビには置かず、必要な各画面の中にある印刷ボタンから使います。</Line>
        <Line>CSV出力：一覧や収支など、必要な画面からCSVを出力できます。</Line>
        <Line>バックアップ：全データをJSONで保存できます。定期的に保存しておくと安心です。</Line>
      </Section>

      <Section title="検索・絞り込み">
        <Line>各一覧画面では検索欄を使って、耳標番号・名前・メモなどで絞り込みできます。</Line>
        <Line>条件を戻したい時は「クリア」を押します。</Line>
      </Section>

      <Section title="よくあるトラブル">
        <Line>画面が変わらない：Chromeで Ctrl + F5 を押して強制更新します。</Line>
        <Line>表示がおかしい：いったんホームに戻り、もう一度目的の画面を開きます。</Line>
        <Line>serverが起動しない：serverフォルダで npm run dev を実行しているか確認します。</Line>
        <Line>clientが起動しない：clientフォルダで npm run dev を実行しているか確認します。</Line>
        <Line>黒い画面を閉じるとアプリは止まります。終了する時は Ctrl + C を押してから閉じます。</Line>
      </Section>

      <Divider />

      <Typography color="text.secondary">
        メモ：このヘルプ画面は印刷できます。紙で手元に置きたい場合は「印刷する」を押してください。
      </Typography>
    </Stack>
  );
}
