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
import { getCattleList, pullNewerCattleRecordsFromCloud } from '../services/api';
import { getCalfList, getCalfListForHomeSummary } from '../services/calfApi';
import { getBreedingList, getBreedingListForHomeSummary } from '../services/breedingApi';
import { fetchCalvings } from '../services/calvingsApi';
import { pullNewerCalvingRecordsFromCloud } from '../services/calvingRecordSync';
import { getMonthlyBalance } from '../services/monthlyBalanceApi';
import { formatTemporaryCalfNumber, isTemporaryCalfNumber } from '../utils/temporaryCalfNumber';
import { getStoredAuthUser } from '../services/authClient';
import { getFarmSettings } from '../services/settingsApi';
import { withEtHeatBasedSchedule } from '../utils/breeding';
import { getCattlePlanSnapshot } from '../services/cattlePlanSnapshot';
import { cattlePlanDestination, localCattlePlanToday, resolveCattleBreedingPlans, type CattlePlanSnapshot } from '../utils/cattleBreedingPlans';
import { breedingPlanDaysUntil, upcomingBreedingPlans } from '../utils/breedingPlans';

type AnyRow = Record<string, any> & { id: string | number };

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

function daysUntil(dateText: string) {
  if (!dateText) return null;
  const target = new Date(`${dateText}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date(`${todayText()}T00:00:00`);
  return Math.floor((target.getTime() - today.getTime()) / 86400000);
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

function SummaryCard({ label, valueText, to, ariaLabel }: { label: string; valueText: React.ReactNode; to: string; ariaLabel: string }) {
  return (
    <Card variant="outlined" sx={{ height: '100%' }}>
      <CardActionArea component={RouterLink} to={to} aria-label={ariaLabel} sx={{ height: '100%' }}>
        <CardContent>
          <Typography color="text.secondary">{label}</Typography>
          {valueText}
        </CardContent>
      </CardActionArea>
    </Card>
  );
}

async function loadCattleForHome() {
  try {
    await pullNewerCattleRecordsFromCloud();
  } catch (error) {
    console.warn('ホームの繁殖牛台帳クラウド取得をスキップしました。', error);
  }
  return getCattleList();
}

async function loadCalvingsForHome() {
  try {
    await pullNewerCalvingRecordsFromCloud();
  } catch (error) {
    console.warn('ホームの分娩記録クラウド取得をスキップしました。', error);
  }
  return fetchCalvings();
}

export function Home() {
  const authUser = getStoredAuthUser();
  const isFreePlan = authUser?.plan !== 'standard' && authUser?.plan !== 'pro';
  const [cattle, setCattle] = useState<AnyRow[]>([]);
  const [calves, setCalves] = useState<AnyRow[]>([]);
  const [breedings, setBreedings] = useState<AnyRow[]>([]);
  const [summaryCalves, setSummaryCalves] = useState<AnyRow[]>([]);
  const [summaryBreedings, setSummaryBreedings] = useState<AnyRow[]>([]);
  const [calvings, setCalvings] = useState<AnyRow[]>([]);
  const [cattlePlanSnapshot, setCattlePlanSnapshot] = useState<CattlePlanSnapshot | null>(null);
  const [currentMonthBalance, setCurrentMonthBalance] = useState<CurrentMonthBalance>({ sales: 0, expenses: 0, balance: 0 });
  const [loading, setLoading] = useState(true);
  const [selectedStory, setSelectedStory] = useState<StoryItem | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const calvingDataPromise = loadCalvingsForHome();
      const cattlePlanDataPromise = calvingDataPromise.then(() => getCattlePlanSnapshot());
      const [
        cattleData,
        calfData,
        breedingData,
        summaryCalfData,
        summaryBreedingData,
        calvingData,
        balanceData,
        settingsData,
        cattlePlanData
      ] = await Promise.all([
        loadCattleForHome(),
        getCalfList(),
        getBreedingList(),
        getCalfListForHomeSummary(),
        getBreedingListForHomeSummary(),
        calvingDataPromise,
        getMonthlyBalance().catch(() => ({ rows: [], totals: null })),
        getFarmSettings().catch(() => null),
        cattlePlanDataPromise
      ]);
      setCattle(Array.isArray(cattleData) ? cattleData as AnyRow[] : []);
      setCalves(Array.isArray(calfData) ? calfData as AnyRow[] : []);
      const cycleDays = settingsData?.estrousCycleDays || 21;
      setBreedings(Array.isArray(breedingData) ? (breedingData as AnyRow[]).map((row) => withEtHeatBasedSchedule(row, cycleDays)) : []);
      setSummaryCalves(Array.isArray(summaryCalfData) ? summaryCalfData as AnyRow[] : []);
      setSummaryBreedings(Array.isArray(summaryBreedingData) ? (summaryBreedingData as AnyRow[]).map((row) => withEtHeatBasedSchedule(row, cycleDays)) : []);
      setCalvings(Array.isArray(calvingData) ? calvingData as AnyRow[] : []);
      setCattlePlanSnapshot(cattlePlanData);
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

    summaryCalves.forEach((row) => {
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

    summaryBreedings.forEach((row) => {
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
  }, [cattle, summaryCalves, summaryBreedings, calvings]);

  const homeBreedingPlans = useMemo(() => {
    const plans: TodayItem[] = [];
    const issues: string[] = [];
    if (!cattlePlanSnapshot) return { plans, issues };

    const today = localCattlePlanToday();
    cattle.forEach((animal) => {
      const summary = resolveCattleBreedingPlans(animal, cattlePlanSnapshot, today);
      if (summary.isSold) return;

      summary.issues.forEach((message) => {
        const prefix = `耳標 ${value(animal.earTag)}　${value(animal.name)}：`;
        const text = `${prefix}${message}`;
        if (!issues.includes(text)) issues.push(text);
      });

      upcomingBreedingPlans(summary.plans, today, 7).forEach((item) => {
        const days = item.date ? breedingPlanDaysUntil(item.date, today) : null;
        const status: TodayItem['status'] =
          item.date === null ? '継続中' :
          days !== null && days < 0 ? '期限超過' :
          days === 0 ? '今日' : '近日中';
        const destination = cattlePlanDestination(item, animal, '/');
        plans.push({
          id: `${animal.id}-${item.sourceRecordId || 'post-calving'}-${item.kind}-${item.date || item.relatedDate || ''}`,
          date: item.date || '',
          label: item.title,
          animalName: value(animal.name),
          earTag: value(animal.earTag),
          status,
          to: destination.to,
          note: item.kind === 'feed-review' && item.relatedDate
            ? `${item.note || ''} 分娩予定日：${item.relatedDate}`.trim()
            : item.note
        });
      });
    });

    plans.sort((a, b) => {
      if (!a.date && b.date) return 1;
      if (a.date && !b.date) return -1;
      return a.date.localeCompare(b.date);
    });
    return { plans, issues };
  }, [cattle, cattlePlanSnapshot]);

  const todayPlans = homeBreedingPlans.plans;
  const todayPlanIssues = homeBreedingPlans.issues;

  const suppressedTodayScheduleKeys = useMemo(() => {
    const keys = new Set<string>();
    const aliasesByLabel: Record<string, string[]> = {
      '分娩後の発情確認': ['発情確認', '次回発情確認', '分娩後の発情確認'],
      '次回発情確認': ['発情確認', '次回発情確認'],
      '受精卵移植（ET）': ['受精卵移植（ET）', '受精卵移植', 'ET予定'],
      '妊娠鑑定': ['妊娠鑑定'],
      '再鑑定': ['再鑑定', '妊娠再鑑定'],
      '分娩予定': ['分娩予定'],
    };

    todayPlans.forEach((item) => {
      if (!item.earTag || item.earTag === '-') return;
      const aliases = aliasesByLabel[item.label] || [];
      aliases.forEach((title) => keys.add(`${item.earTag}::${title}`));
    });
    return Array.from(keys);
  }, [todayPlans]);

  const farmSummary = useMemo(() => {
    const pregnantCows = new Set<string>();
    const attentionCows = new Set<string>();

    summaryBreedings.forEach((row) => {
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
      calves: summaryCalves.filter((row) =>
        row.managementStatus !== '牛台帳へ移行済み' &&
        row.managementStatus !== '販売済み'
      ).length,
      pregnant: pregnantCows.size,
      attention: attentionCows.size,
    };
  }, [cattle, summaryCalves, summaryBreedings]);

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
    <Stack spacing={2}>
      <Card sx={{ overflow: 'hidden' }}>
        <CardContent sx={{ p: { xs: 2, md: 2 }, '&:last-child': { pb: { xs: 2, md: 2 } } }}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={{ xs: 0.25, md: 2 }} alignItems={{ md: 'center' }}>
            <Typography variant="h5" fontWeight={900}>FarmPro ファームボード</Typography>
            <Typography color="text.secondary" fontWeight={700}>{formatToday()}</Typography>
            <Typography color="text.secondary" sx={{ ml: { md: 'auto !important' } }}>今日やることと農場の状況を確認します。</Typography>
          </Stack>
        </CardContent>
      </Card>

      {loading && <Alert severity="info">ファームボードを読み込み中です...</Alert>}

      <Grid container columnSpacing={{ xs: 0, lg: 2 }} rowSpacing={2} alignItems="flex-start">
        <Grid item xs={12} lg={7}>
          <Card sx={{ border: 2, borderColor: 'primary.main', height: '100%' }}>
            <CardContent>
              <Stack spacing={2}>
                <Box>
                  <Typography variant="h5" fontWeight={900}>近日の対応</Typography>
                  <Typography color="text.secondary">これから対応する予定をまとめて表示します。</Typography>
                </Box>
                <Divider />
                {todayPlanIssues.map((message) => (
                  <Alert key={message} severity="warning">{message}</Alert>
                ))}
                {todayPlans.length === 0 && todayPlanIssues.length === 0 ? (
                  <Alert severity="success">今日から7日以内に対応する繁殖予定はありません。</Alert>
                ) : todayPlans.length > 0 ? (
                  <Stack spacing={1}>
                    {todayPlans.map((item) => (
                      <Card key={item.id} variant="outlined">
                        <CardActionArea component={RouterLink} to={item.to}>
                          <CardContent sx={{ py: 1.25, '&:last-child': { pb: 1.25 } }}>
                            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
                              <Chip size="small" color={statusColor(item.status)} label={item.status} />
                              <Chip size="small" variant="outlined" label="繁殖" />
                              <Typography fontWeight={900}>{item.date ? `${item.date}　` : ''}{item.label} →</Typography>
                              <Box sx={{ flexGrow: 1 }}>
                                <Typography>耳標 {item.earTag}　{item.animalName}</Typography>
                                {item.note && <Typography variant="body2" color="text.secondary">{item.note}</Typography>}
                              </Box>
                            </Stack>
                          </CardContent>
                        </CardActionArea>
                      </Card>
                    ))}
                  </Stack>
                ) : null}
                <Divider />
                <TodayTasks suppressedScheduleKeys={suppressedTodayScheduleKeys} />
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} lg={5}>
          <Card>
            <CardContent>
              <Stack spacing={1.5}>
                <Box>
                  <Typography variant="h5" fontWeight={900}>農場の現在状況</Typography>
                  <Typography color="text.secondary">現在の頭数と繁殖状況、今月の経営状況をまとめて確認します。</Typography>
                </Box>
                <Grid container spacing={1.5}>
                  <Grid item xs={6}>
                    <SummaryCard
                      label="繁殖牛"
                      to="/cattle"
                      ariaLabel="繁殖牛一覧を開く"
                      valueText={<Typography variant="h4" fontWeight={900}>{farmSummary.breedingCattle}<Typography component="span" variant="body1"> 頭</Typography></Typography>}
                    />
                  </Grid>
                  <Grid item xs={6}>
                    <SummaryCard
                      label="子牛"
                      to="/calves"
                      ariaLabel="子牛台帳を開く"
                      valueText={<Typography variant="h4" fontWeight={900}>{farmSummary.calves}<Typography component="span" variant="body1"> 頭</Typography></Typography>}
                    />
                  </Grid>
                  <Grid item xs={6}>
                    <SummaryCard
                      label="受胎中"
                      to="/breedings"
                      ariaLabel="繁殖管理を開く"
                      valueText={<Typography variant="h4" fontWeight={900}>{farmSummary.pregnant}<Typography component="span" variant="body1"> 頭</Typography></Typography>}
                    />
                  </Grid>
                  <Grid item xs={6}>
                    <SummaryCard
                      label="繁殖要対応牛"
                      to="/breedings"
                      ariaLabel="繁殖要対応牛を確認する"
                      valueText={<Typography variant="h4" fontWeight={900}>{farmSummary.attention}<Typography component="span" variant="body1"> 頭</Typography></Typography>}
                    />
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <SummaryCard
                      label="今月の売上"
                      to="/sales"
                      ariaLabel="売上一覧を開く"
                      valueText={<Typography variant="h5" fontWeight={900}>{yen(currentMonthBalance.sales)}</Typography>}
                    />
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <SummaryCard
                      label="今月の経費"
                      to="/expenses"
                      ariaLabel="経費一覧を開く"
                      valueText={<Typography variant="h5" fontWeight={900}>{yen(currentMonthBalance.expenses)}</Typography>}
                    />
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <SummaryCard
                      label="今月の差引収支"
                      to="/monthly-balance"
                      ariaLabel="月別収支を開く"
                      valueText={<Typography variant="h5" fontWeight={900}>{yen(currentMonthBalance.balance)}</Typography>}
                    />
                  </Grid>
                </Grid>
                <Button component={RouterLink} to="/monthly-balance" variant="outlined">月別収支を確認</Button>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} lg={7}>
          <Card>
            <CardContent sx={{ p: { xs: 1.5, sm: 2 }, '&:last-child': { pb: { xs: 1.5, sm: 2 } } }}>
              <Stack spacing={1}>
                <Typography variant="h6" fontWeight={900}>農場ストーリー</Typography>
                {story.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">表示できる記録はまだありません。</Typography>
                ) : (
                  <Stack divider={<Divider flexItem />}>
                    {story.slice(0, 3).map((item) => (
                      <CardActionArea key={item.id} onClick={() => setSelectedStory(item)} sx={{ borderRadius: 1 }}>
                        <Stack
                          direction={{ xs: 'column', sm: 'row' }}
                          spacing={{ xs: 0.25, sm: 1 }}
                          alignItems={{ sm: 'center' }}
                          sx={{ px: 1, py: 1 }}
                        >
                          <Typography variant="body2" fontWeight={800} color="text.secondary" sx={{ minWidth: 88 }}>
                            {item.date}
                          </Typography>
                          <Chip size="small" label={item.category} />
                          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                            <Typography fontWeight={800} noWrap>{item.title}</Typography>
                            <Typography variant="body2" color="text.secondary" noWrap>{item.detail}</Typography>
                          </Box>
                          <Typography variant="body2" color="primary" fontWeight={800}>開く →</Typography>
                        </Stack>
                      </CardActionArea>
                    ))}
                  </Stack>
                )}
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {isFreePlan && <Card sx={{ border: 2, borderColor: 'info.main', bgcolor: 'info.50' }}>
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
            <Button
              component={RouterLink}
              to="/past-data-entry"
              variant="outlined"
              size="large"
              fullWidth
              sx={{ minHeight: 52, fontWeight: 900 }}
            >
              過去データを入力する
            </Button>
          </Stack>
        </CardContent>
      </Card>}

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