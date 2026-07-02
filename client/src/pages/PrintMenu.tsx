import { Link as RouterLink } from 'react-router-dom';
import { Button, Card, CardContent, Grid, Stack, Typography } from '@mui/material';

const printItems = [
  { title: '牛台帳一覧', description: '登録牛の一覧を印刷します', path: '/print/cattle', icon: '🐄' },
  { title: '子牛一覧', description: '子牛管理の一覧を印刷します', path: '/print/calves', icon: '🍼' },
  { title: '繁殖記録一覧', description: '授精・妊娠・分娩予定を印刷します', path: '/print/breedings', icon: '📅' },
  { title: 'ワクチン記録一覧', description: '接種記録と次回予定を印刷します', path: '/print/vaccines', icon: '💉' },
  { title: 'BLV検査記録一覧', description: 'BLV検査結果を印刷します', path: '/print/blv', icon: '🧪' },
  { title: '予定一覧', description: '農場予定を印刷します', path: '/print/schedules', icon: '📝' },
  { title: '治療記録一覧', description: '治療・投薬・休薬を印刷します', path: '/print/treatments', icon: '🩺' }
];

export function PrintMenu() {
  return (
    <Stack spacing={2}>
      <Typography variant="h5" fontWeight={800}>印刷</Typography>
      <Typography color="text.secondary">
        印刷したい帳票を選んでください。開いた画面で「印刷する」を押すと、ブラウザの印刷画面が開きます。
      </Typography>

      <Grid container spacing={2}>
        {printItems.map((item) => (
          <Grid item xs={12} sm={6} key={item.path}>
            <Card>
              <CardContent>
                <Stack spacing={1}>
                  <Typography fontSize={30}>{item.icon}</Typography>
                  <Typography variant="h6" fontWeight={800}>{item.title}</Typography>
                  <Typography color="text.secondary">{item.description}</Typography>
                  <Button component={RouterLink} to={item.path} variant="contained">開く</Button>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Stack>
  );
}
