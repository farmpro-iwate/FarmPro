import { getReportSummary } from '../services/reportApi';
import { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Alert,
  Button,
  Card,
  CardContent,
  Chip,
  Grid,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography
} from '@mui/material';

type DueDetail = {
  id?: string;
  actionDate?: string;
  calfName?: string;
  alertType?: string;
  actionType?: string;
  status?: string;
  nextCheckDate?: string;
  memo?: string;
  dueStatus?: string;
  priority?: string;
};

type ReportSummary = {
  cattleCount?: number;
  calfCount?: number;
  breedingCount?: number;
  vaccineCount?: number;
  treatmentCount?: number;
  scheduleCount?: number;
  salesCount?: number;
  expenseCount?: number;
  feedingCount?: number;
  feedInventoryCount?: number;
  feedingGuideCount?: number;
  salesTotal?: number;
  expenseTotal?: number;
  balanceTotal?: number;
  monthlyBalance?: {
    salesTotal?: number;
    expenseTotal?: number;
    balanceTotal?: number;
  };
  yearlyBalance?: {
    salesTotal?: number;
    expenseTotal?: number;
    balanceTotal?: number;
  };
  feedingAlerts?: {
    totalCalves?: number;
    withGuideCount?: number;
    noBirthDateCount?: number;
    noGuideCount?: number;
    noRecordCount?: number;
    shortageCalfCount?: number;
    overCalfCount?: number;
    okCalfCount?: number;
  };
  feedingAlertActions?: {
    totalCount?: number;
    notStartedCount?: number;
    inProgressCount?: number;
    doneCount?: number;
    watchingCount?: number;
    recheckCount?: number;
    thisMonthCount?: number;
  };
  feedingAlertActionDueAlerts?: {
    overdueCount?: number;
    todayCount?: number;
    soonCount?: number;
    recheckCount?: number;
    notStartedCount?: number;
    totalAttentionCount?: number;
    details?: DueDetail[];
  };
};

function numberText(v: unknown) {
  return Number(v || 0).toLocaleString('ja-JP');
}

function yen(v: unknown) {
  return `${Number(v || 0).toLocaleString('ja-JP')}円`;
}

function value(v: unknown) {
  if (v === null || v === undefined || v === '') return '-';
  return String(v);
}

function dueStatusColor(dueStatus: string) {
  if (dueStatus.includes('期限切れ')) return 'error';
  if (dueStatus.includes('今日確認')) return 'warning';
  if (dueStatus.includes('再確認')) return 'error';
  if (dueStatus.includes('まもなく')) return 'info';
  if (dueStatus.includes('未対応')) return 'warning';
  return 'default';
}

function priorityColor(priority: string) {
  if (priority === '高') return 'error';
  if (priority === '中') return 'warning';
  return 'default';
}

function StatCard({
  title,
  value,
  note
}: {
  title: string;
  value: string;
  note?: string;
}) {
  return (
    <Card>
      <CardContent>
        <Stack spacing={1}>
          <Typography color="text.secondary">{title}</Typography>
          <Typography variant="h5" fontWeight={800}>
            {value}
          </Typography>
          {note && <Typography color="text.secondary">{note}</Typography>}
        </Stack>
      </CardContent>
    </Card>
  );
}

