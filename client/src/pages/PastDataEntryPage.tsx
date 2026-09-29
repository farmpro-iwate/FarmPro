import { Link as RouterLink } from 'react-router-dom';
import { Alert, Button, Card, CardContent, Grid, Stack, Typography } from '@mui/material';

const entries = [
  {
    title: '販売',
    description: 'FarmPro使用前に販売した牛・子牛の実績を、過去の販売日で登録します。',
    to: '/sales/new',
    button: '販売記録を入力',
  },
  {
    title: '経費',
    description: 'FarmPro使用前に支払った飼料費・診療費などを、過去の支払日で登録します。',
    to: '/expenses/new',
    button: '経費を入力',
  },
  {
    title: '分娩',
    description: '過去の分娩記録を、現在の分娩登録画面から入力します。',
    to: '/calvings/new',
    button: '分娩記録を入力',
  },
  {
    title: '繁殖',
    description: '発情・人工授精・ET・妊娠鑑定は、現在の繁殖管理の流れを使って過去日で記録します。',
    to: '/breedings',
    button: '繁殖管理を開く',
  },
] as const;

export function PastDataEntryPage() {
  return (
    <Stack spacing={2}>
      <Stack spacing={0.5}>
        <Typography variant="h5" fontWeight={900}>過去データ入力</Typography>
        <Typography color="text.secondary">
          FarmProを使い始める前の記録を、今ある登録画面を使って入力できます。
        </Typography>
      </Stack>

      <Alert severity="info">
        新しい保存方式は使いません。各項目を選ぶと、現在使っている登録画面へ移動します。日付には実際の過去日を入力してください。
      </Alert>

      <Grid container spacing={1.5}>
        {entries.map((entry) => (
          <Grid item xs={12} sm={6} key={entry.title}>
            <Card variant="outlined" sx={{ height: '100%' }}>
              <CardContent sx={{ height: '100%' }}>
                <Stack spacing={1.25} sx={{ height: '100%' }}>
                  <Typography variant="h6" fontWeight={900}>{entry.title}</Typography>
                  <Typography color="text.secondary" sx={{ flexGrow: 1 }}>
                    {entry.description}
                  </Typography>
                  <Button
                    component={RouterLink}
                    to={entry.to}
                    variant="contained"
                    fullWidth
                    sx={{ minHeight: 44, fontWeight: 800 }}
                  >
                    {entry.button}
                  </Button>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Alert severity="warning">
        妊娠鑑定は単独で新規作成せず、対象牛の繁殖記録から進めてください。既存の繁殖履歴とのつながりを保つためです。
      </Alert>
    </Stack>
  );
}
