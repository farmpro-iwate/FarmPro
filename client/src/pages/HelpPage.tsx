import { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Alert,
  Button,
  Card,
  CardContent,
  Divider,
  Stack,
  Typography,
} from '@mui/material';
import type { FarmSettings } from '../types/settings';
import { getFarmSettings } from '../services/settingsApi';

const emptySettings: FarmSettings = {
  farmName: '繁殖Farm Pro',
  ownerName: '',
  staffName: '',
  phone: '',
  address: '',
  estrousCycleDays: 21,
  bullMasters: [],
  supplierMasters: [],
  memo: '',
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
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1}
        justifyContent="space-between"
        alignItems={{ xs: 'stretch', sm: 'center' }}
        className="no-print"
      >
        <Typography variant="h5" fontWeight={800}>ヘルプ・試用ガイド</Typography>
        <Button variant="contained" onClick={() => window.print()}>印刷する</Button>
      </Stack>

      <Card className="print-card">
        <CardContent>
          <Stack spacing={1}>
            <Typography variant="h5" fontWeight={800}>繁殖Farm Pro スマホ試用ガイド</Typography>
            <Typography color="text.secondary">
              農場名：{settings.farmName || '未設定'}
              {settings.staffName ? ` / 担当者：${settings.staffName}` : ''}
            </Typography>
            <Alert severity="info">
              FarmProのデータは、使用しているスマホまたはブラウザの端末内に保存されます。
            </Alert>
          </Stack>
        </CardContent>
      </Card>

      <Section title="試用を始める前に">
        <Line>1. FarmProを普段使うスマホのブラウザで開きます。</Line>
        <Line>2. 「設定」で農場名と担当者名を登録します。</Line>
        <Line>3. 「マスター登録」で、よく使う種雄牛・薬品・取引先などを必要な分だけ登録します。</Line>
        <Line>4. 「バックアップ／復元」を開き、保存場所と操作を一度確認します。</Line>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} className="no-print">
          <Button component={RouterLink} to="/settings" variant="outlined">設定を開く</Button>
          <Button component={RouterLink} to="/masters" variant="outlined">マスター登録を開く</Button>
          <Button component={RouterLink} to="/backups" variant="outlined">バックアップを開く</Button>
        </Stack>
      </Section>

      <Section title="最初に試す基本の流れ">
        <Line>1. 「牛台帳」で繁殖牛を1頭登録します。</Line>
        <Line>2. 「繁殖管理」で人工授精または受精卵移植を登録します。</Line>
        <Line>3. 妊娠鑑定結果と分娩予定日を登録します。</Line>
        <Line>4. 分娩時は「分娩管理」で受胎済み繁殖記録を選び、分娩内容を登録します。</Line>
        <Line>5. 生存子牛は分娩記録から子牛台帳へ登録します。</Line>
        <Alert severity="info">
          受精卵移植では、分娩母・受卵牛と、遺伝的母牛・供卵牛を分けて保存します。
        </Alert>
      </Section>

      <Section title="毎日の確認の流れ">
        <Line>1. ホームで注意事項を確認します。</Line>
        <Line>2. 「アラート」で期限切れ、近日予定、治療中、休薬中を確認します。</Line>
        <Line>3. 「カレンダー」で今月の予定を確認します。</Line>
        <Line>4. 作業が終わったら、該当する記録を更新します。</Line>
      </Section>

      <Section title="入力を楽にする機能">
        <Line>登録画面では、登録済みの成牛や子牛、受胎済み繁殖記録を選択できます。</Line>
        <Line>選択すると、耳標番号・牛名・分娩予定日などが自動入力されます。</Line>
        <Line>候補がない場合は、これまでどおり手入力もできます。</Line>
      </Section>

      <Section title="端末内保存の大切な注意点">
        <Alert severity="warning">
          ブラウザの履歴・サイトデータを削除したり、スマホを初期化したりすると、FarmProのデータが消える可能性があります。
        </Alert>
        <Line>同じURLでも、別のスマホや別のブラウザにはデータは自動で移りません。</Line>
        <Line>機種変更や修理の前には、必ずバックアップJSONを保存してください。</Line>
        <Line>バックアップはスマホ内だけでなく、パソコン、メール、クラウドなど別の場所にもコピーしてください。</Line>
      </Section>

      <Section title="バックアップと復元">
        <Line>バックアップ：牛台帳、子牛、繁殖、分娩、治療、販売、設定など、端末内の全データをJSONで保存します。</Line>
        <Line>復元：バックアップファイルの農場名、保存日時、件数を確認してから実行します。</Line>
        <Line>復元すると現在の端末内データは入れ替わるため、復元前にも現在のバックアップを保存してください。</Line>
      </Section>

      <Section title="試用中に確認してほしいこと">
        <Line>・文字やボタンが小さくないか</Line>
        <Line>・登録する順番が分かりやすいか</Line>
        <Line>・必要な項目が足りているか、不要な項目が多くないか</Line>
        <Line>・実際の農作業中でも入力しやすいか</Line>
        <Line>・保存後に一覧や履歴へ正しく反映されるか</Line>
        <Line>気づいた点は、画面名・操作内容・表示された文言と一緒に記録してください。</Line>
      </Section>

      <Section title="よくあるトラブル">
        <Line>画面が更新されない：ブラウザを閉じて開き直すか、画面を再読み込みします。</Line>
        <Line>以前の表示が残る：ブラウザの再読み込みを行います。ただし、サイトデータの削除はしないでください。</Line>
        <Line>データが別の端末にない：端末内保存のため正常です。元の端末でバックアップし、新しい端末で復元します。</Line>
        <Line>復元できない：FarmProで作成したJSONファイルか、アプリのデータ形式が一致しているか確認します。</Line>
      </Section>

      <Divider />

      <Typography color="text.secondary">
        このガイドは印刷できます。試用者へ紙で渡す場合は「印刷する」を押してください。
      </Typography>
    </Stack>
  );
}

export default HelpPage;
