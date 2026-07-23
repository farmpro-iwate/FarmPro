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
import { getAllRecords } from '../storage/repository';
import {
  deleteFeedingGuide,
  FeedingGuideRecord,
  getFeedingGuideList,
  getNearestFeedingGuide
} from '../services/feedingGuideApi';

type CalfRecord = {
  id: string;
  name?: string;
  calfName?: string;
  earTag?: string;
  managementId?: string;
  birthDate?: string;
  birthday?: string;
  dateOfBirth?: string;
};

type FeedingRecord = {
  id: string;
  calfId?: string;
  calfName?: string;
  cattleId?: string;
  cattleName?: string;
  targetId?: string;
  targetName?: string;
  animalId?: string;
  animalName?: string;
  earTag?: string;
  managementId?: string;
  date?: string;
  feedingDate?: string;
  recordDate?: string;
  feedName?: string;
  feedType?: string;
  category?: string;
  amount?: string;
  feedAmount?: string;
  quantity?: string;
  starterAmount?: string;
  growingFeedAmount?: string;
  roughageAmount?: string;
};

type CompareKind = 'none' | 'ok' | 'short' | 'over';

type CompareRow = {
  label: string;
  guide: number;
  actual: number;
  status: {
    label: string;
    color: 'default' | 'info' | 'success' | 'warning' | 'error';
    type: CompareKind;
    message: string;
  };
};

type AllCalfAlertRow = {
  calf: CalfRecord;
  ageDays: number | null;
  guide: FeedingGuideRecord | null;
  records: FeedingRecord[];
  compareRows: CompareRow[];
  shortageCount: number;
  overCount: number;
  okCount: number;
  latestDate: string;
  memo: string;
};

function value(v: unknown) {
  if (v === null || v === undefined || v === '') return '-';
  return String(v);
}

function toNumber(valueText: unknown) {
  if (valueText === null || valueText === undefined || valueText === '') return 0;
  const n = Number(String(valueText).replace(/,/g, ''));
  return Number.isNaN(n) ? 0 : n;
}

function amountText(valueText: string) {
  if (!valueText) return '-';
  const n = Number(valueText);
  if (Number.isNaN(n)) return valueText;
  return `${n.toLocaleString('ja-JP')}kg`;
}

function amountNumber(n: number) {
  if (!n) return '0kg';
  return `${n.toLocaleString('ja-JP', { maximumFractionDigits: 2 })}kg`;
}

function signedAmountNumber(n: number) {
  if (n > 0) return `+${amountNumber(n)}`;
  if (n < 0) return `-${amountNumber(Math.abs(n))}`;
  return '±0kg';
}

function cm(valueText: string) {
  if (!valueText) return '-';
  const n = Number(valueText);
  if (Number.isNaN(n)) return valueText;
  return `${n.toLocaleString('ja-JP')}cm`;
}

function kg(valueText: string) {
  if (!valueText) return '-';
  const n = Number(valueText);
  if (Number.isNaN(n)) return valueText;
  return `${n.toLocaleString('ja-JP')}kg`;
}

function stageColor(stageName: string) {
  if (stageName.includes('生時')) return 'default';
  if (stageName.includes('哺乳')) return 'info';
  if (stageName.includes('離乳')) return 'warning';
  if (stageName.includes('育成')) return 'success';
  return 'default';
}

function calfLabel(calf: CalfRecord) {
  return calf.name || calf.calfName || calf.earTag || calf.managementId || calf.id;
}

function calfBirthDate(calf: CalfRecord) {
  return calf.birthDate || calf.birthday || calf.dateOfBirth || '';
}

function calculateAgeDays(birthDate: string) {
  if (!birthDate) return null;
  const birth = new Date(`${birthDate}T00:00:00`);
  if (Number.isNaN(birth.getTime())) return null;
  const today = new Date();
  const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const birthOnly = new Date(birth.getFullYear(), birth.getMonth(), birth.getDate());
  return Math.floor((todayDate.getTime() - birthOnly.getTime()) / (1000 * 60 * 60 * 24));
}

function feedingDate(record: FeedingRecord) {
  return record.date || record.feedingDate || record.recordDate || '';
}

