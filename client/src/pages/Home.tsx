import { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Alert, Button, Card, CardContent, Divider, Grid, Stack, Typography } from '@mui/material';
import { DashboardData } from '../types/dashboard';
import { getDashboard } from '../services/dashboardApi';

const emptyDashboard: DashboardData = {
  counts: { cattle: 0, calves: 0, breedings: 0, vaccines: 0, blvPositive: 0 },
  alerts: { nearCalvings: [], vaccineDueSoon: [], blvDueSoon: [] }
};

function daysLabel(days: number | null) {
  if (days === null) return '';
  if (days === 0) return '今日';
  if (days < 0) return `${Math.abs(days)}日超過`;
  return `あと${days}日`;
}

export function Home() {
  const [dashboard, setDashboard] = useState<DashboardData>(emptyDashboard);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDashboard().then(setDashboard).finally(() => setLoading(false));
  }, []);

  const summaryCards = [
    { title: '登録牛', value: `${dashboard.counts.cattle}頭`, icon: '🐄', to: '/cattle' },
    { title: '子牛', value: `${dashboard.counts.calves}頭`, icon: '🍼', to: '/calves' },
    { title: '繁殖記録', value: `${dashboard.counts.breedings}件`, icon: '📅', to: '/breedings' },
    { title: 'ワクチン', value: `${dashboard.counts.vaccines}件`, icon: '💉', to: '/vaccines' },
    { title: 'BLV陽性', value: `${dashboard.counts.blvPositive}頭`, icon: '🧪', to: '/blv' }
  ];

  return (
    <Stack spacing={2}>
      <Typography variant="h5" fontWeight={800}>ホーム</Typography>
      {loading && <Alert severity="info">ダッシュボードを読み込み中です...</Alert>}

      <Grid container spacing={2}>
        {summaryCards.map((card) => (
          <Grid item xs={6} sm={2.4} key={card.title}>
            <Card>
              <CardContent>
                <Typography fontSize={28}>{card.icon}</Typography>
                <Typography variant="body2" color="text.secondary">{card.title}</Typography>
                <Typography variant="h5" fontWeight={800}>{card.value}</Typography>
                <Button component={RouterLink} to={card.to} size="small" sx={{ mt: 1 }}>開く</Button>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Card>
        <CardContent>
          <Stack spacing={1.5}>
            <Typography variant="h6" fontWeight={800}>注意リスト</Typography>

            <Typography fontWeight={700}>🐮 分娩予定が近い牛</Typography>
            {dashboard.alerts.nearCalvings.length === 0 ? (
              <Typography color="text.secondary">60日以内の分娩予定はありません。</Typography>
            ) : dashboard.alerts.nearCalvings.map((item) => (
              <Alert key={item.id} severity="warning">
                {item.cowName} / {item.expectedCalvingDate} / {daysLabel(item.daysUntil)}
              </Alert>
            ))}

            <Divider />

            <Typography fontWeight={700}>💉 ワクチン予定</Typography>
            {dashboard.alerts.vaccineDueSoon.length === 0 ? (
              <Typography color="text.secondary">30日以内の未接種ワクチン予定はありません。</Typography>
            ) : dashboard.alerts.vaccineDueSoon.map((item) => (
              <Alert key={item.id} severity="info">
                {item.targetName} / {item.vaccineName} / {item.nextDueDate} / {daysLabel(item.daysUntil)}
              </Alert>
            ))}

            <Divider />

            <Typography fontWeight={700}>🧪 BLV次回検査</Typography>
            {dashboard.alerts.blvDueSoon.length === 0 ? (
              <Typography color="text.secondary">60日以内のBLV次回検査予定はありません。</Typography>
            ) : dashboard.alerts.blvDueSoon.map((item) => (
              <Alert key={item.id} severity="success">
                {item.cowName} / {item.nextTestDate} / {daysLabel(item.daysUntil)}
              </Alert>
            ))}
          </Stack>
        </CardContent>
      </Card>

      <Stack direction="row" spacing={1}>
        <Button component={RouterLink} to="/cattle" variant="contained" size="large" fullWidth>牛台帳</Button>
        <Button component={RouterLink} to="/calves" variant="outlined" size="large" fullWidth>子牛</Button>
        <Button component={RouterLink} to="/breedings" variant="outlined" size="large" fullWidth>繁殖</Button>
        <Button component={RouterLink} to="/vaccines" variant="outlined" size="large" fullWidth>ワクチン</Button>
        <Button component={RouterLink} to="/blv" variant="outlined" size="large" fullWidth>BLV</Button>
      </Stack>
    </Stack>
  );
}