export function ReportPage() {
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function loadSummary() {
    setLoading(true);
    setError('');

    try {
      const data = await getReportSummary();
      setSummary(data as ReportSummary);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'レポート集計を取得できませんでした。');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSummary();
  }, []);

  const feedingAlerts = summary?.feedingAlerts;
  const feedingAlertActions = summary?.feedingAlertActions;
  const dueAlerts = summary?.feedingAlertActionDueAlerts;
  const dueDetails = (dueAlerts?.details || []).slice(0, 8);

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1} alignItems="center">
        <Typography variant="h5" fontWeight={800} sx={{ flexGrow: 1 }}>
          レポート
        </Typography>

        <Button variant="outlined" onClick={loadSummary}>
          再読み込み
        </Button>
      </Stack>

      <Alert severity="info">
        農場全体の件数、収支、給与アラート、対応記録、期限アラートをまとめて確認できます。
      </Alert>

      {loading && <Typography>読み込み中...</Typography>}
      {error && <Alert severity="warning">{error}</Alert>}

      {!loading && !error && (
        <>
          <Card>
            <CardContent>
              <Stack spacing={2}>
                <Typography variant="h6" fontWeight={800}>
                  基本件数
                </Typography>

                <Grid container spacing={2}>
                  <Grid item xs={12} md={3}>
                    <StatCard title="成牛" value={`${numberText(summary?.cattleCount)}頭`} />
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <StatCard title="子牛" value={`${numberText(summary?.calfCount)}頭`} />
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <StatCard title="繁殖記録" value={`${numberText(summary?.breedingCount)}件`} />
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <StatCard title="治療記録" value={`${numberText(summary?.treatmentCount)}件`} />
                  </Grid>
                </Grid>
              </Stack>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Stack spacing={2}>
                <Typography variant="h6" fontWeight={800}>
                  収支
                </Typography>

                <Grid container spacing={2}>
                  <Grid item xs={12} md={4}>
                    <StatCard title="売上合計" value={yen(summary?.salesTotal)} />
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <StatCard title="経費合計" value={yen(summary?.expenseTotal)} />
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <StatCard title="収支合計" value={yen(summary?.balanceTotal)} />
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <StatCard title="今月の売上" value={yen(summary?.monthlyBalance?.salesTotal)} />
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <StatCard title="今月の経費" value={yen(summary?.monthlyBalance?.expenseTotal)} />
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <StatCard title="今月の収支" value={yen(summary?.monthlyBalance?.balanceTotal)} />
                  </Grid>
                </Grid>
              </Stack>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Stack spacing={2}>
                <Typography variant="h6" fontWeight={800}>
                  給与アラート集計
                </Typography>

                <Grid container spacing={2}>
                  <Grid item xs={12} md={3}>
                    <StatCard title="全子牛" value={`${numberText(feedingAlerts?.totalCalves)}頭`} />
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <StatCard title="不足気味" value={`${numberText(feedingAlerts?.shortageCalfCount)}頭`} />
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <StatCard title="多め" value={`${numberText(feedingAlerts?.overCalfCount)}頭`} />
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <StatCard title="実績なし" value={`${numberText(feedingAlerts?.noRecordCount)}頭`} />
                  </Grid>
                </Grid>
              </Stack>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Stack spacing={2}>
                <Typography variant="h6" fontWeight={800}>
                  給与アラート対応記録集計
                </Typography>

                <Alert severity="info">
                  給与アラートに対して、確認・調整・様子見などを記録した件数です。
                </Alert>

                <Grid container spacing={2}>
                  <Grid item xs={12} md={3}>
                    <StatCard title="全対応記録" value={`${numberText(feedingAlertActions?.totalCount)}件`} />
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <StatCard title="未対応" value={`${numberText(feedingAlertActions?.notStartedCount)}件`} />
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <StatCard title="対応中" value={`${numberText(feedingAlertActions?.inProgressCount)}件`} />
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <StatCard title="対応済み" value={`${numberText(feedingAlertActions?.doneCount)}件`} />
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <StatCard title="様子見" value={`${numberText(feedingAlertActions?.watchingCount)}件`} />
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <StatCard title="再確認必要" value={`${numberText(feedingAlertActions?.recheckCount)}件`} />
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <StatCard title="今月の対応" value={`${numberText(feedingAlertActions?.thisMonthCount)}件`} />
                  </Grid>
                </Grid>
              </Stack>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Stack spacing={2}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography variant="h6" fontWeight={800} sx={{ flexGrow: 1 }}>
                    対応記録 期限アラート集計
                  </Typography>

                  <Button component={RouterLink} to="/feeding-alert-actions" variant="outlined">
                    対応記録一覧へ
                  </Button>
                </Stack>

                {Number(dueAlerts?.totalAttentionCount || 0) > 0 ? (
                  <Alert severity="warning">
                    確認が必要な対応記録があります。期限切れ・今日確認・再確認必要を優先してください。
                  </Alert>
                ) : (
                  <Alert severity="success">
                    現在、確認が必要な対応記録期限アラートはありません。
                  </Alert>
                )}

                <Grid container spacing={2}>
                  <Grid item xs={12} md={2}>
                    <StatCard title="注意件数" value={`${numberText(dueAlerts?.totalAttentionCount)}件`} />
                  </Grid>
                  <Grid item xs={12} md={2}>
                    <StatCard title="期限切れ" value={`${numberText(dueAlerts?.overdueCount)}件`} />
                  </Grid>
                  <Grid item xs={12} md={2}>
                    <StatCard title="今日確認" value={`${numberText(dueAlerts?.todayCount)}件`} />
                  </Grid>
                  <Grid item xs={12} md={2}>
                    <StatCard title="まもなく確認" value={`${numberText(dueAlerts?.soonCount)}件`} />
                  </Grid>
                  <Grid item xs={12} md={2}>
                    <StatCard title="再確認必要" value={`${numberText(dueAlerts?.recheckCount)}件`} />
                  </Grid>
                  <Grid item xs={12} md={2}>
                    <StatCard title="未対応" value={`${numberText(dueAlerts?.notStartedCount)}件`} />
                  </Grid>
                </Grid>

                <Card variant="outlined">
                  <CardContent>
                    <Stack spacing={1}>
                      <Typography variant="h6" fontWeight={800}>
                        注意が必要な対応記録
                      </Typography>

                      {dueDetails.length === 0 ? (
                        <Alert severity="success">
                          注意表示する対応記録はありません。
                        </Alert>
                      ) : (
                        <Table size="small">
                          <TableHead>
                            <TableRow>
                              <TableCell>子牛</TableCell>
                              <TableCell>期限状態</TableCell>
                              <TableCell>優先度</TableCell>
                              <TableCell>状態</TableCell>
                              <TableCell>次回確認日</TableCell>
                              <TableCell>アラート</TableCell>
                              <TableCell>対応内容</TableCell>
                              <TableCell>操作</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {dueDetails.map((row, index) => (
                              <TableRow key={`${row.id || index}`}>
                                <TableCell>{value(row.calfName)}</TableCell>
                                <TableCell>
                                  <Chip
                                    size="small"
                                    color={dueStatusColor(String(row.dueStatus || '')) as any}
                                    label={value(row.dueStatus)}
                                  />
                                </TableCell>
                                <TableCell>
                                  <Chip
                                    size="small"
                                    color={priorityColor(String(row.priority || '')) as any}
                                    label={value(row.priority)}
                                  />
                                </TableCell>
                                <TableCell>{value(row.status)}</TableCell>
                                <TableCell>{value(row.nextCheckDate)}</TableCell>
                                <TableCell>{value(row.alertType)}</TableCell>
                                <TableCell>{value(row.actionType)}</TableCell>
                                <TableCell>
                                  {row.id ? (
                                    <Button
                                      component={RouterLink}
                                      to={`/feeding-alert-actions/${row.id}/edit`}
                                      size="small"
                                      variant="outlined"
                                    >
                                      編集
                                    </Button>
                                  ) : (
                                    '-'
                                  )}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}

                      <Typography color="text.secondary">
                        表示は注意度の高い順に最大8件です。全件は対応記録一覧で確認できます。
                      </Typography>
                    </Stack>
                  </CardContent>
                </Card>
              </Stack>
            </CardContent>
          </Card>
        </>
      )}
    </Stack>
  );
}

export default ReportPage;