function sameCalf(record: FeedingRecord, calf: CalfRecord) {
  const calfNames = [calf.id, calf.name, calf.calfName, calf.earTag, calf.managementId]
    .filter(Boolean)
    .map((v) => String(v));
  const recordNames = [
    record.calfId,
    record.calfName,
    record.cattleId,
    record.cattleName,
    record.targetId,
    record.targetName,
    record.animalId,
    record.animalName,
    record.earTag,
    record.managementId
  ].filter(Boolean).map((v) => String(v));
  return recordNames.some((v) => calfNames.includes(v));
}

function latestRecordsForCalf(records: FeedingRecord[], calf: CalfRecord) {
  const matched = records.filter((record) => sameCalf(record, calf));
  if (matched.length === 0) return [];
  const sorted = [...matched].sort((a, b) => feedingDate(b).localeCompare(feedingDate(a)));
  const latestDate = feedingDate(sorted[0]);
  if (!latestDate) return sorted.slice(0, 5);
  return sorted.filter((record) => feedingDate(record) === latestDate);
}

function sumActual(records: FeedingRecord[]) {
  let starter = 0;
  let growing = 0;
  let roughage = 0;

  for (const record of records) {
    starter += toNumber(record.starterAmount);
    growing += toNumber(record.growingFeedAmount);
    roughage += toNumber(record.roughageAmount);

    const genericAmount = toNumber(record.amount || record.feedAmount || record.quantity);
    const feedText = `${record.feedName || ''} ${record.feedType || ''} ${record.category || ''}`;

    if (genericAmount > 0) {
      if (feedText.includes('スターター')) starter += genericAmount;
      else if (feedText.includes('育成') || feedText.includes('配合')) growing += genericAmount;
      else if (feedText.includes('粗飼') || feedText.includes('牧草') || feedText.includes('乾草')) roughage += genericAmount;
    }
  }

  return { starter, growing, roughage };
}

function compareStatus(actual: number, guide: number) {
  if (guide <= 0 && actual <= 0) {
    return { label: '判定なし', color: 'default' as const, type: 'none' as const, message: '目安量が未設定です。' };
  }
  if (guide <= 0 && actual > 0) {
    return { label: '実績あり', color: 'info' as const, type: 'none' as const, message: '目安量は未設定ですが実績があります。' };
  }

  const diff = actual - guide;
  const rate = guide === 0 ? 0 : diff / guide;

  if (Math.abs(rate) <= 0.15) {
    return { label: 'ちょうどよい', color: 'success' as const, type: 'ok' as const, message: `差：${signedAmountNumber(diff)}` };
  }

  if (diff < 0) {
    return { label: '不足気味', color: 'warning' as const, type: 'short' as const, message: `不足：${amountNumber(Math.abs(diff))}` };
  }

  return { label: '多め', color: 'error' as const, type: 'over' as const, message: `超過：${amountNumber(diff)}` };
}

function buildCompareRows(guide: FeedingGuideRecord, records: FeedingRecord[]): CompareRow[] {
  const actual = sumActual(records);
  return [
    { label: 'スターター', guide: toNumber(guide.starterAmount), actual: actual.starter },
    { label: '育成配合', guide: toNumber(guide.growingFeedAmount), actual: actual.growing },
    { label: '粗飼料', guide: toNumber(guide.roughageAmount), actual: actual.roughage }
  ].map((row) => ({
    ...row,
    status: compareStatus(row.actual, row.guide)
  }));
}

function nearestGuideFromRows(ageDays: number, rows: FeedingGuideRecord[]) {
  if (rows.length === 0) return null;
  const numericRows = rows
    .map((row) => ({ row, age: toNumber(row.ageDays) }))
    .filter((item) => item.age >= 0);

  if (numericRows.length === 0) return null;

  numericRows.sort((a, b) => {
    const diffA = Math.abs(a.age - ageDays);
    const diffB = Math.abs(b.age - ageDays);
    if (diffA !== diffB) return diffA - diffB;
    return a.age - b.age;
  });

  return numericRows[0].row;
}

function allCalfMemo(row: AllCalfAlertRow) {
  if (row.ageDays === null) return '生年月日なし';
  if (!row.guide) return '給与目安なし';
  if (row.records.length === 0) return '実績なし';
  if (row.shortageCount > 0 && row.overCount > 0) return '不足と多めあり';
  if (row.shortageCount > 0) return '不足気味あり';
  if (row.overCount > 0) return '多めあり';
  if (row.okCount > 0) return '概ね良好';
  return '判定なし';
}

