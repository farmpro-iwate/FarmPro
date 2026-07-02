import { useEffect, useState } from 'react';
import { Alert, Button, Card, CardContent, Divider, Grid, Stack, Typography } from '@mui/material';
import { ReportSummary } from '../types/report';
import { downloadCsv, getReportSummary } from '../services/reportApi';

const emptySummary: ReportSummary = {
  counts: {
    cattle: 0,
    calves: 0,
    breedings: 0,
    vaccines: 0,
    blvPositive: 0,
    openSchedules: 0,
    activeTreatments: 0,
    withdrawal: 0
  },
  nearSchedules: [],
  withdrawalTreatments: []
};

function daysLabel(days: number | null) {
  if (days === null) return '';
  if (days === 0) return '今日';
  if (days < 0) return `${Math.abs(days)}日超過`;
  return `あと${days}日`;
}

export function ReportPage() {
  const [summary, setSummary] = useState<ReportSummary>(emptySummary);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getReportSummary().then(setSummary).finally(() => setLoading(false));
  }, []);

  const countCards = [
    { title: '登録牛', value: `${summary.counts.cattle}頭`, icon: '🐄' },
    { title: '子牛', value: `${summary.counts.calves}頭`, icon: '🍼' },
    { title: '繁殖記録', value: `${summary.counts.breedings}件`, icon: '📅' },
    { title: 'ワクチン', value: `${summary.counts.vaccines}件`, icon: '💉' },
    { title: 'BLV陽性', value: `${summary.counts.blvPositive}頭`, icon: '🧪' },
    { title: '未完了予定', value: `${summary.counts.openSchedules}件`, icon: '📝' },
    { title: '治療中', value: `${summary.counts.activeTreatments}件`, icon: '🩺' },
    { title: '休薬中', value: `${summary.counts.withdrawal}件`, icon: '⏳' }
  ];

  const csvButtons = [
    { label: '牛台帳CSV', kind: 'cattle' },
    { label: '子牛CSV', kind: 'calves' },
    { label: '繁殖CSV', kind: 'breedings' },
    { label: 'ワクチンCSV', kind: 'vaccines' },
    { label: 'BLV CSV', kind: 'blv' },
    { label: '予定CSV', kind: 'schedules' },
    { label: '治療CSV', kind: 'treatments' }
  ];

  return (
    <Stack spacing={2}>
      <Typography variant="h5" fontWeight={800}>レポート</Typography>
      {loading && <Alert severity="info">レポートを読み込み中です...</Alert>}

      <Grid container spacing={2}>
        {countCards.map((card) => (
          <Grid item xs={6} sm={3} key={card.title}>
            <Card>
              <CardContent>
                <Typography fontSize={28}>{card.icon}</Typography>
                <Typography variant="body2" color="text.secondary">{card.title}</Typography>
                <Typography variant="h5" fontWeight={800}>{card.value}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Card>
        <CardContent>
          <Stack spacing={1.5}>
            <Typography variant="h6" fontWeight={800}>近日予定</Typography>
            {summary.nearSchedules.length === 0 ? (
              <Typography color="text.secondary">14日以内の未完了予定はありません。</Typography>
            ) : summary.nearSchedules.map((item) => (
              <Alert key={item.id} severity="warning">
                {item.scheduleType} / {item.title} / {item.targetName || '-'} / {item.dueDate} / {daysLabel(item.daysUntil)}
              </Alert>
            ))}

            <Divider />

            <Typography variant="h6" fontWeight={800}>休薬中</Typography>
            {summary.withdrawalTreatments.length === 0 ? (
              <Typography color="text.secondary">休薬中の治療記録はありません。</Typography>
            ) : summary.withdrawalTreatments.map((item) => (
              <Alert key={item.id} severity="info">
                {item.targetName} / {item.medicine || '-'} / 休薬終了日 {item.withdrawalEndDate} / {daysLabel(item.daysUntil)}
              </Alert>
            ))}
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Stack spacing={1.5}>
            <Typography variant="h6" fontWeight={800}>CSV出力</Typography>
            <Typography color="text.secondary">必要なデータをCSVで保存できます。</Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              {csvButtons.map((button) => (
                <Button key={button.kind} variant="outlined" onClick={() => downloadCsv(button.kind)}>
                  {button.label}
                </Button>
              ))}
            </Stack>
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
