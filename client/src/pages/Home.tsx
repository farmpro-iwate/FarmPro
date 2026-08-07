import { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  Divider,
  Drawer,
  Grid,
  Stack,
  Typography
} from '@mui/material';
import { TodayTasks } from '../components/TodayTasks';
import { getAllRecords } from '../storage/repository';
import { getMonthlyBalance } from '../services/monthlyBalanceApi';
import { formatTemporaryCalfNumber, isTemporaryCalfNumber } from '../utils/temporaryCalfNumber';

type AnyRow = Record<string, any> & { id: string };

type StoryItem = {
  id: string;
  date: string;
  category: string;
  title: string;
  detail: string;
  animalKind?: 'cattle' | 'calf';
  animalId?: string | number;
  animalName?: string;
  earTag?: string;
  birthday?: string;
};

type TodayItem = {
  id: string;
  date: string;
  label: string;
  animalName: string;
  earTag: string;
  status: '期限超過' | '今日' | '近日中' | '継続中';
  to: string;
  note?: string;
};

type CurrentMonthBalance = {
  sales: number;
  expenses: number;
  balance: number;
};

function value(v: unknown) {
  if (v === null || v === undefined || v === '') return '-';
  return String(v);
}

function yen(amount: number) {
  return `${Number(amount || 0).toLocaleString('ja-JP')}円`;
}

function formatToday() {
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short'
  }).format(new Date());
}

function dateOnly(valueText?: string) {
  return valueText ? String(valueText).slice(0, 10) : '';
}