function csvCell(valueText: unknown) {
  const text = String(valueText ?? '');
  return `"${text.replace(/"/g, '""')}"`;
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

function todayText() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

function htmlEscape(text: unknown) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function printDateText() {
  const d = new Date();
  return d.toLocaleString('ja-JP');
}

function GuideCard({ title, inputAgeDays, guide }: { title: string; inputAgeDays: string; guide: FeedingGuideRecord }) {
  return (
    <Card variant="outlined">
      <CardContent>
        <Stack spacing={1}>
          <Typography variant="h6" fontWeight={800}>{title}</Typography>
          <Typography>日齢：{inputAgeDays}日 / 近い目安：{guide.ageDays}日・{guide.ageMonth}か月</Typography>
          <Typography>
            ステージ：
            <Chip size="small" color={stageColor(guide.stageName) as any} label={value(guide.stageName)} sx={{ ml: 1 }} />
          </Typography>
          <Grid container spacing={1}>
            <Grid item xs={12} md={4}><Typography>体重目安：{kg(guide.targetWeight)}</Typography></Grid>
            <Grid item xs={12} md={4}><Typography>体高目安：{cm(guide.targetHeight)}</Typography></Grid>
            <Grid item xs={12} md={4}><Typography>胸囲目安：{cm(guide.targetChest)}</Typography></Grid>
            <Grid item xs={12} md={4}><Typography>スターター：{amountText(guide.starterAmount)}</Typography></Grid>
            <Grid item xs={12} md={4}><Typography>育成配合：{amountText(guide.growingFeedAmount)}</Typography></Grid>
            <Grid item xs={12} md={4}><Typography>粗飼料：{amountText(guide.roughageAmount)}</Typography></Grid>
            <Grid item xs={12}><Typography>その他：{value(guide.otherAmount)}</Typography></Grid>
            <Grid item xs={12}><Typography>メモ：{value(guide.memo)}</Typography></Grid>
          </Grid>
        </Stack>
      </CardContent>
    </Card>
  );
}

function AlertSummaryCard({ compareRows }: { compareRows: CompareRow[] }) {
  const shorts = compareRows.filter((row) => row.status.type === 'short');
  const overs = compareRows.filter((row) => row.status.type === 'over');
  const oks = compareRows.filter((row) => row.status.type === 'ok');

  if (compareRows.length === 0) return null;

  return (
    <Card variant="outlined">
      <CardContent>
        <Stack spacing={1.5}>
          <Typography variant="h6" fontWeight={800}>注意ポイント</Typography>

          {shorts.length === 0 && overs.length === 0 && oks.length > 0 && (
            <Alert severity="success">今回の実績は、目安に近い範囲です。大きな不足・多めはありません。</Alert>
          )}

          {shorts.length > 0 && (
            <Alert severity="warning">
              不足気味：{shorts.map((row) => `${row.label}（${row.status.message}）`).join('、')}
            </Alert>
          )}

          {overs.length > 0 && (
            <Alert severity="error">
              多め：{overs.map((row) => `${row.label}（${row.status.message}）`).join('、')}
            </Alert>
          )}

          {oks.length > 0 && (
            <Alert severity="success">
              ちょうどよい：{oks.map((row) => row.label).join('、')}
            </Alert>
          )}

          <Typography color="text.secondary">
            判定は目安との差が約15％以内なら「ちょうどよい」としています。
          </Typography>
        </Stack>
      </CardContent>
    </Card>
  );
}

function ComparisonCard({ guide, records }: { guide: FeedingGuideRecord; records: FeedingRecord[] }) {
  const compareRows = buildCompareRows(guide, records);
  const latestDate = records.length > 0 ? feedingDate(records[0]) : '';

  return (
    <Card variant="outlined">
      <CardContent>
        <Stack spacing={2}>
          <Typography variant="h6" fontWeight={800}>給与目安と実績比較</Typography>

          {records.length === 0 ? (
            <Alert severity="info">
              この子牛の飼料給与実績がまだ見つかりません。飼養管理で給与実績を登録すると、ここで比較できます。
            </Alert>
          ) : (
            <>
              <Typography color="text.secondary">
                比較対象の実績日：{value(latestDate)} / 実績件数：{records.length}件
              </Typography>

              <AlertSummaryCard compareRows={compareRows} />

              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>項目</TableCell>
                    <TableCell>目安</TableCell>
                    <TableCell>実績</TableCell>
                    <TableCell>差</TableCell>
                    <TableCell>判定</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {compareRows.map((row) => {
                    const diff = row.actual - row.guide;
                    return (
                      <TableRow key={row.label}>
                        <TableCell>{row.label}</TableCell>
                        <TableCell>{amountNumber(row.guide)}</TableCell>
                        <TableCell>{amountNumber(row.actual)}</TableCell>
                        <TableCell>{signedAmountNumber(diff)}</TableCell>
                        <TableCell>
                          <Stack direction="row" spacing={1} alignItems="center">
                            <Chip size="small" color={row.status.color} label={row.status.label} />
                            <Typography variant="body2">{row.status.message}</Typography>
                          </Stack>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}

export function FeedingGuideList() {
  const [rows, setRows] = useState<FeedingGuideRecord[]>([]);
  const [calves, setCalves] = useState<CalfRecord[]>([]);
  const [feedings, setFeedings] = useState<FeedingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [calvesLoading, setCalvesLoading] = useState(true);
  const [feedingsLoading, setFeedingsLoading] = useState(true);
  const [deletingId, setDeletingId] = useState('');
  const [error, setError] = useState('');
  const [calvesError, setCalvesError] = useState('');
  const [feedingsError, setFeedingsError] = useState('');
  const [success, setSuccess] = useState('');
  const [keyword, setKeyword] = useState('');

  const [selectedCalfId, setSelectedCalfId] = useState('');
  const [calfGuide, setCalfGuide] = useState<FeedingGuideRecord | null>(null);
  const [calfCheckError, setCalfCheckError] = useState('');
  const [calfChecking, setCalfChecking] = useState(false);

  const [checkAgeDays, setCheckAgeDays] = useState('');
  const [nearestGuide, setNearestGuide] = useState<FeedingGuideRecord | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState('');

  async function loadGuides() {
    setLoading(true);
    setError('');
    try {
      const data = await getFeedingGuideList();
      setRows(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '飼料給与目安を取得できませんでした。');
    } finally {
      setLoading(false);
    }
  }

  async function loadCalves() {
    setCalvesLoading(true);
    setCalvesError('');
    try {
      const data = await getAllRecords<CalfRecord>('calves');
      setCalves(data);
    } catch (err) {
      setCalvesError(err instanceof Error ? err.message : '子牛一覧を取得できませんでした。');
    } finally {
      setCalvesLoading(false);
    }
  }

  async function loadFeedings() {
    setFeedingsLoading(true);
    setFeedingsError('');
    try {
      const data = await getAllRecords<FeedingRecord>('feedings');
      setFeedings(data);
    } catch (err) {
      setFeedingsError(err instanceof Error ? err.message : '飼料給与実績を取得できませんでした。');
    } finally {
      setFeedingsLoading(false);
    }
  }

  useEffect(() => {
    loadGuides();
    loadCalves();
    loadFeedings();
  }, []);

  async function handleDelete(row: FeedingGuideRecord) {
    const ok = window.confirm(
      `この飼料給与目安を削除しますか？\n\n日齢：${row.ageDays || '-'}日\nステージ：${row.stageName || '-'}`
    );
    if (!ok) return;

    setDeletingId(row.id);
    setError('');
    setSuccess('');

    try {
      await deleteFeedingGuide(row.id);
      setSuccess('飼料給与目安を削除しました。');
      await loadGuides();
    } catch (err) {
      setError(err instanceof Error ? err.message : '飼料給与目安を削除できませんでした。');
    } finally {
      setDeletingId('');
    }
  }

  async function handleCheckNearest() {
    setCheckError('');
    setNearestGuide(null);

    if (!checkAgeDays.trim()) {
      setCheckError('日齢を入力してください。例：92');
      return;
    }

    if (Number.isNaN(Number(checkAgeDays))) {
      setCheckError('日齢は数字で入力してください。例：92');
      return;
    }

    setChecking(true);

    try {
      const data = await getNearestFeedingGuide(checkAgeDays);
      setNearestGuide(data);
    } catch (err) {
      setCheckError(err instanceof Error ? err.message : '日齢に近い給与目安を取得できませんでした。');
    } finally {
      setChecking(false);
    }
  }

  async function handleCheckSelectedCalf() {
    setCalfCheckError('');
    setCalfGuide(null);

    const calf = calves.find((item) => item.id === selectedCalfId);
    if (!calf) {
      setCalfCheckError('子牛を選択してください。');
      return;
    }

    const birthDate = calfBirthDate(calf);
    if (!birthDate) {
      setCalfCheckError('選択した子牛に生年月日が登録されていません。');
      return;
    }

    const ageDays = calculateAgeDays(birthDate);
    if (ageDays === null || ageDays < 0) {
      setCalfCheckError('生年月日から日齢を計算できませんでした。');
      return;
    }

    setCalfChecking(true);

    try {
      const data = await getNearestFeedingGuide(String(ageDays));
      setCalfGuide(data);
    } catch (err) {
      setCalfCheckError(err instanceof Error ? err.message : '子牛の日齢に近い給与目安を取得できませんでした。');
    } finally {
      setCalfChecking(false);
    }
  }

  const selectedCalf = useMemo(() => calves.find((item) => item.id === selectedCalfId) || null, [calves, selectedCalfId]);

  const selectedCalfAgeDays = useMemo(() => {
    if (!selectedCalf) return null;
    return calculateAgeDays(calfBirthDate(selectedCalf));
  }, [selectedCalf]);

  const selectedCalfLatestRecords = useMemo(() => {
    if (!selectedCalf) return [];
    return latestRecordsForCalf(feedings, selectedCalf);
  }, [feedings, selectedCalf]);

  const selectedCompareRows = useMemo(() => {
    if (!calfGuide) return [];
    return buildCompareRows(calfGuide, selectedCalfLatestRecords);
  }, [calfGuide, selectedCalfLatestRecords]);

  const shortageCount = selectedCompareRows.filter((row) => row.status.type === 'short').length;
  const overCount = selectedCompareRows.filter((row) => row.status.type === 'over').length;
  const okCount = selectedCompareRows.filter((row) => row.status.type === 'ok').length;

  const allCalfAlertRows: AllCalfAlertRow[] = useMemo(() => {
    return calves.map((calf) => {
      const ageDays = calculateAgeDays(calfBirthDate(calf));
      const guide = ageDays === null || ageDays < 0 ? null : nearestGuideFromRows(ageDays, rows);
      const records = latestRecordsForCalf(feedings, calf);
      const compareRows = guide ? buildCompareRows(guide, records) : [];
      const shortageCount = compareRows.filter((row) => row.status.type === 'short').length;
      const overCount = compareRows.filter((row) => row.status.type === 'over').length;
      const okCount = compareRows.filter((row) => row.status.type === 'ok').length;
      const latestDate = records.length > 0 ? feedingDate(records[0]) : '';

      const alertRow: AllCalfAlertRow = {
        calf,
        ageDays,
        guide,
        records,
        compareRows,
        shortageCount,
        overCount,
        okCount,
        latestDate,
        memo: ''
      };

      alertRow.memo = allCalfMemo(alertRow);
      return alertRow;
    }).sort((a, b) => {
      const scoreA = a.shortageCount * 3 + a.overCount * 3 + (a.records.length === 0 ? 1 : 0);
      const scoreB = b.shortageCount * 3 + b.overCount * 3 + (b.records.length === 0 ? 1 : 0);
      return scoreB - scoreA;
    });
  }, [calves, feedings, rows]);

  const allShortageCount = allCalfAlertRows.filter((row) => row.shortageCount > 0).length;
  const allOverCount = allCalfAlertRows.filter((row) => row.overCount > 0).length;
  const noRecordCount = allCalfAlertRows.filter((row) => row.records.length === 0).length;

  function handleExportAllCalfAlertCsv() {
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

    const body = allCalfAlertRows.map((row) => [
      calfLabel(row.calf),
      calfBirthDate(row.calf),
      row.ageDays === null ? '' : String(row.ageDays),
      row.guide ? row.guide.ageDays : '',
      row.guide ? row.guide.stageName : '',
      row.latestDate,
      String(row.shortageCount),
      String(row.overCount),
      String(row.okCount),
      row.memo
    ]);

    downloadCsv(`全子牛給与アラート_${todayText()}.csv`, [header, ...body]);
  }

  function handlePrintAllCalfAlert() {
    const summary = `
      <div class="summary">
        <div>不足気味の子牛：${htmlEscape(allShortageCount)}頭</div>
        <div>多めの子牛：${htmlEscape(allOverCount)}頭</div>
        <div>実績なし：${htmlEscape(noRecordCount)}頭</div>
      </div>
    `;

    const tableRows = allCalfAlertRows.map((row) => `
      <tr>
        <td>${htmlEscape(calfLabel(row.calf))}</td>
        <td>${htmlEscape(value(calfBirthDate(row.calf)))}</td>
        <td>${htmlEscape(row.ageDays === null ? '-' : `${row.ageDays}日`)}</td>
        <td>${htmlEscape(row.guide ? `${row.guide.ageDays}日 ${row.guide.stageName || ''}` : '-')}</td>
        <td>${htmlEscape(value(row.latestDate))}</td>
        <td>${htmlEscape(`${row.shortageCount}件`)}</td>
        <td>${htmlEscape(`${row.overCount}件`)}</td>
        <td>${htmlEscape(`${row.okCount}件`)}</td>
        <td>${htmlEscape(row.memo)}</td>
      </tr>
    `).join('');

    const html = `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>全子牛給与アラート一覧</title>
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
              grid-template-columns: repeat(3, 1fr);
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
          <h1>全子牛給与アラート一覧</h1>
          <div class="meta">印刷日時：${htmlEscape(printDateText())}</div>
          ${summary}
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
              ${tableRows}
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

  const filteredRows = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    if (!q) return rows;

    return rows.filter((row) => {
      const text = [
        row.ageDays,
        row.ageMonth,
        row.stageName,
        row.targetWeight,
        row.targetHeight,
        row.targetChest,
        row.starterAmount,
        row.growingFeedAmount,
        row.roughageAmount,
        row.otherAmount,
        row.memo
      ].join(' ').toLowerCase();

      return text.includes(q);
    });
  }, [rows, keyword]);

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1} alignItems="center">
        <Typography variant="h5" fontWeight={800} sx={{ flexGrow: 1 }}>
          飼料給与目安表
        </Typography>
        <Button component={RouterLink} to="/feeding-guide/new" variant="contained">
          新規登録
        </Button>
      </Stack>

      <Alert severity="info">
        全子牛の給与アラート一覧をCSV出力・印刷できます。
      </Alert>

      {success && <Alert severity="success">{success}</Alert>}

      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="h6" fontWeight={800} sx={{ flexGrow: 1 }}>
                全子牛の給与アラート一覧
              </Typography>
              <Button
                variant="outlined"
                onClick={handleExportAllCalfAlertCsv}
                disabled={allCalfAlertRows.length === 0}
              >
                CSV出力
              </Button>
              <Button
                variant="outlined"
                onClick={handlePrintAllCalfAlert}
                disabled={allCalfAlertRows.length === 0}
              >
                印刷
              </Button>
            </Stack>

            {(calvesLoading || feedingsLoading || loading) && (
              <Typography>全子牛の給与アラートを集計中...</Typography>
            )}

            {calvesError && <Alert severity="warning">{calvesError}</Alert>}
            {feedingsError && <Alert severity="warning">{feedingsError}</Alert>}

            {!calvesLoading && !calvesError && calves.length === 0 && (
              <Alert severity="info">
                子牛がまだ登録されていません。子牛管理で登録すると、全子牛の給与アラートを確認できます。
              </Alert>
            )}

            {!loading && !calvesLoading && calves.length > 0 && (
              <>
                <Grid container spacing={1}>
                  <Grid item xs={12} md={4}>
                    <Alert severity={allShortageCount > 0 ? 'warning' : 'success'}>
                      不足気味の子牛：{allShortageCount}頭
                    </Alert>
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <Alert severity={allOverCount > 0 ? 'error' : 'success'}>
                      多めの子牛：{allOverCount}頭
                    </Alert>
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <Alert severity={noRecordCount > 0 ? 'info' : 'success'}>
                      実績なし：{noRecordCount}頭
                    </Alert>
                  </Grid>
                </Grid>

                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>子牛</TableCell>
                      <TableCell>生年月日</TableCell>
                      <TableCell>日齢</TableCell>
                      <TableCell>近い目安</TableCell>
                      <TableCell>直近実績日</TableCell>
                      <TableCell>不足</TableCell>
                      <TableCell>多め</TableCell>
                      <TableCell>良好</TableCell>
                      <TableCell>注意メモ</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {allCalfAlertRows.map((row) => (
                      <TableRow key={row.calf.id}>
                        <TableCell>{calfLabel(row.calf)}</TableCell>
                        <TableCell>{value(calfBirthDate(row.calf))}</TableCell>
                        <TableCell>{row.ageDays === null ? '-' : `${row.ageDays}日`}</TableCell>
                        <TableCell>{row.guide ? `${row.guide.ageDays}日 ${row.guide.stageName || ''}` : '-'}</TableCell>
                        <TableCell>{value(row.latestDate)}</TableCell>
                        <TableCell>
                          <Chip size="small" color={row.shortageCount > 0 ? 'warning' : 'default'} label={`${row.shortageCount}件`} />
                        </TableCell>
                        <TableCell>
                          <Chip size="small" color={row.overCount > 0 ? 'error' : 'default'} label={`${row.overCount}件`} />
                        </TableCell>
                        <TableCell>
                          <Chip size="small" color={row.okCount > 0 ? 'success' : 'default'} label={`${row.okCount}件`} />
                        </TableCell>
                        <TableCell>{row.memo}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </>
            )}
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Typography variant="h6" fontWeight={800}>
              子牛を選んで給与目安・実績を確認
            </Typography>

            {calvesLoading && <Typography>子牛一覧を読み込み中...</Typography>}
            {feedingsLoading && <Typography>飼料給与実績を読み込み中...</Typography>}
            {calvesError && <Alert severity="warning">{calvesError}</Alert>}
            {feedingsError && <Alert severity="warning">{feedingsError}</Alert>}

            {!calvesLoading && !calvesError && calves.length === 0 && (
              <Alert severity="info">
                子牛がまだ登録されていません。子牛管理で登録すると、ここで選択できるようになります。
              </Alert>
            )}

            {!calvesLoading && !calvesError && calves.length > 0 && (
              <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                  <TextField
                    select
                    label="子牛を選択"
                    value={selectedCalfId}
                    onChange={(e) => {
                      setSelectedCalfId(e.target.value);
                      setCalfGuide(null);
                      setCalfCheckError('');
                    }}
                    fullWidth
                  >
                    <MenuItem value="">選択してください</MenuItem>
                    {calves.map((calf) => (
                      <MenuItem key={calf.id} value={calf.id}>
                        {calfLabel(calf)} / 生年月日：{value(calfBirthDate(calf))}
                      </MenuItem>
                    ))}
                  </TextField>
                </Grid>

                <Grid item xs={12} md={3}>
                  <Button
                    variant="contained"
                    onClick={handleCheckSelectedCalf}
                    disabled={calfChecking}
                    sx={{ height: '100%' }}
                  >
                    {calfChecking ? '確認中...' : '目安と実績を確認'}
                  </Button>
                </Grid>

                {selectedCalf && (
                  <Grid item xs={12}>
                    <Typography color="text.secondary">
                      選択中：{calfLabel(selectedCalf)} / 生年月日：{value(calfBirthDate(selectedCalf))} / 日齢：{selectedCalfAgeDays === null ? '-' : `${selectedCalfAgeDays}日`}
                    </Typography>
                  </Grid>
                )}
              </Grid>
            )}

            {calfCheckError && <Alert severity="error">{calfCheckError}</Alert>}

            {calfGuide && selectedCalfAgeDays !== null && (
              <>
                <Card variant="outlined">
                  <CardContent>
                    <Stack spacing={1}>
                      <Typography variant="h6" fontWeight={800}>
                        判定まとめ
                      </Typography>

                      {selectedCalfLatestRecords.length === 0 ? (
                        <Alert severity="info">
                          飼料給与実績がまだないため、比較判定はありません。
                        </Alert>
                      ) : (
                        <Grid container spacing={1}>
                          <Grid item xs={12} md={4}>
                            <Alert severity={shortageCount > 0 ? 'warning' : 'success'}>
                              不足気味：{shortageCount}件
                            </Alert>
                          </Grid>
                          <Grid item xs={12} md={4}>
                            <Alert severity={overCount > 0 ? 'error' : 'success'}>
                              多め：{overCount}件
                            </Alert>
                          </Grid>
                          <Grid item xs={12} md={4}>
                            <Alert severity="success">
                              ちょうどよい：{okCount}件
                            </Alert>
                          </Grid>
                        </Grid>
                      )}
                    </Stack>
                  </CardContent>
                </Card>

                <GuideCard title="子牛に該当する給与目安" inputAgeDays={String(selectedCalfAgeDays)} guide={calfGuide} />
                <ComparisonCard guide={calfGuide} records={selectedCalfLatestRecords} />
              </>
            )}
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Typography variant="h6" fontWeight={800}>
              日齢を直接入力して確認
            </Typography>

            <Grid container spacing={2}>
              <Grid item xs={12} md={4}>
                <TextField
                  label="子牛の日齢"
                  placeholder="例：92"
                  value={checkAgeDays}
                  onChange={(e) => setCheckAgeDays(e.target.value)}
                  fullWidth
                />
              </Grid>

              <Grid item xs={12} md={4}>
                <Button
                  variant="outlined"
                  onClick={handleCheckNearest}
                  disabled={checking}
                  sx={{ height: '100%' }}
                >
                  {checking ? '確認中...' : '目安を確認'}
                </Button>
              </Grid>
            </Grid>

            {checkError && <Alert severity="error">{checkError}</Alert>}

            {nearestGuide && (
              <GuideCard title="該当する給与目安" inputAgeDays={checkAgeDays} guide={nearestGuide} />
            )}
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Stack spacing={1}>
            <Typography variant="h6" fontWeight={800}>概要</Typography>
            <Typography>給与目安 登録件数：{rows.length}件</Typography>
            <Typography>給与目安 表示件数：{filteredRows.length}件</Typography>
            <Typography>子牛 読み込み件数：{calves.length}件</Typography>
            <Typography>飼料給与実績 読み込み件数：{feedings.length}件</Typography>
            <Typography color="text.secondary">
              次のStarter Packで給与アラートをレポートにも表示する準備を進めます。
            </Typography>
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <TextField
            label="検索"
            placeholder="日齢、月齢、ステージ、メモなど"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            fullWidth
          />
        </CardContent>
      </Card>

      {loading && <Typography>読み込み中...</Typography>}

      {error && <Alert severity="error">{error}</Alert>}

      {!loading && !error && filteredRows.length === 0 && (
        <Alert severity="success">
          条件に合う飼料給与目安はありません。
        </Alert>
      )}

      {!loading && !error && filteredRows.length > 0 && (
        <Card>
          <CardContent>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>操作</TableCell>
                  <TableCell>日齢</TableCell>
                  <TableCell>月齢</TableCell>
                  <TableCell>ステージ</TableCell>
                  <TableCell>体重目安</TableCell>
                  <TableCell>体高目安</TableCell>
                  <TableCell>胸囲目安</TableCell>
                  <TableCell>スターター</TableCell>
                  <TableCell>育成配合</TableCell>
                  <TableCell>粗飼料</TableCell>
                  <TableCell>その他</TableCell>
                  <TableCell>メモ</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredRows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <Stack direction="row" spacing={1}>
                        <Button component={RouterLink} to={`/feeding-guide/${row.id}/edit`} variant="outlined" size="small">
                          編集
                        </Button>
                        <Button
                          variant="outlined"
                          color="error"
                          size="small"
                          onClick={() => handleDelete(row)}
                          disabled={deletingId === row.id}
                        >
                          {deletingId === row.id ? '削除中' : '削除'}
                        </Button>
                      </Stack>
                    </TableCell>
                    <TableCell>{value(row.ageDays)}日</TableCell>
                    <TableCell>{value(row.ageMonth)}か月</TableCell>
                    <TableCell>
                      <Chip size="small" color={stageColor(row.stageName) as any} label={value(row.stageName)} />
                    </TableCell>
                    <TableCell>{kg(row.targetWeight)}</TableCell>
                    <TableCell>{cm(row.targetHeight)}</TableCell>
                    <TableCell>{cm(row.targetChest)}</TableCell>
                    <TableCell>{amountText(row.starterAmount)}</TableCell>
                    <TableCell>{amountText(row.growingFeedAmount)}</TableCell>
                    <TableCell>{amountText(row.roughageAmount)}</TableCell>
                    <TableCell>{value(row.otherAmount)}</TableCell>
                    <TableCell>{value(row.memo)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </Stack>
  );
}

