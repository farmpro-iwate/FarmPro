import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  CardContent,
  Grid,
  Stack,
  Typography
} from '@mui/material';

type ReportSummary = {
  cattleCount: number;
  calfCount: number;
  breedingCount: number;
  vaccineCount: number;
  blvPositiveCount: number;
  scheduleOpenCount: number;
  scheduleOverdueCount: number;
  treatmentActiveCount: number;
  withdrawalActiveCount: number;
  upcomingCalvingCount: number;
  upcomingVaccineCount: number;
  upcomingBlvCount: number;
  upcomingScheduleCount: number;

  salesCount: number;
  salesSoldCount: number;
  salesPlanCount: number;
  salesShippedCount: number;
  salesCanceledCount: number;
  salesTotalAmount: number;
  salesAverageAmount: number;
  salesAverageWeight: number;

  expenseCount: number;
  expenseTotalAmount: number;
  expenseAverageAmount: number;
  expenseFeedAmount: number;
  expenseMedicalAmount: number;
  expenseBreedingAmount: number;
  expenseOtherAmount: number;
};

const emptySummary: ReportSummary = {
  cattleCount: 0,
  calfCount: 0,
  breedingCount: 0,
  vaccineCount: 0,
  blvPositiveCount: 0,
  scheduleOpenCount: 0,
  scheduleOverdueCount: 0,
  treatmentActiveCount: 0,
  withdrawalActiveCount: 0,
  upcomingCalvingCount: 0,
  upcomingVaccineCount: 0,
  upcomingBlvCount: 0,
  upcomingScheduleCount: 0,

  salesCount: 0,
  salesSoldCount: 0,
  salesPlanCount: 0,
  salesShippedCount: 0,
  salesCanceledCount: 0,
  salesTotalAmount: 0,
  salesAverageAmount: 0,
  salesAverageWeight: 0,

  expenseCount: 0,
  expenseTotalAmount: 0,
  expenseAverageAmount: 0,
  expenseFeedAmount: 0,
  expenseMedicalAmount: 0,
  expenseBreedingAmount: 0,
  expenseOtherAmount: 0
};

function yen(value: number) {
  return `${Number(value || 0).toLocaleString('ja-JP')}円`;
}

function kg(value: number) {
  return `${Number(value || 0).toLocaleString('ja-JP')}kg`;
}

function SummaryCard({ title, value, note }: { title: string; value: string | number; note?: string }) {
  return (
    <Grid item xs={12} sm={6} md={3}>
      <Card>
        <CardContent>
          <Typography color="text.secondary">{title}</Typography>
          <Typography variant="h5" fontWeight={800}>{value}</Typography>
          {note && <Typography variant="body2" color="text.secondary">{note}</Typography>}
        </CardContent>
      </Card>
    </Grid>
  );
}

function downloadCsv(kind: string) {
  window.location.href = `http://localhost:4000/api/reports/csv/${kind}`;
}

