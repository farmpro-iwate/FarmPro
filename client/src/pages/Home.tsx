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
  status: '期限超過' | '今日' | '近日中';
  to: string;
};

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
        getAllRecords<AnyRow>('cattle'),
        getAllRecords<AnyRow>('calves'),
        getAllRecords<AnyRow>('breedings'),
        getAllRecords<AnyRow>('calvings')
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

      {loading && <Alert severity="info">ファームボードを読み込み中です...</Alert>}

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
              <Grid item xs={12}>
                <Button
                  component={RouterLink}
                  to="/ai-activity-entry"
                  variant="outlined"
                  fullWidth
                  sx={{ minHeight: 52, borderWidth: 2, fontWeight: 800 }}
                >
                  AIで登録
                </Button>
              </Grid>
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
