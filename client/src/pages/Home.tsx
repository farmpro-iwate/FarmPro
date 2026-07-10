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

type AnyRow = Record<string, any>;

type StoryItem = {
  id: string;
  date: string;
  category: string;
  title: string;
  detail: string;
  animalKind?: 'cattle' | 'calf';
  animalId?: number;
  animalName?: string;
  earTag?: string;
};

type TodayItem = {
  id: string;
  date: string;
  label: string;
  animalName: string;
  earTag: string;
  status: '期限超過' | '今日' | '近日中';
  to: string;
};

async function fetchJson<T>(url: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(url);
    if (!res.ok) return fallback;
    return res.json();
  } catch {
    return fallback;
  }
}

function value(v: unknown) {
  if (v === null || v === undefined || v === '') return '-';
  return String(v);
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

function planStatus(date: string): TodayItem['status'] | null {
  const today = todayText();
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
  if (status === '今日') return 'warning';
  return 'info';
}

function StatCard({ title, count, note, to }: { title: string; count: number; note: string; to: string }) {
  return (
    <Card sx={{ height: '100%', border: 1, borderColor: 'divider' }}>
      <CardActionArea component={RouterLink} to={to} sx={{ height: '100%' }}>
        <CardContent sx={{ py: 2.25 }}>
          <Stack spacing={0.5}>
            <Typography color="text.secondary" fontWeight={800}>{title}</Typography>
            <Typography variant="h3" fontWeight={900} lineHeight={1.1}>
              {count}<Typography component="span" variant="h6" fontWeight={700}> 件</Typography>
            </Typography>
            <Typography color="text.secondary">{note}</Typography>
            <Typography color="primary" fontWeight={800} sx={{ pt: 0.5 }}>一覧を開く →</Typography>
          </Stack>
        </CardContent>
      </CardActionArea>
    </Card>
  );
}

export function Home() {
  const [cattle, setCattle] = useState<AnyRow[]>([]);
  const [calves, setCalves] = useState<AnyRow[]>([]);
  const [breedings, setBreedings] = useState<AnyRow[]>([]);
  const [calvings, setCalvings] = useState<AnyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStory, setSelectedStory] = useState<StoryItem | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [cattleData, calfData, breedingData, calvingData] = await Promise.all([
        fetchJson<AnyRow[]>('http://localhost:4000/api/cattle', []),
        fetchJson<AnyRow[]>('http://localhost:4000/api/calves', []),
        fetchJson<AnyRow[]>('http://localhost:4000/api/breedings', []),
        fetchJson<AnyRow[]>('http://localhost:4000/api/calvings', [])
      ]);
      setCattle(Array.isArray(cattleData) ? cattleData : []);
      setCalves(Array.isArray(calfData) ? calfData : []);
      setBreedings(Array.isArray(breedingData) ? breedingData : []);
      setCalvings(Array.isArray(calvingData) ? calvingData : []);
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
        category: '牛台帳',
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
        title: `${value(row.calfNumber)} ${value(row.name)}を登録`,
        detail: `母牛：${value(row.motherName)}　現在体重：${value(row.currentWeight)}kg`,
        animalKind: 'calf',
        animalId: row.id,
        animalName: row.name,
        earTag: row.calfNumber
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
      const candidates = [
        ['次回発情確認', row.nextHeatExpectedDate],
        ['妊娠鑑定', row.pregnancyCheckExpectedDate],
        ['再鑑定', row.recheckExpectedDate],
        ['分娩予定', row.expectedCalvingDate],
        ['移植予定', row.transferPlannedDate]
      ] as const;
      candidates.forEach(([label, rawDate]) => {
        const date = dateOnly(rawDate);
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

  const selectedAnimalStory = useMemo(() => {
    if (!selectedStory?.earTag) return [];
    return story.filter((item) => item.earTag === selectedStory.earTag);
  }, [selectedStory, story]);

  const detailLink = selectedStory?.animalId
    ? selectedStory.animalKind === 'calf'
      ? `/calves/${selectedStory.animalId}`
      : `/cattle/${selectedStory.animalId}`
    : selectedStory?.animalKind === 'calf' ? '/calves' : '/cattle';

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

      <Card sx={{ border: 2, borderColor: 'primary.main' }}>
        <CardContent>
          <Stack spacing={2}>
            <Box>
              <Typography variant="h5" fontWeight={900}>今日やること</Typography>
              <Typography color="text.secondary">繁殖予定、ワクチン、BLV検査、治療、休薬などをまとめて表示します。</Typography>
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
                          <Typography sx={{ flexGrow: 1 }}>耳標 {item.earTag}　{item.animalName}</Typography>
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

      <Grid container spacing={2}>
        <Grid item xs={12} sm={4}><StatCard title="牛台帳" count={cattle.length} note="母牛・育成牛" to="/cattle" /></Grid>
        <Grid item xs={12} sm={4}><StatCard title="子牛管理" count={calves.length} note="現在の子牛台帳" to="/calves" /></Grid>
        <Grid item xs={12} sm={4}><StatCard title="分娩記録" count={calvings.length} note="これまでの分娩記録" to="/calvings" /></Grid>
      </Grid>

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

      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Typography variant="h6" fontWeight={900}>すぐ登録</Typography>
            <Grid container spacing={1.5}>
              <Grid item xs={12} sm={6} md={3}><Button component={RouterLink} to="/calvings/new" variant="contained" fullWidth>分娩記録</Button></Grid>
              <Grid item xs={12} sm={6} md={3}><Button component={RouterLink} to="/breedings/new" variant="contained" fullWidth>発情・種付・移植</Button></Grid>
              <Grid item xs={12} sm={6} md={3}><Button component={RouterLink} to="/calves/new" variant="outlined" fullWidth>子牛登録</Button></Grid>
              <Grid item xs={12} sm={6} md={3}><Button component={RouterLink} to="/feedings/new" variant="outlined" fullWidth>飼料給与</Button></Grid>
            </Grid>
          </Stack>
        </CardContent>
      </Card>

      <Drawer anchor="right" open={Boolean(selectedStory)} onClose={() => setSelectedStory(null)}>
        <Box sx={{ width: { xs: 320, sm: 460 }, p: 2.5 }}>
          <Stack spacing={2}>
            <Box>
              <Typography variant="h5" fontWeight={900}>個体ストーリー</Typography>
              <Typography color="text.secondary">耳標 {value(selectedStory?.earTag)}　{value(selectedStory?.animalName)}</Typography>
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