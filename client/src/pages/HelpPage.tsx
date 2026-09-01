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
import { getStoredAuthUser } from '../services/authClient';

const feedbackFormUrl = 'https://docs.google.com/forms/d/e/1FAIpQLSfnVbG6EPMSQDvdKe7K1wac4K_58nOxm9KlvoAIsaj_jm-HEA/viewform?usp=header';

const emptySettings: FarmSettings = {
  farmName: 'FarmPro',
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
  const authUser = getStoredAuthUser();
  const plan = authUser?.plan ?? 'free';
  const isCloudPlan = plan === 'standard' || plan === 'pro';

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
        <Typography variant="h5" fontWeight={800}>ヘルプ・使い方ガイド</Typography>
      </Stack>

      <Card className="print-card">
        <CardContent>
          <Stack spacing={1}>
            <Typography variant="h5" fontWeight={800}>FarmPro 使い方ガイド</Typography>
            <Typography color="text.secondary">
              農場名：{settings.farmName || '未設定'}
              {settings.staffName ? ` / 担当者：${settings.staffName}` : ''}
            </Typography>
            <Alert severity="info">
              {isCloudPlan
                ? 'Standard / Proでは、FarmProのデータをクラウドへ保存し、複数端末で利用できます。'
                : 'Freeでは、FarmProのデータを主に使用中の端末内へ保存します。定期的にバックアップを作成してください。'}
            </Alert>
          </Stack>
        </CardContent>
      </Card>

      <Section title="利用を始める前に">
        <Line>1. FarmProへログインし、普段使うスマートフォンやパソコンで開きます。</Line>
        <Line>2. 「設定」で農場名・代表者名などの情報を確認します。</Line>
        <Line>3. 「マスター登録」で、よく使う種雄牛・薬品・取引先などを必要な分だけ登録します。</Line>
        <Line>4. 「バックアップ／復元」を一度開き、バックアップ方法を確認しておきます。</Line>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} className="no-print">
          <Button component={RouterLink} to="/settings" variant="outlined">設定を開く</Button>
          <Button component={RouterLink} to="/masters" variant="outlined">マスター登録を開く</Button>
          <Button component={RouterLink} to="/backups" variant="outlined">バックアップを開く</Button>
        </Stack>
      </Section>

      <Section title="基本の記録の流れ">
        <Line>1. 「牛台帳」で繁殖牛を登録します。</Line>
        <Line>2. 「繁殖管理」で発情、人工授精または受精卵移植を登録します。</Line>
        <Line>3. 妊娠鑑定結果と分娩予定日を登録します。</Line>
        <Line>4. 分娩時は「分娩管理」で対象牛を選び、分娩内容を登録します。</Line>
        <Line>5. 生存子牛は分娩記録から子牛台帳へつながります。</Line>
        <Alert severity="info">
          受精卵移植では、分娩母・受卵牛と、遺伝的母牛・供卵牛を分けて保存します。
        </Alert>
      </Section>

      <Section title="毎日の確認の流れ">
        <Line>1. ホームで農場の現在状況と今日やることを確認します。</Line>
        <Line>2. 「予定」で期限切れや近日予定を確認します。</Line>
        <Line>3. 「カレンダー」で今月の予定を確認します。</Line>
        <Line>4. 現場作業が終わったら、該当する記録を登録・更新します。</Line>
        <Line>5. 個体カルテで、その牛の履歴と次の予定を確認します。</Line>
      </Section>

      <Section title="入力を楽にする機能">
        <Line>登録画面では、登録済みの成牛や子牛、繁殖記録から対象を選択できます。</Line>
        <Line>選択すると、耳標番号・牛名・分娩予定日など、利用できる情報が自動入力されます。</Line>
        <Line>FarmProでは画面上の識別を耳標番号中心にしています。</Line>
      </Section>

      <Section title="データ保存とバックアップ">
        {isCloudPlan ? (
          <>
            <Alert severity="info">Standard / Proでは、クラウド保存と複数端末での利用に対応しています。</Alert>
            <Line>各管理画面を開いたときに、クラウドの最新データを確認して端末側へ反映します。</Line>
            <Line>通信できない場合は端末側のデータを利用し、通信できる状態で対象画面を開くと最新データを確認します。</Line>
            <Line>大切なデータについては、必要に応じて手動バックアップも保管してください。</Line>
          </>
        ) : (
          <>
            <Alert severity="warning">Freeではデータを主にこの端末のブラウザ内へ保存します。サイトデータを削除するとデータが消える可能性があります。</Alert>
            <Line>機種変更や修理の前には、必ずバックアップJSONを保存してください。</Line>
            <Line>バックアップは端末内だけでなく、パソコンやクラウドなど別の場所にもコピーしてください。</Line>
          </>
        )}
        <Line>復元すると現在の端末内データが入れ替わる場合があるため、復元前にも現在のバックアップを保存してください。</Line>
      </Section>

      <Section title="料金プラン">
        <Line>Free：繁殖雌牛10頭まで無料で利用できます。</Line>
        <Line>Standard：繁殖雌牛11〜50頭、月額2,750円（税込）です。</Line>
        <Line>Pro：繁殖雌牛51頭以上、月額5,500円（税込）です。</Line>
        <Line>Standard / Proではクラウド保存と複数端末での利用に対応します。</Line>
        <Button component={RouterLink} to="/paid-plan" variant="outlined" className="no-print">料金プランを確認する</Button>
      </Section>

      <Section title="よくあるトラブル">
        <Line>画面が更新されない：ブラウザを再読み込みしてください。</Line>
        <Line>以前の表示が残る：一度画面を閉じて開き直してください。Free利用中はサイトデータを削除しないでください。</Line>
        <Line>ログインできない：メールアドレスとパスワードを確認し、「パスワードを忘れた方」から再設定できます。</Line>
        <Line>データが見つからない：ログインしている農場アカウントが正しいか確認してください。</Line>
        <Line>復元できない：FarmProで作成したバックアップJSONか確認してください。</Line>
      </Section>

      <Section title="不具合・ご要望・お問い合わせ">
        <Line>画面が開かない、登録できない、分かりにくい、追加してほしい機能がある場合は、専用フォームからお知らせください。</Line>
        <Line>使用端末・画面名・困った内容・その前に行った操作を入力すると、原因確認がしやすくなります。</Line>
        <Line>可能であれば、画面のスクリーンショットも一緒にご用意ください。</Line>
        <Alert severity="info">
          フォームはGoogleフォームで開きます。FarmProの農場データが自動で送信されることはありません。
        </Alert>
        <Button
          component="a"
          href={feedbackFormUrl}
          target="_blank"
          rel="noopener noreferrer"
          variant="contained"
          size="large"
          fullWidth
          className="no-print"
          sx={{ minHeight: 52, fontWeight: 800 }}
        >
          お問い合わせフォームを開く
        </Button>
      </Section>

      <Divider />

      <Typography color="text.secondary">
        このガイドは印刷して、FarmProの操作確認用として利用できます。
      </Typography>
    </Stack>
  );
}

export default HelpPage;
