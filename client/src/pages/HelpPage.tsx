import { useEffect, useState } from 'react';
import { Button, Card, CardContent, Divider, Stack, Typography } from '@mui/material';
import type { FarmSettings } from '../types/settings';
import { getFarmSettings } from '../services/settingsApi';

const emptySettings: FarmSettings = {
  farmName: '繁殖Farm Pro',
  ownerName: '',
  staffName: '',
  phone: '',
  address: '',
  estrousCycleDays: 21,
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
              この画面では、繁殖Farm Pro の基本的な使い方を確認できます。
            </Typography>
          </Stack>
        </CardContent>
      </Card>

      <Section title="まず最初に登録するもの">
        <Line>1. 「設定」で農場名・担当者名などを登録します。</Line>
        <Line>2. 「牛台帳」で繁殖牛・成牛を登録します。</Line>
        <Line>3. 「子牛管理」で生まれた子牛を登録します。</Line>
        <Line>4. 「繁殖管理」で授精日・妊娠鑑定・分娩予定日を登録します。</Line>
        <Line>5. 「予定」「ワクチン」「BLV」「治療」を必要に応じて登録します。</Line>
      </Section>

      <Section title="毎日の確認の流れ">
        <Line>1. ホームを開いて、注意リストを確認します。</Line>
        <Line>2. 「アラート」で期限切れ・近日予定・治療中・休薬中を確認します。</Line>
        <Line>3. 「カレンダー」で今月の予定を確認します。</Line>
        <Line>4. 必要な作業が終わったら、予定やワクチンなどの状態を更新します。</Line>
      </Section>

      <Section title="各機能の使い方">
        <Line>設定：農場名、代表者名、担当者名、電話番号、住所、メモを登録します。</Line>
        <Line>牛台帳：成牛・繁殖牛の基本情報を登録します。個体カルテから、その牛の履歴も確認できます。</Line>
        <Line>子牛管理：子牛の基本情報、日齢、DGを確認します。子牛カルテからワクチン・予定・治療履歴を確認できます。</Line>
        <Line>繁殖管理：発情日、授精日、種雄牛、妊娠結果、分娩予定日を管理します。</Line>
        <Line>ワクチン：接種日、次回予定日、接種状態を管理します。</Line>
        <Line>BLV：検査日、結果、次回検査予定日、隔離メモを管理します。</Line>
        <Line>予定：分娩、ワクチン、BLV検査、妊娠鑑定、治療、その他の作業予定を管理します。</Line>
        <Line>治療：症状、診断名、薬剤、投薬量、休薬終了日、経過を管理します。</Line>
      </Section>

      <Section title="入力を楽にする機能">
        <Line>登録画面では「登録済み成牛から選択」や「登録済み子牛から選択」を使えます。</Line>
        <Line>選択すると、耳標番号・牛名、または子牛耳標番号・子牛名が自動入力されます。</Line>
        <Line>手入力もこれまで通り使えます。</Line>
      </Section>

      <Section title="検索・絞り込み">
        <Line>各一覧画面では検索欄を使って、耳標番号・名前・メモなどで絞り込みできます。</Line>
        <Line>条件を戻したい時は「クリア」を押します。</Line>
      </Section>

      <Section title="印刷・CSV・バックアップ">
        <Line>印刷：各一覧、カルテ、アラート、カレンダーなどを印刷できます。</Line>
        <Line>レポート：登録数や近日予定などをまとめて確認できます。CSV出力もできます。</Line>
        <Line>バックアップ：全データをJSONで保存できます。復元もできます。</Line>
      </Section>

      <Section title="よくあるトラブル">
        <Line>画面が変わらない：Chromeで Ctrl + F5 を押して強制更新します。</Line>
        <Line>メニューが出ない：ZIPの中身を正しい場所に上書きできているか確認します。</Line>
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