export function ReportPage() {
  const [summary, setSummary] = useState<ReportSummary>(emptySummary);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function loadSummary() {
    setLoading(true);
    setError('');

    try {
      const res = await fetch('http://localhost:4000/api/reports/summary');
      if (!res.ok) throw new Error('レポートを取得できませんでした。');
      const data = await res.json();
      setSummary({ ...emptySummary, ...data });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'レポートを取得できませんでした。');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSummary();
  }, []);

  return (
    <Stack spacing={2}>
      <Typography variant="h5" fontWeight={800}>
        レポート・CSV出力
      </Typography>

      <Alert severity="info">
        農場全体の登録状況、近日予定、治療状況、出荷・販売状況、経費状況を確認できます。
      </Alert>

      {loading && <Typography>読み込み中...</Typography>}
      {error && <Alert severity="error">{error}</Alert>}

      {!loading && !error && (
        <>
          <Typography variant="h6" fontWeight={800}>
            経営・作業サマリー
          </Typography>

          <Grid container spacing={2}>
            <SummaryCard title="登録牛数" value={`${summary.cattleCount}頭`} />
            <SummaryCard title="子牛数" value={`${summary.calfCount}頭`} />
            <SummaryCard title="繁殖記録" value={`${summary.breedingCount}件`} />
            <SummaryCard title="ワクチン記録" value={`${summary.vaccineCount}件`} />
            <SummaryCard title="BLV陽性" value={`${summary.blvPositiveCount}頭`} />
            <SummaryCard title="未完了予定" value={`${summary.scheduleOpenCount}件`} />
            <SummaryCard title="期限切れ予定" value={`${summary.scheduleOverdueCount}件`} />
            <SummaryCard title="治療中・要再診" value={`${summary.treatmentActiveCount}件`} />
            <SummaryCard title="休薬中" value={`${summary.withdrawalActiveCount}件`} />
            <SummaryCard title="近日分娩予定" value={`${summary.upcomingCalvingCount}件`} />
            <SummaryCard title="近日ワクチン予定" value={`${summary.upcomingVaccineCount}件`} />
            <SummaryCard title="近日BLV検査予定" value={`${summary.upcomingBlvCount}件`} />
            <SummaryCard title="近日予定" value={`${summary.upcomingScheduleCount}件`} />
          </Grid>

          <Typography variant="h6" fontWeight={800}>
            出荷・販売サマリー
          </Typography>

          <Grid container spacing={2}>
            <SummaryCard title="販売記録" value={`${summary.salesCount}件`} />
            <SummaryCard title="販売済み頭数" value={`${summary.salesSoldCount}頭`} />
            <SummaryCard title="出荷予定" value={`${summary.salesPlanCount}件`} />
            <SummaryCard title="出荷済み" value={`${summary.salesShippedCount}件`} />
            <SummaryCard title="取消" value={`${summary.salesCanceledCount}件`} />
            <SummaryCard title="販売金額合計" value={yen(summary.salesTotalAmount)} />
            <SummaryCard title="平均販売金額" value={yen(summary.salesAverageAmount)} note="販売済みのみで計算" />
            <SummaryCard title="平均販売体重" value={kg(summary.salesAverageWeight)} note="販売済みのみで計算" />
          </Grid>

          <Typography variant="h6" fontWeight={800}>
            経費サマリー
          </Typography>

          <Grid container spacing={2}>
            <SummaryCard title="経費記録" value={`${summary.expenseCount}件`} />
            <SummaryCard title="経費合計" value={yen(summary.expenseTotalAmount)} />
            <SummaryCard title="平均経費" value={yen(summary.expenseAverageAmount)} />
            <SummaryCard title="飼料費合計" value={yen(summary.expenseFeedAmount)} />
            <SummaryCard title="診療・医薬品費合計" value={yen(summary.expenseMedicalAmount)} />
            <SummaryCard title="繁殖費合計" value={yen(summary.expenseBreedingAmount)} />
            <SummaryCard title="その他経費合計" value={yen(summary.expenseOtherAmount)} />
          </Grid>

          <Card>
            <CardContent>
              <Stack spacing={2}>
                <Typography variant="h6" fontWeight={800}>
                  CSV出力
                </Typography>

                <Typography color="text.secondary">
                  各データをCSVで出力できます。Excelで開いて確認できます。
                </Typography>

                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  <Button variant="outlined" onClick={() => downloadCsv('cattle')}>牛台帳CSV</Button>
                  <Button variant="outlined" onClick={() => downloadCsv('calves')}>子牛CSV</Button>
                  <Button variant="outlined" onClick={() => downloadCsv('breedings')}>繁殖CSV</Button>
                  <Button variant="outlined" onClick={() => downloadCsv('vaccines')}>ワクチンCSV</Button>
                  <Button variant="outlined" onClick={() => downloadCsv('blv')}>BLV CSV</Button>
                  <Button variant="outlined" onClick={() => downloadCsv('schedules')}>予定CSV</Button>
                  <Button variant="outlined" onClick={() => downloadCsv('treatments')}>治療CSV</Button>
                  <Button variant="contained" onClick={() => downloadCsv('sales')}>出荷販売CSV</Button>
                  <Button variant="contained" onClick={() => downloadCsv('expenses')}>経費CSV</Button>
                </Stack>
              </Stack>
            </CardContent>
          </Card>
        </>
      )}
    </Stack>
  );
}
