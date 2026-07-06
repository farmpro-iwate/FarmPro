import { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Alert,
  Box,
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

type FeedingAlertDetail = {
  calfId?: string;
  calfName?: string;
  birthDate?: string;
  ageDays?: number | null;
  guideAgeDays?: string;
  stageName?: string;
  latestFeedingDate?: string;
  shortageCount?: number;
  overCount?: number;
  okCount?: number;
  memo?: string;
};

type FeedingAlertActionDueDetail = {
  id?: string;
  actionDate?: string;
  calfId?: string;
  calfName?: string;
  ageDays?: string;
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
  salesCount?: number;
  expenseCount?: number;
  feedingCount?: number;
  feedInventoryCount?: number;
  feedingGuideCount?: number;
  feedingAlerts?: {
    totalCalves?: number;
    withGuideCount?: number;
    noBirthDateCount?: number;
    noGuideCount?: number;
    noRecordCount?: number;
    shortageCalfCount?: number;
    overCalfCount?: number;
    okCalfCount?: number;
    details?: FeedingAlertDetail[];
  };
  feedingAlertActionDueAlerts?: {
    overdueCount?: number;
    todayCount?: number;
    soonCount?: number;
    recheckCount?: number;
    notStartedCount?: number;
    totalAttentionCount?: number;
    details?: FeedingAlertActionDueDetail[];
  };
};

function numberText(v: unknown) {
  const n = Number(v || 0);
  return n.toLocaleString('ja-JP');
}

function value(v: unknown) {
  if (v === null || v === undefined || v === '') return '-';
  return String(v);
}

function csvCell(valueText: unknown) {
  const text = String(valueText ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

function todayText() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

function printDateText() {
  return new Date().toLocaleString('ja-JP');
}

function htmlEscape(text: unknown) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
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

function InfoLine({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Stack direction="row" spacing={1} justifyContent="space-between" alignItems="flex-start">
      <Typography color="text.secondary" sx={{ minWidth: 92 }}>
        {label}
      </Typography>
      <Typography fontWeight={700} textAlign="right">
        {children}
      </Typography>
    </Stack>
  );
}

function memoColor(memo: string) {
  if (memo.includes('不足')) return 'warning';
  if (memo.includes('多め')) return 'error';
  if (memo.includes('実績なし')) return 'info';
  if (memo.includes('良好')) return 'success';
  return 'default';
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
  if (priority === '低') return 'default';
  return 'default';
}

function inferAlertType(memo: string) {
  if (memo.includes('不足')) return '不足気味';
  if (memo.includes('多め')) return '多め';
  if (memo.includes('実績なし')) return '実績なし';
  if (memo.includes('生年月日')) return '生年月日なし';
  if (memo.includes('目安')) return '給与目安なし';
  return 'その他';
}

function actionLink(row: FeedingAlertDetail) {
  const params = new URLSearchParams();
  params.set('calfId', String(row.calfId || ''));
  params.set('calfName', String(row.calfName || ''));
  params.set('ageDays', row.ageDays === null || row.ageDays === undefined ? '' : String(row.ageDays));
  params.set('alertType', inferAlertType(String(row.memo || '')));
  params.set('memo', String(row.memo || ''));
  return `/feeding-alert-actions/new?${params.toString()}`;
}

export function Home() {
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function loadSummary() {
    setLoading(true);
    setError('');

    try {
      const res = await fetch('http://localhost:4000/api/reports/summary');
      if (!res.ok) throw new Error('集計情報を取得できませんでした。');
      const data = await res.json();
      setSummary(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '集計情報を取得できませんでした。');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSummary();
  }, []);

  const feedingAlerts = summary?.feedingAlerts;
  const shortageCount = Number(feedingAlerts?.shortageCalfCount || 0);
  const overCount = Number(feedingAlerts?.overCalfCount || 0);
  const noRecordCount = Number(feedingAlerts?.noRecordCount || 0);
  const hasAlert = shortageCount > 0 || overCount > 0 || noRecordCount > 0;

  const dueAlerts = summary?.feedingAlertActionDueAlerts;
  const dueAttentionCount = Number(dueAlerts?.totalAttentionCount || 0);
  const dueDetails = (dueAlerts?.details || []).slice(0, 5);

  const attentionCalves = useMemo(() => {
    const details = feedingAlerts?.details || [];

    return [...details]
      .sort((a, b) => {
        const scoreA =
          Number(a.shortageCount || 0) * 3 +
          Number(a.overCount || 0) * 3 +
          (String(a.memo || '').includes('実績なし') ? 1 : 0);
        const scoreB =
          Number(b.shortageCount || 0) * 3 +
          Number(b.overCount || 0) * 3 +
          (String(b.memo || '').includes('実績なし') ? 1 : 0);

        return scoreB - scoreA;
      })
      .slice(0, 5);
  }, [feedingAlerts]);

  function handleExportAttentionCsv() {
    const header = [
      '子牛',
      '生年月日',
      '日齢',
      '近い目安日齢',
      '近い目安ステージ',
      '直近実績日',
      '不足件数',
      '多め件数',
      '良好件数',
      '注意メモ'
    ];

    const body = attentionCalves.map((row) => [
      String(row.calfName || ''),
      String(row.birthDate || ''),
      row.ageDays === null || row.ageDays === undefined ? '' : String(row.ageDays),
      String(row.guideAgeDays || ''),
      String(row.stageName || ''),
      String(row.latestFeedingDate || ''),
      String(row.shortageCount || 0),
      String(row.overCount || 0),
      String(row.okCount || 0),
      String(row.memo || '')
    ]);

    downloadCsv(`ホーム注意子牛リスト_${todayText()}.csv`, [header, ...body]);
  }

  function handlePrintAttentionList() {
    const tableRows = attentionCalves.map((row) => `
      <tr>
        <td>${htmlEscape(value(row.calfName))}</td>
        <td>${htmlEscape(value(row.birthDate))}</td>
        <td>${htmlEscape(row.ageDays === null || row.ageDays === undefined ? '-' : `${row.ageDays}日`)}</td>
        <td>${htmlEscape(row.guideAgeDays ? `${row.guideAgeDays}日 ${row.stageName || ''}` : '-')}</td>
        <td>${htmlEscape(value(row.latestFeedingDate))}</td>
        <td>${htmlEscape(`${numberText(row.shortageCount)}件`)}</td>
        <td>${htmlEscape(`${numberText(row.overCount)}件`)}</td>
        <td>${htmlEscape(`${numberText(row.okCount)}件`)}</td>
        <td>${htmlEscape(value(row.memo))}</td>
      </tr>
    `).join('');

    const html = `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>ホーム注意子牛リスト</title>
          <style>
            body {
              font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
              padding: 24px;
              color: #111;
            }
            h1 {
              font-size: 22px;
              margin: 0 0 8px;
            }
            .meta {
              font-size: 12px;
              margin-bottom: 16px;
              color: #555;
            }
            .summary {
              display: grid;
              grid-template-columns: repeat(4, 1fr);
              gap: 8px;
              margin: 16px 0;
            }
            .summary div {
              border: 1px solid #999;
              padding: 8px;
              font-weight: 700;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              font-size: 12px;
            }
            th, td {
              border: 1px solid #777;
              padding: 6px;
              text-align: left;
              vertical-align: top;
            }
            th {
              background: #eee;
            }
            @media print {
              button {
                display: none;
              }
              body {
                padding: 12px;
              }
            }
          </style>
        </head>
        <body>
          <button onclick="window.print()">印刷する</button>
          <h1>ホーム注意子牛リスト</h1>
          <div class="meta">印刷日時：${htmlEscape(printDateText())}</div>

          <div class="summary">
            <div>全子牛：${htmlEscape(numberText(feedingAlerts?.totalCalves))}頭</div>
            <div>不足気味：${htmlEscape(numberText(shortageCount))}頭</div>
            <div>多め：${htmlEscape(numberText(overCount))}頭</div>
            <div>実績なし：${htmlEscape(numberText(noRecordCount))}頭</div>
          </div>

          <table>
            <thead>
              <tr>
                <th>子牛</th>
                <th>生年月日</th>
                <th>日齢</th>
                <th>近い目安</th>
                <th>直近実績日</th>
                <th>不足</th>
                <th>多め</th>
                <th>良好</th>
                <th>注意メモ</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows || '<tr><td colspan="9">注意表示する子牛はありません。</td></tr>'}
            </tbody>
          </table>
        </body>
      </html>
    `;

    const win = window.open('', '_blank');
    if (!win) {
      alert('印刷画面を開けませんでした。ポップアップがブロックされている可能性があります。');
      return;
    }

    win.document.open();
    win.document.write(html);
    win.document.close();
  }

  return (
    <Stack spacing={2}>
      <Typography variant="h5" fontWeight={800}>
        ホーム
      </Typography>

      <Alert severity="info">
        繁殖Farm Proのホームです。主要な管理画面と給与アラートをここから確認できます。
      </Alert>

      {loading && <Typography>集計情報を読み込み中...</Typography>}
      {error && <Alert severity="warning">{error}</Alert>}

      {!loading && !error && (
        <>
          <Grid container spacing={2}>
            <Grid item xs={6} md={3}>
              <StatCard title="成牛" value={`${numberText(summary?.cattleCount)}頭`} />
            </Grid>
            <Grid item xs={6} md={3}>
              <StatCard title="子牛" value={`${numberText(summary?.calfCount)}頭`} />
            </Grid>
            <Grid item xs={6} md={3}>
              <StatCard title="給与実績" value={`${numberText(summary?.feedingCount)}件`} />
            </Grid>
            <Grid item xs={6} md={3}>
              <StatCard title="給与目安" value={`${numberText(summary?.feedingGuideCount)}件`} />
            </Grid>
          </Grid>

          <Card>
            <CardContent>
              <Stack spacing={2}>
                <Typography variant="h6" fontWeight={800}>
                  対応記録 期限アラート
                </Typography>

                {dueAttentionCount > 0 ? (
                  <Alert severity="warning">
                    確認が必要な対応記録があります。期限切れ・今日確認・再確認必要を優先して確認してください。
                  </Alert>
                ) : (
                  <Alert severity="success">
                    現在、確認が必要な対応記録期限アラートはありません。
                  </Alert>
                )}

                <Grid container spacing={2}>
                  <Grid item xs={6} md={2.4}>
                    <StatCard title="期限切れ" value={`${numberText(dueAlerts?.overdueCount)}件`} />
                  </Grid>
                  <Grid item xs={6} md={2.4}>
                    <StatCard title="今日確認" value={`${numberText(dueAlerts?.todayCount)}件`} />
                  </Grid>
                  <Grid item xs={6} md={2.4}>
                    <StatCard title="まもなく" value={`${numberText(dueAlerts?.soonCount)}件`} />
                  </Grid>
                  <Grid item xs={6} md={2.4}>
                    <StatCard title="再確認" value={`${numberText(dueAlerts?.recheckCount)}件`} />
                  </Grid>
                  <Grid item xs={6} md={2.4}>
                    <StatCard title="未対応" value={`${numberText(dueAlerts?.notStartedCount)}件`} />
                  </Grid>
                </Grid>

                <Card variant="outlined">
                  <CardContent>
                    <Stack spacing={1.5}>
                      <Stack
                        direction={{ xs: 'column', sm: 'row' }}
                        spacing={1}
                        alignItems={{ xs: 'stretch', sm: 'center' }}
                      >
                        <Typography variant="h6" fontWeight={800} sx={{ flexGrow: 1 }}>
                          注意が必要な対応記録
                        </Typography>
                        <Button component={RouterLink} to="/feeding-alert-actions" variant="outlined" fullWidth={false}>
                          対応記録一覧
                        </Button>
                      </Stack>

                      {dueDetails.length === 0 ? (
                        <Alert severity="success">
                          注意表示する対応記録はありません。
                        </Alert>
                      ) : (
                        <>
                          <Box sx={{ display: { xs: 'block', md: 'none' } }}>
                            <Stack spacing={1.5}>
                              {dueDetails.map((row, index) => (
                                <Card variant="outlined" key={`${row.id || index}`}>
                                  <CardContent>
                                    <Stack spacing={1}>
                                      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                                        <Typography fontWeight={900} sx={{ flexGrow: 1 }}>
                                          {value(row.calfName)}
                                        </Typography>
                                        <Chip
                                          size="small"
                                          color={dueStatusColor(String(row.dueStatus || '')) as any}
                                          label={value(row.dueStatus)}
                                        />
                                        <Chip
                                          size="small"
                                          color={priorityColor(String(row.priority || '')) as any}
                                          label={`優先度 ${value(row.priority)}`}
                                        />
                                      </Stack>

                                      <InfoLine label="状態">{value(row.status)}</InfoLine>
                                      <InfoLine label="次回確認日">{value(row.nextCheckDate)}</InfoLine>
                                      <InfoLine label="対応内容">{value(row.actionType)}</InfoLine>

                                      {row.id && (
                                        <Button
                                          component={RouterLink}
                                          to={`/feeding-alert-actions/${row.id}/edit`}
                                          size="small"
                                          variant="contained"
                                          fullWidth
                                        >
                                          編集する
                                        </Button>
                                      )}
                                    </Stack>
                                  </CardContent>
                                </Card>
                              ))}
                            </Stack>
                          </Box>

                          <Box sx={{ display: { xs: 'none', md: 'block' } }}>
                            <Table size="small">
                              <TableHead>
                                <TableRow>
                                  <TableCell>子牛</TableCell>
                                  <TableCell>期限状態</TableCell>
                                  <TableCell>優先度</TableCell>
                                  <TableCell>状態</TableCell>
                                  <TableCell>次回確認日</TableCell>
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
                                    <TableCell>{value(row.actionType)}</TableCell>
                                    <TableCell>
                                      {row.id ? (
                                        <Button
                                          component={RouterLink}
                                          to={`/feeding-alert-actions/${row.id}/edit`}
                                          size="small"
                                          variant="contained"
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
                          </Box>
                        </>
                      )}

                      <Typography color="text.secondary">
                        表示は注意度の高い順に最大5件です。全件は対応記録一覧で確認できます。
                      </Typography>
                    </Stack>
                  </CardContent>
                </Card>
              </Stack>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Stack spacing={2}>
                <Typography variant="h6" fontWeight={800}>
                  給与アラート
                </Typography>

                {hasAlert ? (
                  <Alert severity={shortageCount > 0 || overCount > 0 ? 'warning' : 'info'}>
                    給与確認が必要な子牛があります。下の注意子牛リストから対応記録を残せます。
                  </Alert>
                ) : (
                  <Alert severity="success">
                    現在、大きな給与アラートはありません。
                  </Alert>
                )}

                <Grid container spacing={2}>
                  <Grid item xs={6} md={3}>
                    <StatCard
                      title="全子牛"
                      value={`${numberText(feedingAlerts?.totalCalves)}頭`}
                      note="給与アラート集計対象"
                    />
                  </Grid>
                  <Grid item xs={6} md={3}>
                    <StatCard
                      title="不足気味"
                      value={`${numberText(shortageCount)}頭`}
                      note="目安より少なめ"
                    />
                  </Grid>
                  <Grid item xs={6} md={3}>
                    <StatCard
                      title="多め"
                      value={`${numberText(overCount)}頭`}
                      note="目安より多め"
                    />
                  </Grid>
                  <Grid item xs={6} md={3}>
                    <StatCard
                      title="実績なし"
                      value={`${numberText(noRecordCount)}頭`}
                      note="給与実績が未登録"
                    />
                  </Grid>
                </Grid>

                <Card variant="outlined">
                  <CardContent>
                    <Stack spacing={1.5}>
                      <Stack
                        direction={{ xs: 'column', sm: 'row' }}
                        spacing={1}
                        alignItems={{ xs: 'stretch', sm: 'center' }}
                      >
                        <Typography variant="h6" fontWeight={800} sx={{ flexGrow: 1 }}>
                          注意子牛リスト
                        </Typography>
                        <Button
                          variant="outlined"
                          onClick={handleExportAttentionCsv}
                          disabled={attentionCalves.length === 0}
                        >
                          CSV出力
                        </Button>
                        <Button
                          variant="outlined"
                          onClick={handlePrintAttentionList}
                        >
                          印刷
                        </Button>
                      </Stack>

                      {attentionCalves.length === 0 ? (
                        <Alert severity="success">
                          注意表示する子牛はありません。
                        </Alert>
                      ) : (
                        <>
                          <Box sx={{ display: { xs: 'block', md: 'none' } }}>
                            <Stack spacing={1.5}>
                              {attentionCalves.map((row, index) => (
                                <Card variant="outlined" key={`${row.calfId || row.calfName || index}`}>
                                  <CardContent>
                                    <Stack spacing={1}>
                                      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                                        <Typography fontWeight={900} sx={{ flexGrow: 1 }}>
                                          {value(row.calfName)}
                                        </Typography>
                                        <Chip
                                          size="small"
                                          color={memoColor(String(row.memo || '')) as any}
                                          label={value(row.memo)}
                                        />
                                      </Stack>

                                      <InfoLine label="日齢">
                                        {row.ageDays === null || row.ageDays === undefined ? '-' : `${row.ageDays}日`}
                                      </InfoLine>
                                      <InfoLine label="近い目安">
                                        {row.guideAgeDays ? `${row.guideAgeDays}日 ${row.stageName || ''}` : '-'}
                                      </InfoLine>
                                      <InfoLine label="直近実績日">{value(row.latestFeedingDate)}</InfoLine>
                                      <InfoLine label="不足">{numberText(row.shortageCount)}件</InfoLine>
                                      <InfoLine label="多め">{numberText(row.overCount)}件</InfoLine>

                                      <Button
                                        component={RouterLink}
                                        to={actionLink(row)}
                                        size="small"
                                        variant="contained"
                                        fullWidth
                                      >
                                        対応記録を追加
                                      </Button>
                                    </Stack>
                                  </CardContent>
                                </Card>
                              ))}
                            </Stack>
                          </Box>

                          <Box sx={{ display: { xs: 'none', md: 'block' } }}>
                            <Table size="small">
                              <TableHead>
                                <TableRow>
                                  <TableCell>子牛</TableCell>
                                  <TableCell>日齢</TableCell>
                                  <TableCell>近い目安</TableCell>
                                  <TableCell>直近実績日</TableCell>
                                  <TableCell>不足</TableCell>
                                  <TableCell>多め</TableCell>
                                  <TableCell>メモ</TableCell>
                                  <TableCell>対応</TableCell>
                                </TableRow>
                              </TableHead>
                              <TableBody>
                                {attentionCalves.map((row, index) => (
                                  <TableRow key={`${row.calfId || row.calfName || index}`}>
                                    <TableCell>{value(row.calfName)}</TableCell>
                                    <TableCell>{row.ageDays === null || row.ageDays === undefined ? '-' : `${row.ageDays}日`}</TableCell>
                                    <TableCell>{row.guideAgeDays ? `${row.guideAgeDays}日 ${row.stageName || ''}` : '-'}</TableCell>
                                    <TableCell>{value(row.latestFeedingDate)}</TableCell>
                                    <TableCell>{numberText(row.shortageCount)}件</TableCell>
                                    <TableCell>{numberText(row.overCount)}件</TableCell>
                                    <TableCell>
                                      <Chip
                                        size="small"
                                        color={memoColor(String(row.memo || '')) as any}
                                        label={value(row.memo)}
                                      />
                                    </TableCell>
                                    <TableCell>
                                      <Button
                                        component={RouterLink}
                                        to={actionLink(row)}
                                        size="small"
                                        variant="contained"
                                      >
                                        対応記録
                                      </Button>
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </Box>
                        </>
                      )}

                      <Typography color="text.secondary">
                        「対応記録」を押すと、子牛名・日齢・アラート種別を引き継いで新規登録画面へ移動します。
                      </Typography>
                    </Stack>
                  </CardContent>
                </Card>

                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                  <Button component={RouterLink} to="/feeding-guide" variant="contained">
                    給与目安で確認
                  </Button>
                  <Button component={RouterLink} to="/feeding-alert-actions" variant="outlined">
                    対応記録を見る
                  </Button>
                  <Button component={RouterLink} to="/reports" variant="outlined">
                    レポートで確認
                  </Button>
                </Stack>
              </Stack>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Stack spacing={2}>
                <Typography variant="h6" fontWeight={800}>
                  よく使う画面
                </Typography>

                <Grid container spacing={1}>
                  <Grid item xs={6} md={3}>
                    <Button component={RouterLink} to="/cattle" variant="outlined" fullWidth>
                      牛台帳
                    </Button>
                  </Grid>
                  <Grid item xs={6} md={3}>
                    <Button component={RouterLink} to="/calves" variant="outlined" fullWidth>
                      子牛管理
                    </Button>
                  </Grid>
                  <Grid item xs={6} md={3}>
                    <Button component={RouterLink} to="/feedings" variant="outlined" fullWidth>
                      飼養管理
                    </Button>
                  </Grid>
                  <Grid item xs={6} md={3}>
                    <Button component={RouterLink} to="/feed-inventory" variant="outlined" fullWidth>
                      飼料在庫
                    </Button>
                  </Grid>
                  <Grid item xs={6} md={3}>
                    <Button component={RouterLink} to="/sales" variant="outlined" fullWidth>
                      出荷・販売
                    </Button>
                  </Grid>
                  <Grid item xs={6} md={3}>
                    <Button component={RouterLink} to="/expenses" variant="outlined" fullWidth>
                      経費管理
                    </Button>
                  </Grid>
                  <Grid item xs={6} md={3}>
                    <Button component={RouterLink} to="/monthly-balance" variant="outlined" fullWidth>
                      月別収支
                    </Button>
                  </Grid>
                  <Grid item xs={6} md={3}>
                    <Button component={RouterLink} to="/feeding-alert-actions" variant="outlined" fullWidth>
                      対応記録
                    </Button>
                  </Grid>
                </Grid>
              </Stack>
            </CardContent>
          </Card>
        </>
      )}
    </Stack>
  );
}

export default Home;