function todayText() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDays(dateText: string, days: number) {
  const date = new Date(`${dateText}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function daysUntil(dateText: string) {
  if (!dateText) return null;
  const target = new Date(`${dateText}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date(`${todayText()}T00:00:00`);
  return Math.floor((target.getTime() - today.getTime()) / 86400000);
}

function planStatus(date: string): TodayItem['status'] | null {
  const today = todayText();
  if (date < addDays(today, -7)) return null;
  if (date < today) return '期限超過';
  if (date === today) return '今日';
  if (date <= addDays(today, 7)) return '近日中';
  return null;
}

function resultColor(result?: string) {
  if (result === '自然分娩' || result === '受胎') return 'success';
  if (result === '難産' || result === '再鑑定予定') return 'warning';
  if (result === '死産' || result === '空胎' || result === '流産・胎子喪失') return 'error';
  return 'default';
}

function statusColor(status: TodayItem['status']) {
  if (status === '期限超過') return 'error';
  if (status === '今日' || status === '継続中') return 'warning';
  return 'info';
}

export function Home() {
  const [cattle, setCattle] = useState<AnyRow[]>([]);
  const [calves, setCalves] = useState<AnyRow[]>([]);
  const [breedings, setBreedings] = useState<AnyRow[]>([]);
  const [calvings, setCalvings] = useState<AnyRow[]>([]);
  const [currentMonthBalance, setCurrentMonthBalance] = useState<CurrentMonthBalance>({ sales: 0, expenses: 0, balance: 0 });
  const [loading, setLoading] = useState(true);
  const [selectedStory, setSelectedStory] = useState<StoryItem | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [cattleData, calfData, breedingData, calvingData, balanceData] = await Promise.all([
        getAllRecords<AnyRow>('cattle'),
        getAllRecords<AnyRow>('calves'),
        getAllRecords<AnyRow>('breedings'),
        getAllRecords<AnyRow>('calvings'),
        getMonthlyBalance().catch(() => ({ rows: [], totals: null }))
      ]);
      setCattle(Array.isArray(cattleData) ? cattleData : []);
      setCalves(Array.isArray(calfData) ? calfData : []);
      setBreedings(Array.isArray(breedingData) ? breedingData : []);
      setCalvings(Array.isArray(calvingData) ? calvingData : []);
      const currentYearMonth = todayText().slice(0, 7);
      const currentRow = balanceData.rows.find((row) => row.yearMonth === currentYearMonth);
      setCurrentMonthBalance({
        sales: currentRow?.salesTotalAmount || 0,
        expenses: currentRow?.expenseTotalAmount || 0,
        balance: currentRow?.balanceAmount || 0,
      });
      setLoading(false);
    }
    load();
  }, []);

  const story = useMemo(() => {
    const items: StoryItem[] = [];

    cattle.forEach((row) => {
      items.push({
        id: `cattle-${row.id}`,
        date: dateOnly(row.createdAt || row.updatedAt || row.birthday),
        category: '繁殖牛台帳',
        title: `${value(row.earTag)} ${value(row.name)}を登録`,
        detail: row.note ? `メモ：${row.note}` : '母牛・育成牛の個体情報',
        animalKind: 'cattle',
        animalId: row.id,
        animalName: row.name,
        earTag: row.earTag
      });
    });

    calves.forEach((row) => {
      items.push({
        id: `calf-${row.id}`,
        date: dateOnly(row.createdAt || row.updatedAt || row.birthday),
        category: '子牛',
        title: `${formatTemporaryCalfNumber(row.calfNumber, row.birthday)} ${value(row.name)}を登録`,
        detail: `母牛：${value(row.motherName)}　現在体重：${value(row.currentWeight)}kg`,
        animalKind: 'calf',
        animalId: row.id,
        animalName: row.name,
        earTag: row.calfNumber,
        birthday: row.birthday
      });
    });

    breedings.forEach((row) => {
      const method = row.breedingMethod && row.breedingMethod !== '未選択' ? row.breedingMethod : '繁殖管理';
      const detailParts = [row.breedingStatus, row.pregnancyResult !== '未鑑定' ? row.pregnancyResult : '', row.transferCancelReason].filter(Boolean);
      const cattleMatch = cattle.find((animal) => String(animal.earTag) === String(row.cowEarTag));
      items.push({
        id: `breeding-${row.id}`,
        date: dateOnly(row.updatedAt || row.createdAt || row.inseminationDate || row.transferDate || row.heatDate),
        category: '繁殖',
        title: `${value(row.cowEarTag)} ${value(row.cowName)}：${method}`,
        detail: detailParts.join('・') || '繁殖記録を更新',
        animalKind: 'cattle',
        animalId: cattleMatch?.id,
        animalName: row.cowName,
        earTag: row.cowEarTag
      });
    });

    calvings.forEach((row) => {
      const cattleMatch = cattle.find((animal) => String(animal.earTag) === String(row.cowEarTag));
      items.push({
        id: `calving-${row.id}`,
        date: dateOnly(row.actualCalvingDate || row.updatedAt || row.createdAt),
        category: '分娩',
        title: `${value(row.cowEarTag || row.cowName)}：分娩記録`,
        detail: `子牛：${value(row.calfName)}　結果：${value(row.calvingResult)}`,
        animalKind: 'cattle',
        animalId: cattleMatch?.id,
        animalName: row.cowName,
        earTag: row.cowEarTag
      });
    });

    return items.filter((item) => item.date).sort((a, b) => b.date.localeCompare(a.date));
  }, [cattle, calves, breedings, calvings]);

  const todayPlans = useMemo(() => {
    const plans: TodayItem[] = [];
    breedings.forEach((row) => {
      const pregnancyResult = String(row.pregnancyResult || '未鑑定');
      const breedingStatus = String(row.breedingStatus || '');
      const isCalved = breedingStatus === '分娩済み';
      const isPregnant = ['受胎', '妊娠'].includes(pregnancyResult);
      const isEmpty = ['空胎', '不受胎'].includes(pregnancyResult);
      const needsRecheck = pregnancyResult === '再鑑定予定';
      const hasPregnancyCheck = Boolean(dateOnly(row.pregnancyCheckDate || row.pregnancyDiagnosisDate));
      const candidates: Array<[string, unknown]> = [];

      if (!isCalved && !isPregnant && !needsRecheck && !hasPregnancyCheck) {
        candidates.push(['次回発情確認', row.nextHeatExpectedDate]);
        candidates.push(['妊娠鑑定', row.pregnancyCheckExpectedDate]);
      }
      if (!isCalved && isEmpty) {
        candidates.push(['次回発情確認', row.nextHeatExpectedDate]);
      }
      if (!isCalved && needsRecheck) {
        candidates.push(['再鑑定', row.recheckExpectedDate]);
      }
      if (!isCalved && isPregnant) {
        candidates.push(['分娩予定', row.expectedCalvingDate]);

        const expectedCalvingDate = dateOnly(row.expectedCalvingDate);
        if (expectedCalvingDate && todayText() >= addDays(expectedCalvingDate, -60)) {
          plans.push({
            id: `${row.id}-増し飼い検討-${expectedCalvingDate}`,
            date: expectedCalvingDate,
            label: '増し飼い検討',
            animalName: value(row.cowName),
            earTag: value(row.cowEarTag),
            status: '継続中',
            to: `/breedings/${row.id}/edit`,
            note: '配合飼料を通常より1～2kg程度増やすのは目安です。母牛の体況・飼料内容・獣医師や飼料設計に応じて調整してください。'
          });
        }
      }
      if (!isCalved && breedingStatus !== '中止' && !row.transferDate) {
        candidates.push(['移植予定', row.transferPlannedDate]);
      }

      candidates.forEach(([label, rawDate]) => {
        const date = dateOnly(rawDate as string | undefined);
        const status = date ? planStatus(date) : null;
        if (!status) return;
        plans.push({
          id: `${row.id}-${label}-${date}`,
          date,
          label,
          animalName: value(row.cowName),
          earTag: value(row.cowEarTag),
          status,
          to: `/breedings/${row.id}/edit`
        });
      });
    });
    return plans.sort((a, b) => a.date.localeCompare(b.date));
  }, [breedings]);

  const farmSummary = useMemo(() => {
    const pregnantCows = new Set<string>();
    const attentionCows = new Set<string>();

    breedings.forEach((row) => {
      const pregnancyResult = String(row.pregnancyResult || '未鑑定');
      const breedingStatus = String(row.breedingStatus || '');
      const isCalved = breedingStatus === '分娩済み';
      const isPregnant = ['受胎', '妊娠'].includes(pregnancyResult);
      const isEmpty = ['空胎', '不受胎'].includes(pregnancyResult);
      const needsRecheck = pregnancyResult === '再鑑定予定';
      const hasPregnancyCheck = Boolean(dateOnly(row.pregnancyCheckDate || row.pregnancyDiagnosisDate));
      const cowKey = String(row.cowEarTag || row.cowName || row.id);

      if (!isCalved && isPregnant) pregnantCows.add(cowKey);
      if (isCalved) return;

      if (!isPregnant && !needsRecheck && !hasPregnancyCheck) {
        const days = daysUntil(dateOnly(row.pregnancyCheckExpectedDate));
        if (days !== null && days >= -7 && days <= 14) attentionCows.add(cowKey);
      }
      if (isEmpty) {
        const days = daysUntil(dateOnly(row.nextHeatExpectedDate));
        if (days !== null && days >= -7 && days <= 14) attentionCows.add(cowKey);
      }
      if (needsRecheck) {
        const days = daysUntil(dateOnly(row.recheckExpectedDate));
        if (days !== null && days >= -7 && days <= 14) attentionCows.add(cowKey);
      }
      if (isPregnant) {
        const days = daysUntil(dateOnly(row.expectedCalvingDate));
        if (days !== null && days <= 60) attentionCows.add(cowKey);
      }
    });

    return {
      breedingCattle: cattle.filter((row) => row.stage !== '育成牛').length,
      calves: calves.filter((row) => row.managementStatus !== '牛台帳へ移行済み').length,
      pregnant: pregnantCows.size,
      attention: attentionCows.size,
    };
  }, [cattle, calves, breedings]);

  const selectedAnimalStory = useMemo(() => {
    if (!selectedStory?.earTag) return [];
    return story.filter((item) => item.earTag === selectedStory.earTag);
  }, [selectedStory, story]);

  const detailLink = selectedStory?.animalId
    ? selectedStory.animalKind === 'calf'
      ? `/calves/${selectedStory.animalId}`
      : `/cattle/${selectedStory.animalId}`
    : selectedStory?.animalKind === 'calf' ? '/calves' : '/cattle';

  const selectedStoryNumberLabel =
    selectedStory?.animalKind === 'calf' && isTemporaryCalfNumber(selectedStory.earTag)
      ? '仮管理番号'
      : '耳標';
  const selectedStoryNumber =
    selectedStory?.animalKind === 'calf'
      ? formatTemporaryCalfNumber(selectedStory.earTag, selectedStory.birthday)
      : value(selectedStory?.earTag);

  return (
    <Stack spacing={3}>
      <Card sx={{ overflow: 'hidden' }}>
        <CardContent sx={{ p: { xs: 2, md: 3 } }}>
          <Box>
            <Typography color="text.secondary" fontWeight={700}>{formatToday()}</Typography>
            <Typography variant="h4" fontWeight={900}>FarmPro ファームボード</Typography>
            <Typography color="text.secondary">今日やることと、農場で記録した出来事を一画面で確認します。</Typography>
          </Box>
        </CardContent>
      </Card>

      {loading && <Alert severity="info">ファームボードを読み込み中です...</Alert>}

      <Card>
        <CardContent>
          <Stack spacing={1.5}>
            <Box>
              <Typography variant="h5" fontWeight={900}>農場の現在状況</Typography>
              <Typography color="text.secondary">現在の頭数と繁殖状況、今月の経営状況をまとめて確認します。</Typography>
            </Box>
            <Grid container spacing={1.5}>
              <Grid item xs={6} md={3}>
                <Card variant="outlined"><CardContent><Typography color="text.secondary">繁殖牛</Typography><Typography variant="h4" fontWeight={900}>{farmSummary.breedingCattle}<Typography component="span" variant="body1"> 頭</Typography></Typography></CardContent></Card>
              </Grid>
              <Grid item xs={6} md={3}>
                <Card variant="outlined"><CardContent><Typography color="text.secondary">子牛</Typography><Typography variant="h4" fontWeight={900}>{farmSummary.calves}<Typography component="span" variant="body1"> 頭</Typography></Typography></CardContent></Card>
              </Grid>
              <Grid item xs={6} md={3}>
                <Card variant="outlined"><CardContent><Typography color="text.secondary">受胎中</Typography><Typography variant="h4" fontWeight={900}>{farmSummary.pregnant}<Typography component="span" variant="body1"> 頭</Typography></Typography></CardContent></Card>
              </Grid>
              <Grid item xs={6} md={3}>
                <Card variant="outlined"><CardContent><Typography color="text.secondary">要対応牛</Typography><Typography variant="h4" fontWeight={900}>{farmSummary.attention}<Typography component="span" variant="body1"> 頭</Typography></Typography></CardContent></Card>
              </Grid>
              <Grid item xs={12} sm={4}>
                <Card variant="outlined"><CardContent><Typography color="text.secondary">今月の売上</Typography><Typography variant="h5" fontWeight={900}>{yen(currentMonthBalance.sales)}</Typography></CardContent></Card>
              </Grid>
              <Grid item xs={12} sm={4}>
                <Card variant="outlined"><CardContent><Typography color="text.secondary">今月の経費</Typography><Typography variant="h5" fontWeight={900}>{yen(currentMonthBalance.expenses)}</Typography></CardContent></Card>
              </Grid>
              <Grid item xs={12} sm={4}>
                <Card variant="outlined"><CardContent><Typography color="text.secondary">今月の差引収支</Typography><Typography variant="h5" fontWeight={900}>{yen(currentMonthBalance.balance)}</Typography></CardContent></Card>
              </Grid>
            </Grid>
            <Button component={RouterLink} to="/monthly-balance" variant="outlined">月別収支を確認</Button>
          </Stack>
        </CardContent>
      </Card>

      <Card sx={{ border: 2, borderColor: 'primary.main' }}>
        <CardContent>
          <Stack spacing={2}>
            <Box>
              <Typography variant="h5" fontWeight={900}>近日の対応</Typography>
              <Typography color="text.secondary">これから対応する予定をまとめて表示します。</Typography>
            </Box>
            <Divider />
            {todayPlans.length === 0 ? (
              <Alert severity="success">今日から7日以内に対応する繁殖予定はありません。</Alert>
            ) : (
              <Stack spacing={1}>
                {todayPlans.map((item) => (
                  <Card key={item.id} variant="outlined">
                    <CardActionArea component={RouterLink} to={item.to}>
                      <CardContent sx={{ py: 1.25, '&:last-child': { pb: 1.25 } }}>
                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
                          <Chip size="small" color={statusColor(item.status)} label={item.status} />
                          <Chip size="small" variant="outlined" label="繁殖" />
                          <Typography fontWeight={900}>{item.date}　{item.label}</Typography>
                          <Box sx={{ flexGrow: 1 }}>
                            <Typography>耳標 {item.earTag}　{item.animalName}</Typography>
                            {item.note && <Typography variant="body2" color="text.secondary">{item.note}</Typography>}
                          </Box>
                          <Typography color="primary" fontWeight={800}>記録を開く →</Typography>
                        </Stack>
                      </CardContent>
                    </CardActionArea>
                  </Card>
                ))}
              </Stack>
            )}
            <Divider />
            <TodayTasks />
          </Stack>
        </CardContent>
      </Card>

      <Card sx={{ border: 2, borderColor: 'primary.main' }}>
        <CardContent>
          <Stack spacing={2}>
            <Box>
              <Typography variant="h5" fontWeight={900}>活動登録</Typography>
              <Typography color="text.secondary">
                現場で行った繁殖・分娩・治療の記録を、ここから登録します。
              </Typography>
            </Box>
            <Grid container spacing={1.5}>
              <Grid item xs={6} sm={6} md={3}>
                <Button component={RouterLink} to="/breedings/new" variant="contained" fullWidth sx={{ minHeight: 52 }}>
                  発情・種付
                </Button>
              </Grid>
              <Grid item xs={6} sm={6} md={3}>
                <Button component={RouterLink} to="/pregnancy-checks" variant="contained" fullWidth sx={{ minHeight: 52 }}>
                  妊娠鑑定
                </Button>
              </Grid>
              <Grid item xs={6} sm={6} md={3}>
                <Button component={RouterLink} to="/calvings/new" variant="contained" fullWidth sx={{ minHeight: 52 }}>
                  分娩
                </Button>
              </Grid>
              <Grid item xs={6} sm={6} md={3}>
                <Button component={RouterLink} to="/treatments/new" variant="contained" fullWidth sx={{ minHeight: 52 }}>
                  治療
                </Button>
              </Grid>
            </Grid>
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Box>
              <Typography variant="h5" fontWeight={900}>農場ストーリー</Typography>
              <Typography color="text.secondary">農場で記録した出来事を新しい順に表示します。記録を押すと、その牛の個体ストーリーを確認できます。</Typography>
            </Box>
            <Divider />
            {story.length === 0 ? (
              <Typography color="text.secondary">表示できる記録はまだありません。</Typography>
            ) : (
              <Stack spacing={1}>
                {story.slice(0, 10).map((item) => (
                  <Card key={item.id} variant="outlined">
                    <CardActionArea onClick={() => setSelectedStory(item)}>
                      <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25} alignItems={{ sm: 'center' }}>
                          <Typography fontWeight={900} sx={{ minWidth: 105 }}>{item.date}</Typography>
                          <Chip size="small" label={item.category} />
                          <Box sx={{ flexGrow: 1 }}>
                            <Typography fontWeight={800}>{item.title}</Typography>
                            <Typography color="text.secondary">{item.detail}</Typography>
                          </Box>
                          <Typography color="primary" fontWeight={800}>個体ストーリーを見る →</Typography>
                        </Stack>
                      </CardContent>
                    </CardActionArea>
                  </Card>
                ))}
              </Stack>
            )}
          </Stack>
        </CardContent>
      </Card>

      <Card sx={{ border: 2, borderColor: 'info.main', bgcolor: 'info.50' }}>
        <CardContent>
          <Stack spacing={1.5}>
            <Box>
              <Typography variant="h5" fontWeight={900}>初めて使う方へ</Typography>
              <Typography color="text.secondary">
                試用を始める前に、登録の順番と端末内保存・バックアップの注意点を確認してください。
              </Typography>
            </Box>
            <Button
              component={RouterLink}
              to="/help"
              variant="contained"
              size="large"
              fullWidth
              sx={{ minHeight: 52, fontWeight: 800 }}
            >
              試用ガイドを開く
            </Button>
          </Stack>
        </CardContent>
      </Card>

      <Drawer anchor="right" open={Boolean(selectedStory)} onClose={() => setSelectedStory(null)}>
        <Box sx={{ width: { xs: 320, sm: 460 }, p: 2.5 }}>
          <Stack spacing={2}>
            <Box>
              <Typography variant="h5" fontWeight={900}>個体ストーリー</Typography>
              <Typography color="text.secondary">{selectedStoryNumberLabel} {selectedStoryNumber}　{value(selectedStory?.animalName)}</Typography>
            </Box>
            <Divider />
            {selectedAnimalStory.map((item) => (
              <Card key={item.id} variant="outlined">
                <CardContent sx={{ py: 1.25, '&:last-child': { pb: 1.25 } }}>
                  <Typography fontWeight={900}>{item.date}　{item.category}</Typography>
                  <Typography>{item.title}</Typography>
                  <Typography color="text.secondary">{item.detail}</Typography>
                  {item.category === '分娩' && <Chip sx={{ mt: 1 }} size="small" color={resultColor(item.detail.split('結果：')[1]) as any} label="分娩記録" />}
                </CardContent>
              </Card>
            ))}
            <Button component={RouterLink} to={detailLink} variant="contained" size="large">
              個体カルテを開く
            </Button>
            <Button variant="outlined" onClick={() => setSelectedStory(null)}>閉じる</Button>
          </Stack>
        </Box>
      </Drawer>
    </Stack>
  );
}

export default Home;