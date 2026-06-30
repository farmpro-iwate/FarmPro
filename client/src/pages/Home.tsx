import { Grid, Card, CardContent, Stack, Typography, Button } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';

const summaryCards = [
  { title: '登録牛', value: '11頭', icon: '🐄' },
  { title: '分娩予定', value: '2頭', icon: '🐮' },
  { title: '離乳予定', value: '1頭', icon: '🍼' },
  { title: 'BLV検査', value: '0頭', icon: '🦟' }
];

export function Home() {
  return (
    <Stack spacing={2}>
      <Typography variant="h5" fontWeight={800}>ホーム</Typography>
      <Grid container spacing={2}>
        {summaryCards.map((card) => (
          <Grid item xs={6} sm={3} key={card.title}>
            <Card><CardContent>
              <Typography fontSize={28}>{card.icon}</Typography>
              <Typography variant="body2" color="text.secondary">{card.title}</Typography>
              <Typography variant="h5" fontWeight={800}>{card.value}</Typography>
            </CardContent></Card>
          </Grid>
        ))}
      </Grid>
      <Card><CardContent><Stack spacing={1}>
        <Typography variant="h6" fontWeight={800}>今日の予定</Typography>
        <Typography>🐮 分娩予定：2頭</Typography>
        <Typography>🍼 離乳予定：1頭</Typography>
        <Typography>💉 ワクチン：1頭</Typography>
        <Typography>🦟 BLV検査：0頭</Typography>
      </Stack></CardContent></Card>
      <Button component={RouterLink} to="/cattle" variant="contained" size="large">牛台帳を開く</Button>
    </Stack>
  );
}
