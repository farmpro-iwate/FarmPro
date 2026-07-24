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
};

type TodayItem = {
  id: string;
  date: string;
  label: string;
  animalName: string;
  earTag: string;
  status: '譛滄剞雜・℃' | '莉頑律' | '霑第律荳ｭ';
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
  if (date < today) return '譛滄剞雜・℃';
  if (date === today) return '莉頑律';
  if (date <= addDays(today, 7)) return '霑第律荳ｭ';
  return null;
}

function resultColor(result?: string) {
  if (result === '閾ｪ辟ｶ蛻・ｨｩ' || result === '蜿苓ヮ') return 'success';
  if (result === '髮｣逕｣' || result === '蜀埼荘螳壻ｺ亥ｮ・) return 'warning';
  if (result === '豁ｻ逕｣' || result === '遨ｺ閭・ || result === '豬∫肇繝ｻ閭主ｭ仙蓑螟ｱ') return 'error';
  return 'default';
}

function statusColor(status: TodayItem['status']) {
  if (status === '譛滄剞雜・℃') return 'error';
  if (status === '莉頑律') return 'warning';
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
              {count}<Typography component="span" variant="h6" fontWeight={700}> 莉ｶ</Typography>
            </Typography>
            <Typography color="text.secondary">{note}</Typography>
            <Typography color="primary" fontWeight={800} sx={{ pt: 0.5 }}>荳隕ｧ繧帝幕縺・竊・/Typography>
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
        fetchJson<AnyRow[]>('/api/cattle', []),
        fetchJson<AnyRow[]>('/api/calves', []),
        fetchJson<AnyRow[]>('/api/breedings', []),
        fetchJson<AnyRow[]>('/api/calvings', [])
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
        category: '迚帛床蟶ｳ',
        title: `${value(row.earTag)} ${value(row.name)}繧堤匳骭ｲ`,
        detail: row.note ? `繝｡繝｢・・{row.note}` : '豈咲央繝ｻ閧ｲ謌千央縺ｮ蛟倶ｽ捺ュ蝣ｱ',
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
        category: '蟄千央',
        title: `${value(row.calfNumber)} ${value(row.name)}繧堤匳骭ｲ`,
        detail: `豈咲央・・{value(row.motherName)}縲迴ｾ蝨ｨ菴馴㍾・・{value(row.currentWeight)}kg`,
        animalKind: 'calf',
        animalId: row.id,
        animalName: row.name,
        earTag: row.calfNumber
      });
    });

    breedings.forEach((row) => {
      const method = row.breedingMethod && row.breedingMethod !== '譛ｪ驕ｸ謚・ ? row.breedingMethod : '郢∵ｮ也ｮ｡逅・;
      const detailParts = [row.breedingStatus, row.pregnancyResult !== '譛ｪ髑大ｮ・ ? row.pregnancyResult : '', row.transferCancelReason].filter(Boolean);
      const cattleMatch = cattle.find((animal) => String(animal.earTag) === String(row.cowEarTag));
      items.push({
        id: `breeding-${row.id}`,
        date: dateOnly(row.updatedAt || row.createdAt || row.inseminationDate || row.transferDate || row.heatDate),
        category: '郢∵ｮ・,
        title: `${value(row.cowEarTag)} ${value(row.cowName)}・・{method}`,
        detail: detailParts.join('繝ｻ') || '郢∵ｮ冶ｨ倬鹸繧呈峩譁ｰ',
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
        category: '蛻・ｨｩ',
        title: `${value(row.cowEarTag || row.cowName)}・壼・螽ｩ險倬鹸`,
        detail: `蟄千央・・{value(row.calfName)}縲邨先棡・・{value(row.calvingResult)}`,
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
        ['谺｡蝗樒匱諠・｢ｺ隱・, row.nextHeatExpectedDate],
        ['螯雁ｨ髑大ｮ・, row.pregnancyCheckExpectedDate],
        ['蜀埼荘螳・, row.recheckExpectedDate],
        ['蛻・ｨｩ莠亥ｮ・, row.expectedCalvingDate],
        ['遘ｻ讀堺ｺ亥ｮ・, row.transferPlannedDate]
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
            <Typography variant="h4" fontWeight={900}>FarmPro 繝輔ぃ繝ｼ繝繝懊・繝・/Typography>
            <Typography color="text.secondary">莉頑律繧・ｋ縺薙→縺ｨ縲∬ｾｲ蝣ｴ縺ｧ險倬鹸縺励◆蜃ｺ譚･莠九ｒ荳逕ｻ髱｢縺ｧ遒ｺ隱阪＠縺ｾ縺吶・/Typography>
          </Box>
        </CardContent>
      </Card>

      {loading && <Alert severity="info">繝輔ぃ繝ｼ繝繝懊・繝峨ｒ隱ｭ縺ｿ霎ｼ縺ｿ荳ｭ縺ｧ縺・..</Alert>}

      <Card sx={{ border: 2, borderColor: 'primary.main' }}>
        <CardContent>
          <Stack spacing={2}>
            <Box>
              <Typography variant="h5" fontWeight={900}>莉頑律繧・ｋ縺薙→</Typography>
              <Typography color="text.secondary">郢∵ｮ紋ｺ亥ｮ壹√Ρ繧ｯ繝√Φ縲。LV讀懈渊縲∵ｲｻ逋ゅ∽ｼ題脈縺ｪ縺ｩ繧偵∪縺ｨ繧√※陦ｨ遉ｺ縺励∪縺吶・/Typography>
            </Box>
            <Divider />
            {todayPlans.length === 0 ? (
              <Alert severity="success">莉頑律縺九ｉ7譌･莉･蜀・↓蟇ｾ蠢懊☆繧狗ｹ∵ｮ紋ｺ亥ｮ壹・縺ゅｊ縺ｾ縺帙ｓ縲・/Alert>
            ) : (
              <Stack spacing={1}>
                {todayPlans.map((item) => (
                  <Card key={item.id} variant="outlined">
                    <CardActionArea component={RouterLink} to={item.to}>
                      <CardContent sx={{ py: 1.25, '&:last-child': { pb: 1.25 } }}>
                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
                          <Chip size="small" color={statusColor(item.status)} label={item.status} />
                          <Chip size="small" variant="outlined" label="郢∵ｮ・ />
                          <Typography fontWeight={900}>{item.date}縲{item.label}</Typography>
                          <Typography sx={{ flexGrow: 1 }}>閠ｳ讓・{item.earTag}縲{item.animalName}</Typography>
                          <Typography color="primary" fontWeight={800}>險倬鹸繧帝幕縺・竊・/Typography>
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
        <Grid item xs={12} sm={4}><StatCard title="迚帛床蟶ｳ" count={cattle.length} note="豈咲央繝ｻ閧ｲ謌千央" to="/cattle" /></Grid>
        <Grid item xs={12} sm={4}><StatCard title="蟄千央邂｡逅・ count={calves.length} note="迴ｾ蝨ｨ縺ｮ蟄千央蜿ｰ蟶ｳ" to="/calves" /></Grid>
        <Grid item xs={12} sm={4}><StatCard title="蛻・ｨｩ險倬鹸" count={calvings.length} note="縺薙ｌ縺ｾ縺ｧ縺ｮ蛻・ｨｩ險倬鹸" to="/calvings" /></Grid>
      </Grid>

      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Box>
              <Typography variant="h5" fontWeight={900}>霎ｲ蝣ｴ繧ｹ繝医・繝ｪ繝ｼ</Typography>
              <Typography color="text.secondary">霎ｲ蝣ｴ縺ｧ險倬鹸縺励◆蜃ｺ譚･莠九ｒ譁ｰ縺励＞鬆・↓陦ｨ遉ｺ縺励∪縺吶りｨ倬鹸繧呈款縺吶→縲√◎縺ｮ迚帙・蛟倶ｽ薙せ繝医・繝ｪ繝ｼ繧堤｢ｺ隱阪〒縺阪∪縺吶・/Typography>
            </Box>
            <Divider />
            {story.length === 0 ? (
              <Typography color="text.secondary">陦ｨ遉ｺ縺ｧ縺阪ｋ險倬鹸縺ｯ縺ｾ縺縺ゅｊ縺ｾ縺帙ｓ縲・/Typography>
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
                          <Typography color="primary" fontWeight={800}>蛟倶ｽ薙せ繝医・繝ｪ繝ｼ繧定ｦ九ｋ 竊・/Typography>
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
            <Typography variant="h6" fontWeight={900}>縺吶＄逋ｻ骭ｲ</Typography>
            <Grid container spacing={1.5}>
              <Grid item xs={12} sm={6} md={3}><Button component={RouterLink} to="/calvings/new" variant="contained" fullWidth>蛻・ｨｩ險倬鹸</Button></Grid>
              <Grid item xs={12} sm={6} md={3}><Button component={RouterLink} to="/breedings/new" variant="contained" fullWidth>逋ｺ諠・・遞ｮ莉倥・遘ｻ讀・/Button></Grid>
              <Grid item xs={12} sm={6} md={3}><Button component={RouterLink} to="/calves/new" variant="outlined" fullWidth>蟄千央逋ｻ骭ｲ</Button></Grid>
              <Grid item xs={12} sm={6} md={3}><Button component={RouterLink} to="/feedings/new" variant="outlined" fullWidth>鬟ｼ譁咏ｵｦ荳・/Button></Grid>
            </Grid>
          </Stack>
        </CardContent>
      </Card>

      <Drawer anchor="right" open={Boolean(selectedStory)} onClose={() => setSelectedStory(null)}>
        <Box sx={{ width: { xs: 320, sm: 460 }, p: 2.5 }}>
          <Stack spacing={2}>
            <Box>
              <Typography variant="h5" fontWeight={900}>蛟倶ｽ薙せ繝医・繝ｪ繝ｼ</Typography>
              <Typography color="text.secondary">閠ｳ讓・{value(selectedStory?.earTag)}縲{value(selectedStory?.animalName)}</Typography>
            </Box>
            <Divider />
            {selectedAnimalStory.map((item) => (
              <Card key={item.id} variant="outlined">
                <CardContent sx={{ py: 1.25, '&:last-child': { pb: 1.25 } }}>
                  <Typography fontWeight={900}>{item.date}縲{item.category}</Typography>
                  <Typography>{item.title}</Typography>
                  <Typography color="text.secondary">{item.detail}</Typography>
                  {item.category === '蛻・ｨｩ' && <Chip sx={{ mt: 1 }} size="small" color={resultColor(item.detail.split('邨先棡・・)[1]) as any} label="蛻・ｨｩ險倬鹸" />}
                </CardContent>
              </Card>
            ))}
            <Button component={RouterLink} to={detailLink} variant="contained" size="large">
              蛟倶ｽ薙き繝ｫ繝・ｒ髢九￥
            </Button>
            <Button variant="outlined" onClick={() => setSelectedStory(null)}>髢峨§繧・/Button>
          </Stack>
        </Box>
      </Drawer>
    </Stack>
  );
}

export default Home;
