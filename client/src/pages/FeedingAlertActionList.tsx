import { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Alert,
  Button,
  Card,
  CardContent,
  Chip,
  Grid,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography
} from '@mui/material';
import {
  FeedingAlertAction,
  deleteFeedingAlertAction,
  fetchFeedingAlertActions
} from '../services/feedingAlertActionsApi';

const alertTypes = [
  '',
  '不足気味',
  '多め',
  '実績なし',
  '生年月日なし',
  '給与目安なし',
  'その他'
];

const statuses = [
  '',
  '未対応',
  '対応中',
  '対応済み',
  '様子見',
  '再確認必要'
];

function value(v: unknown) {
  if (v === null || v === undefined || v === '') return '-';
  return String(v);
}

function statusColor(status: string) {
  if (status.includes('済み')) return 'success';
  if (status.includes('対応中')) return 'warning';
  if (status.includes('様子見')) return 'info';
  if (status.includes('再確認')) return 'error';
  return 'default';
}

function alertColor(alertType: string) {
  if (alertType.includes('不足')) return 'warning';
  if (alertType.includes('多め')) return 'error';
  if (alertType.includes('実績なし')) return 'info';
  return 'default';
}

function inDateRange(valueText: string, from: string, to: string) {
  if (!valueText) return !from && !to;
  if (from && valueText < from) return false;
  if (to && valueText > to) return false;
  return true;
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

export function FeedingAlertActionList() {
  const [items, setItems] = useState<FeedingAlertAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState('');
  const [error, setError] = useState('');

  const [keyword, setKeyword] = useState('');
  const [alertType, setAlertType] = useState('');
  const [status, setStatus] = useState('');
  const [actionDateFrom, setActionDateFrom] = useState('');
  const [actionDateTo, setActionDateTo] = useState('');
  const [nextCheckDateFrom, setNextCheckDateFrom] = useState('');
  const [nextCheckDateTo, setNextCheckDateTo] = useState('');

  async function loadItems() {
    setLoading(true);
    setError('');

    try {
      const data = await fetchFeedingAlertActions();
      setItems(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '給与アラート対応記録を取得できませんでした。');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(item: FeedingAlertAction) {
    const ok = window.confirm(`${item.calfName || 'この記録'}を削除しますか？`);
    if (!ok) return;

    setDeletingId(item.id);
    setError('');

    try {
      await deleteFeedingAlertAction(item.id);
      await loadItems();
    } catch (err) {
      setError(err instanceof Error ? err.message : '削除に失敗しました。');
    } finally {
      setDeletingId('');
    }
  }

  function clearFilters() {
    setKeyword('');
    setAlertType('');
    setStatus('');
    setActionDateFrom('');
    setActionDateTo('');
    setNextCheckDateFrom('');
    setNextCheckDateTo('');
  }

  useEffect(() => {
    loadItems();
  }, []);

  const filteredItems = useMemo(() => {
    const q = keyword.trim().toLowerCase();

    return items.filter((item) => {
      if (q) {
        const text = [
          item.actionDate,
          item.calfName,
          item.ageDays,
          item.alertType,
          item.actionType,
          item.memo,
          item.nextCheckDate,
          item.status
        ].join(' ').toLowerCase();

        if (!text.includes(q)) return false;
      }

      if (alertType && item.alertType !== alertType) return false;
      if (status && item.status !== status) return false;

      if (!inDateRange(item.actionDate || '', actionDateFrom, actionDateTo)) return false;
      if (!inDateRange(item.nextCheckDate || '', nextCheckDateFrom, nextCheckDateTo)) return false;

      return true;
    });
  }, [
    items,
    keyword,
    alertType,
    status,
    actionDateFrom,
    actionDateTo,
    nextCheckDateFrom,
    nextCheckDateTo
  ]);

  const activeFilterCount = [
    keyword,
    alertType,
    status,
    actionDateFrom,
    actionDateTo,
    nextCheckDateFrom,
    nextCheckDateTo
  ].filter(Boolean).length;

  function handleExportCsv() {
    const header = [
      '対応日',
      '子牛ID',
      '子牛名',
      '日齢',
      'アラート種別',
      '対応内容',
      '状態',
      '次回確認日',
      'メモ',
      '作成日時',
      '更新日時'
    ];

    const body = filteredItems.map((item) => [
      item.actionDate || '',
      item.calfId || '',
      item.calfName || '',
      item.ageDays || '',
      item.alertType || '',
      item.actionType || '',
      item.status || '',
      item.nextCheckDate || '',
      item.memo || '',
      item.createdAt || '',
      item.updatedAt || ''
    ]);

    downloadCsv(`給与アラート対応記録_${todayText()}.csv`, [header, ...body]);
  }

  function handlePrint() {
    const tableRows = filteredItems.map((item) => `
      <tr>
        <td>${htmlEscape(value(item.actionDate))}</td>
        <td>${htmlEscape(value(item.calfName))}</td>
        <td>${htmlEscape(item.ageDays ? `${item.ageDays}日` : '-')}</td>
        <td>${htmlEscape(value(item.alertType))}</td>
        <td>${htmlEscape(value(item.actionType))}</td>
        <td>${htmlEscape(value(item.status))}</td>
        <td>${htmlEscape(value(item.nextCheckDate))}</td>
        <td>${htmlEscape(value(item.memo))}</td>
      </tr>
    `).join('');

    const filterText = [
      keyword ? `キーワード：${keyword}` : '',
      alertType ? `アラート種別：${alertType}` : '',
      status ? `状態：${status}` : '',
      actionDateFrom || actionDateTo ? `対応日：${actionDateFrom || '指定なし'} ～ ${actionDateTo || '指定なし'}` : '',
      nextCheckDateFrom || nextCheckDateTo ? `次回確認日：${nextCheckDateFrom || '指定なし'} ～ ${nextCheckDateTo || '指定なし'}` : ''
    ].filter(Boolean).join(' / ') || '絞り込みなし';

    const html = `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>給与アラート対応記録</title>
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
              margin-bottom: 8px;
              color: #555;
            }
            .filter {
              border: 1px solid #999;
              padding: 8px;
              margin: 12px 0 16px;
              font-size: 12px;
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
          <h1>給与アラート対応記録</h1>
          <div class="meta">印刷日時：${htmlEscape(printDateText())}</div>
          <div class="meta">表示件数：${htmlEscape(filteredItems.length)}件 / 全${htmlEscape(items.length)}件</div>
          <div class="filter">絞り込み条件：${htmlEscape(filterText)}</div>

          <table>
            <thead>
              <tr>
                <th>対応日</th>
                <th>子牛</th>
                <th>日齢</th>
                <th>アラート</th>
                <th>対応内容</th>
                <th>状態</th>
                <th>次回確認日</th>
                <th>メモ</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows || '<tr><td colspan="8">条件に合う給与アラート対応記録はありません。</td></tr>'}
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
      <Stack direction="row" spacing={1} alignItems="center">
        <Typography variant="h5" fontWeight={800} sx={{ flexGrow: 1 }}>
          給与アラート対応記録
        </Typography>

        <Button component={RouterLink} to="/feeding-alert-actions/new" variant="contained">
          新規登録
        </Button>

        <Button variant="outlined" onClick={handleExportCsv} disabled={filteredItems.length === 0}>
          CSV出力
        </Button>

        <Button variant="outlined" onClick={handlePrint}>
          印刷
        </Button>

        <Button variant="outlined" onClick={loadItems}>
          再読み込み
        </Button>

        <Button component={RouterLink} to="/feeding-guide" variant="outlined">
          給与目安へ
        </Button>
      </Stack>

      <Alert severity="info">
        給与アラートに対して、確認・調整・様子見などの対応履歴を確認する画面です。
      </Alert>

      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="h6" fontWeight={800} sx={{ flexGrow: 1 }}>
                検索・絞り込み
              </Typography>

              <Chip label={`絞り込み ${activeFilterCount}件`} size="small" />
              <Button variant="outlined" onClick={clearFilters}>
                絞り込み解除
              </Button>
            </Stack>

            <Grid container spacing={2}>
              <Grid item xs={12} md={4}>
                <TextField
                  label="キーワード検索"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  placeholder="子牛名、対応内容、メモなど"
                  fullWidth
                />
              </Grid>

              <Grid item xs={12} md={4}>
                <TextField
                  label="アラート種別"
                  value={alertType}
                  onChange={(e) => setAlertType(e.target.value)}
                  select
                  fullWidth
                >
                  {alertTypes.map((item) => (
                    <MenuItem key={item || 'all-alert'} value={item}>
                      {item || 'すべて'}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>

              <Grid item xs={12} md={4}>
                <TextField
                  label="状態"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  select
                  fullWidth
                >
                  {statuses.map((item) => (
                    <MenuItem key={item || 'all-status'} value={item}>
                      {item || 'すべて'}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>

              <Grid item xs={12} md={3}>
                <TextField
                  label="対応日 From"
                  type="date"
                  value={actionDateFrom}
                  onChange={(e) => setActionDateFrom(e.target.value)}
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>

              <Grid item xs={12} md={3}>
                <TextField
                  label="対応日 To"
                  type="date"
                  value={actionDateTo}
                  onChange={(e) => setActionDateTo(e.target.value)}
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>

              <Grid item xs={12} md={3}>
                <TextField
                  label="次回確認日 From"
                  type="date"
                  value={nextCheckDateFrom}
                  onChange={(e) => setNextCheckDateFrom(e.target.value)}
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>

              <Grid item xs={12} md={3}>
                <TextField
                  label="次回確認日 To"
                  type="date"
                  value={nextCheckDateTo}
                  onChange={(e) => setNextCheckDateTo(e.target.value)}
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
            </Grid>

            {loading && <Typography>読み込み中...</Typography>}
            {error && <Alert severity="warning">{error}</Alert>}

            {!loading && !error && (
              <>
                <Typography color="text.secondary">
                  表示件数：{filteredItems.length}件 / 全{items.length}件
                </Typography>

                {filteredItems.length === 0 ? (
                  <Alert severity="info">
                    条件に合う給与アラート対応記録はありません。
                  </Alert>
                ) : (
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>対応日</TableCell>
                        <TableCell>子牛</TableCell>
                        <TableCell>日齢</TableCell>
                        <TableCell>アラート</TableCell>
                        <TableCell>対応内容</TableCell>
                        <TableCell>状態</TableCell>
                        <TableCell>次回確認日</TableCell>
                        <TableCell>メモ</TableCell>
                        <TableCell>操作</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {filteredItems.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>{value(item.actionDate)}</TableCell>
                          <TableCell>{value(item.calfName)}</TableCell>
                          <TableCell>{item.ageDays ? `${item.ageDays}日` : '-'}</TableCell>
                          <TableCell>
                            <Chip
                              size="small"
                              color={alertColor(item.alertType) as any}
                              label={value(item.alertType)}
                            />
                          </TableCell>
                          <TableCell>{value(item.actionType)}</TableCell>
                          <TableCell>
                            <Chip
                              size="small"
                              color={statusColor(item.status) as any}
                              label={value(item.status)}
                            />
                          </TableCell>
                          <TableCell>{value(item.nextCheckDate)}</TableCell>
                          <TableCell>{value(item.memo)}</TableCell>
                          <TableCell>
                            <Stack direction="row" spacing={1}>
                              <Button
                                component={RouterLink}
                                to={`/feeding-alert-actions/${item.id}/edit`}
                                size="small"
                                variant="outlined"
                              >
                                編集
                              </Button>
                              <Button
                                size="small"
                                color="error"
                                variant="outlined"
                                onClick={() => handleDelete(item)}
                                disabled={deletingId === item.id}
                              >
                                削除
                              </Button>
                            </Stack>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </>
            )}
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}

export default FeedingAlertActionList;
