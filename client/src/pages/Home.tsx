import { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Alert, Button, Card, CardContent, Divider, Grid, Stack, Typography } from '@mui/material';
import { DashboardData } from '../types/dashboard';
import { getDashboard } from '../services/dashboardApi';
import { FarmSettings } from '../types/settings';
import { getFarmSettings } from '../services/settingsApi';

const emptyDashboard: DashboardData = {
  counts: { cattle: 0, calves: 0, breedings: 0, vaccines: 0, blvPositive: 0 },
  alerts: { nearCalvings: [], vaccineDueSoon: [], blvDueSoon: [] }
};

const emptySettings: FarmSettings = {
  farmName: '繁殖Farm Pro',
  ownerName: '',
  staffName: '',
  phone: '',
  address: '',
  memo: ''
};

function daysLabel(days: number | null) {
  if (days === null) return '';
  if (days === 0) return '今日';
  if (days < 0) return `${Math.abs(days)}日超過`;
  return `あと${days}日`;
}

export function Home() {
  const [dashboard, setDashboard] = useState<DashboardData>(emptyDashboard);
  const [settings, setSettings] = useState<FarmSettings>(emptySettings);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getDashboard().then(setDashboard),
      getFarmSettings().then(setSettings).catch(() => setSettings(emptySettings))
    ]).finally(() => setLoading(false));
  }, []);

  const summaryCards = [
    { title: '登録牛', value: `${dashboard.counts.cattle}頭`, icon: '🐄', to: '/cattle' },
    { title: '子牛', value: `${dashboard.counts.calves}頭`, icon: '🍼', to: '/calves' },
    { title: '繁殖記録', value: `${dashboard.counts.breedings}件`, icon: '📅', to: '/breedings' },
    { title: 'ワクチン', value: `${dashboard.counts.vaccines}件`, icon: '💉', to: '/vaccines' },
    { title: 'BLV陽性', value: `${dashboard.counts.blvPositive}頭`, icon: '🧪', to: '/blv' }
  ];

  const quickRegisterItems = [
    { title: '牛を登録', icon: '🐄', to: '/cattle/new', description: '成牛・繁殖牛を追加' },
    { title: '子牛を登録', icon: '🍼', to: '/calves/new', description: '出生子牛を追加' },
    { title: '繁殖を登録', icon: '📅', to: '/breedings/new', description: '授精・妊娠鑑定を追加' },
    { title: 'ワクチンを登録', icon: '💉', to: '/vaccines/new', description: '接種予定・実績を追加' },
    { title: 'BLVを登録', icon: '🧪', to: '/blv/new', description: 'BLV検査記録を追加' },
    { title: '予定を登録', icon: '📝', to: '/schedules/new', description: '作業予定を追加' },
    { title: '治療を登録', icon: '🩺', to: '/treatments/new', description: '治療・投薬を追加' }
  ];

  const shortcutItems = [
    { title: 'アラート', to: '/alerts', icon: '🚨' },
    { title: 'カレンダー', to: '/calendar', icon: '🗓️' },
    { title: '設定', to: '/settings', icon: '⚙️' },
    { title: 'ヘルプ', to: '/help', icon: '❓' },
    { title: '検索する', to: '/cattle', icon: '🔎' },
    { title: '近日予定を見る', to: '/schedules', icon: '📝' },
    { title: '治療中を見る', to: '/treatments', icon: '🩺' },
    { title: 'CSV出力', to: '/reports', icon: '📊' },
    { title: 'バックアップ', to: '/backups', icon: '💾' },
    { title: '印刷', to: '/print', icon: '🖨️' }
  ];

  return (
    <Stack spacing={2}>
      <Card>
        <CardContent>
          <Stack spacing={0.5}>
            <Typography variant="h5" fontWeight={800}>{settings.farmName || 'ホーム'}</Typography>
            <Typography color="text.secondary">
              {settings.staffName ? `担当者：${settings.staffName}` : '繁殖Farm Pro ホーム'}
            </Typography>
          </Stack>
        </CardContent>
      </Card>

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
            <Typography variant="h6" fontWeight={800}>クイック登録</Typography>
            <Typography color="text.secondary">よく使う登録画面へすぐ移動できます。</Typography>
            <Grid container spacing={1.5}>
              {quickRegisterItems.map((item) => (
                <Grid item xs={12} sm={6} md={4} key={item.to}>
                  <Card variant="outlined">
                    <CardContent>
                      <Stack spacing={1}>
                        <Typography fontSize={30}>{item.icon}</Typography>
                        <Typography fontWeight={800}>{item.title}</Typography>
                        <Typography variant="body2" color="text.secondary">{item.description}</Typography>
                        <Button component={RouterLink} to={item.to} variant="contained" fullWidth>登録する</Button>
                      </Stack>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Stack spacing={1.5}>
            <Typography variant="h6" fontWeight={800}>作業ショートカット</Typography>
            <Grid container spacing={1}>
              {shortcutItems.map((item) => (
                <Grid item xs={6} sm={4} key={item.to}>
                  <Button component={RouterLink} to={item.to} variant="outlined" fullWidth sx={{ py: 1.5 }}>
                    {item.icon} {item.title}
                  </Button>
                </Grid>
              ))}
            </Grid>
          </Stack>
        </CardContent>
      </Card>

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
    </Stack>
  );
}
