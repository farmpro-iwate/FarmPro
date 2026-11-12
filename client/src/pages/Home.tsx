import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
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
import { HomeTaskSections, type HomeTaskItem } from '../components/HomeTaskSections';
import { HomeTaskCard } from '../components/HomeTaskCard';
import { FarmStoryDisplaySettings } from '../components/FarmStoryDisplaySettings';
import { medicationHistoryDetail, resolveTreatmentAnimal, treatmentHistoryEditPath } from '../components/TreatmentHistory';
import { getCattleList, pullNewerCattleRecordsFromCloud } from '../services/api';
import { getCalfList, getCalfListForHomeSummary } from '../services/calfApi';
import { displayedCalfStatus } from '../services/calfPromotionView';
import { getBreedingList, getBreedingListForHomeSummary } from '../services/breedingApi';
import { fetchCalvings } from '../services/calvingsApi';
import { getTreatmentList } from '../services/treatmentApi';
import { getVaccineList } from '../services/vaccineApi';
import { getSalesList } from '../services/salesApi';
import { pullNewerCalvingRecordsFromCloud } from '../services/calvingRecordSync';
import { getMonthlyBalance } from '../services/monthlyBalanceApi';
import { formatTemporaryCalfNumber, isTemporaryCalfNumber } from '../utils/temporaryCalfNumber';
import { getStoredAuthUser } from '../services/authClient';
import { getFarmSettings } from '../services/settingsApi';
import { withEtHeatBasedSchedule } from '../utils/breeding';
import { getCattlePlanSnapshot } from '../services/cattlePlanSnapshot';
import { cattlePlanDestination, localCattlePlanToday, planAnimalMatch, type CattlePlanSnapshot } from '../utils/cattleBreedingPlans';
import { isAnimalBreedingInactive, isAnimalDeceased } from '../utils/animalLifecycle';
import { homeTaskStatus, type HomeTaskStatus } from '../utils/homeTaskWindow';
import {
  FARM_STORY_CATEGORIES,
  farmStoryPreferenceKey,
  readFarmStoryCategories,
  saveFarmStoryCategories,
  type FarmStoryCategoryId,
  type FarmStoryPreferenceScope,
} from '../services/farmStoryDisplaySettings';
import { loadFarmStoryAdditionalRecords } from '../services/farmStoryAdditionalRecords';
import type { FarmStoryItem } from '../utils/farmStoryTypes';
import { findActivityAnimal } from '../utils/activityRecordAnimal';
import { ACTIVITY_RECORD_SYNC_STATUS_EVENT, getActivityRecords } from '../services/activityRecordsApi';

import { homeCattleBreedingPlans, homeBreedingAttentionCount } from '../utils/homeBreedingAttention';

type AnyRow = Record<string, any> & { id: string | number };

type StoryItem = FarmStoryItem;

function currentStoryPreferenceScope(): FarmStoryPreferenceScope {
  const user = getStoredAuthUser();
  return { farmId: String(user?.farmId || ''), userId: String(user?.id || '') };
}

function sameStoryPreferenceScope(a: FarmStoryPreferenceScope, b: FarmStoryPreferenceScope) {
  return a.farmId === b.farmId && a.userId === b.userId;
}

type TodayItem = {
  id: string;
  date: string;
  label: string;
  animalName: string;
  earTag: string;
  status: HomeTaskStatus;
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

function resultColor(result?: string) {
  if (result === '自然分娩' || result === '受胎') return 'success';
  if (result === '難産' || result === '再鑑定予定') return 'warning';
  if (result === '死産' || result === '空胎' || result === '流産・胎子喪失') return 'error';
  return 'default';
}

function statusColor(status: TodayItem['status']) {
  if (status === '期限超過') return 'error';
  if (['今日', '継続中', '発情未確認', '確認待ち'].includes(status)) return 'warning';
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
  const [preferenceScope, setPreferenceScope] = useState(currentStoryPreferenceScope);
  const recheckPreferenceScope = useCallback(() => {
    const next = currentStoryPreferenceScope();
    setPreferenceScope((previous) => sameStoryPreferenceScope(previous, next) ? previous : next);
  }, []);

  useEffect(() => {
    const visible = () => { if (document.visibilityState === 'visible') recheckPreferenceScope(); };
    window.addEventListener('storage', recheckPreferenceScope);
    window.addEventListener('focus', recheckPreferenceScope);
    document.addEventListener('visibilitychange', visible);
    return () => {
      window.removeEventListener('storage', recheckPreferenceScope);
      window.removeEventListener('focus', recheckPreferenceScope);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [recheckPreferenceScope]);

  return <HomeContent key={JSON.stringify(preferenceScope)} preferenceScope={preferenceScope} onContextChanged={recheckPreferenceScope} />;
}

function HomeContent({ preferenceScope, onContextChanged }: {
  preferenceScope: FarmStoryPreferenceScope;
  onContextChanged: () => void;
}) {
  const navigate = useNavigate();
  const authUser = getStoredAuthUser();
  const isFreePlan = authUser?.plan !== 'standard' && authUser?.plan !== 'pro';
  const [cattle, setCattle] = useState<AnyRow[]>([]);
  const [calves, setCalves] = useState<AnyRow[]>([]);
  const [breedings, setBreedings] = useState<AnyRow[]>([]);
  const [summaryCalves, setSummaryCalves] = useState<AnyRow[]>([]);
  const [summaryBreedings, setSummaryBreedings] = useState<AnyRow[]>([]);
  const [calvings, setCalvings] = useState<AnyRow[]>([]);
  const [treatments, setTreatments] = useState<AnyRow[]>([]);
  const [vaccines, setVaccines] = useState<AnyRow[]>([]);
  const [sales, setSales] = useState<AnyRow[]>([]);
  const [cattlePlanSnapshot, setCattlePlanSnapshot] = useState<CattlePlanSnapshot | null>(null);
  const [currentMonthBalance, setCurrentMonthBalance] = useState<CurrentMonthBalance>({ sales: 0, expenses: 0, balance: 0 });
  const [loading, setLoading] = useState(true);
  const [selectedStory, setSelectedStory] = useState<StoryItem | null>(null);
  const [visibleStoryCount, setVisibleStoryCount] = useState(40);
  const [storyCategories, setStoryCategories] = useState(() => readFarmStoryCategories(preferenceScope));
  const [storySettingsOpen, setStorySettingsOpen] = useState(false);
  const [additionalStoryItems, setAdditionalStoryItems] = useState<StoryItem[]>([]);
  const [failedStoryCategories, setFailedStoryCategories] = useState<FarmStoryCategoryId[]>([]);
  const [additionalStoryLoading, setAdditionalStoryLoading] = useState(false);
  const [additionalStoryError, setAdditionalStoryError] = useState('');
  const [storyRefresh, setStoryRefresh] = useState(0);

  const saveStoryCategories = (categories: FarmStoryCategoryId[]) => {
    if (!sameStoryPreferenceScope(preferenceScope, currentStoryPreferenceScope())) {
      onContextChanged();
      throw new Error('ログイン情報が変わりました。ホームを開き直して表示項目を選んでください。');
    }
    saveFarmStoryCategories(preferenceScope, categories);
    setStoryCategories(categories);
    setVisibleStoryCount(40);
    setSelectedStory(null);
    setStorySettingsOpen(false);
  };

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'hidden') return;
      if (!sameStoryPreferenceScope(preferenceScope, currentStoryPreferenceScope())) {
        onContextChanged();
        return;
      }
      setStoryRefresh((count) => count + 1);
    };
    const storage = (event: StorageEvent) => {
      if (!sameStoryPreferenceScope(preferenceScope, currentStoryPreferenceScope())) {
        onContextChanged();
        return;
      }
      if (event.key === null || event.key === farmStoryPreferenceKey(preferenceScope)) {
        setStoryCategories(readFarmStoryCategories(preferenceScope));
        setVisibleStoryCount(40);
        setSelectedStory(null);
        setStorySettingsOpen(false);
      }
    };
    window.addEventListener('focus', refresh);
    window.addEventListener('online', refresh);
    window.addEventListener('storage', storage);
    window.addEventListener(ACTIVITY_RECORD_SYNC_STATUS_EVENT, refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      window.removeEventListener('online', refresh);
      window.removeEventListener('storage', storage);
      window.removeEventListener(ACTIVITY_RECORD_SYNC_STATUS_EVENT, refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [preferenceScope, onContextChanged]);

  useEffect(() => {
    let active = true;
    setAdditionalStoryLoading(true);
    setAdditionalStoryError('');
    setFailedStoryCategories([]);
    setAdditionalStoryItems([]);
    const load = async () => {
      if (storyCategories.includes('farmWork') || storyCategories.includes('animalRecord')) {
        await getActivityRecords();
        if (!active) return null;
        if (!sameStoryPreferenceScope(preferenceScope, currentStoryPreferenceScope())) {
          onContextChanged();
          return null;
        }
      }
      return loadFarmStoryAdditionalRecords(storyCategories);
    };
    void load().then((result) => {
      if (!active) return;
      if (!result) return;
      if (!sameStoryPreferenceScope(preferenceScope, currentStoryPreferenceScope())) {
        onContextChanged();
        return;
      }
      setAdditionalStoryItems(result.items);
      setFailedStoryCategories(result.failedCategories);
    }).catch(() => {
      if (!active) return;
      if (!sameStoryPreferenceScope(preferenceScope, currentStoryPreferenceScope())) {
        onContextChanged();
        return;
      }
      setAdditionalStoryError('追加項目の記録を読み込めませんでした。');
    }).finally(() => {
      if (active) setAdditionalStoryLoading(false);
    });
    return () => { active = false; };
  }, [storyCategories, storyRefresh, preferenceScope, onContextChanged]);

  useEffect(() => {
    let active = true;
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
        cattlePlanData,
        treatmentData,
        vaccineData,
        salesData
      ] = await Promise.all([
        loadCattleForHome(),
        getCalfList(),
        getBreedingList(),
        getCalfListForHomeSummary(),
        getBreedingListForHomeSummary(),
        calvingDataPromise,
        getMonthlyBalance().catch(() => ({ rows: [], totals: null })),
        getFarmSettings().catch(() => null),
        cattlePlanDataPromise,
        getTreatmentList().catch(() => []),
        getVaccineList().catch(() => []),
        getSalesList().catch(() => [])
      ]);
      if (!active) return;
      if (!sameStoryPreferenceScope(preferenceScope, currentStoryPreferenceScope())) {
        onContextChanged();
        return;
      }
      setCattle(Array.isArray(cattleData) ? cattleData as AnyRow[] : []);
      setCalves(Array.isArray(calfData) ? calfData as AnyRow[] : []);
      const cycleDays = settingsData?.estrousCycleDays || 21;
      setBreedings(Array.isArray(breedingData) ? (breedingData as AnyRow[]).map((row) => withEtHeatBasedSchedule(row, cycleDays)) : []);
      setSummaryCalves(Array.isArray(summaryCalfData) ? summaryCalfData as AnyRow[] : []);
      setSummaryBreedings(Array.isArray(summaryBreedingData) ? (summaryBreedingData as AnyRow[]).map((row) => withEtHeatBasedSchedule(row, cycleDays)) : []);
      setCalvings(Array.isArray(calvingData) ? calvingData as AnyRow[] : []);
      setTreatments(Array.isArray(treatmentData) ? treatmentData as AnyRow[] : []);
      setVaccines(Array.isArray(vaccineData) ? vaccineData as AnyRow[] : []);
      setSales(Array.isArray(salesData) ? salesData as AnyRow[] : []);
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
    return () => { active = false; };
  }, [preferenceScope, onContextChanged]);

  const story = useMemo(() => {
    const items: StoryItem[] = [];

    cattle.forEach((row) => {
      items.push({
        id: `cattle-${row.id}`,
        date: dateOnly(row.createdAt || row.updatedAt || row.birthday),
        categoryId: 'cattle',
        category: '繁殖牛台帳',
        title: `${value(row.earTag)} ${value(row.name)}を登録`,
        detail: row.note ? `メモ：${row.note}` : '母牛・育成牛の個体情報',
        animalKind: 'cattle',
        animalId: row.id,
        animalName: row.name,
        earTag: row.earTag
      });
    });

    const localCalfForSummary = (row: AnyRow) => {
      const unique = (matches: AnyRow[]) => matches.length === 1 ? matches[0] : undefined;
      const syncRecordId = String(row.syncRecordId || '').trim();
      if (syncRecordId) {
        const matched = unique(calves.filter((calf) => String(calf.syncRecordId || '').trim() === syncRecordId));
        if (matched) return matched;
      }

      const identificationNumber = String(row.identificationNumber || '').trim();
      if (identificationNumber) {
        const matched = unique(calves.filter((calf) =>
          String(calf.identificationNumber || '').trim() === identificationNumber
        ));
        if (matched) return matched;
      }

      const calvingId = String(row.calvingId || '').trim();
      if (calvingId) {
        const matched = unique(calves.filter((calf) => String(calf.calvingId || '').trim() === calvingId));
        if (matched) return matched;
      }

      const number = String(row.calfNumber || row.earTag || '').trim();
      if (number) {
        const birthday = dateOnly(row.birthday || row.birthDate);
        const matched = unique(calves.filter((calf) => {
          const sameNumber = String(calf.calfNumber || calf.earTag || '').trim() === number;
          if (!sameNumber) return false;
          if (!number.startsWith('TEMP-')) return true;
          return !birthday || dateOnly(calf.birthday || calf.birthDate) === birthday;
        }));
        if (matched) return matched;
      }

      return undefined;
    };

    summaryCalves.forEach((row) => {
      const localCalf = localCalfForSummary(row);
      items.push({
        id: `calf-${row.id}`,
        date: dateOnly(row.createdAt || row.updatedAt || row.birthday),
        categoryId: 'calf',
        category: '子牛',
        title: `${formatTemporaryCalfNumber(row.calfNumber, row.birthday)} ${value(row.name)}を登録`,
        detail: `母牛：${value(row.motherName)}　現在体重：${row.currentWeight === null || row.currentWeight === undefined || row.currentWeight === '' || Number(row.currentWeight) <= 0 ? '未登録' : `${value(row.currentWeight)}kg`}`,
        animalKind: 'calf',
        animalId: localCalf?.id,
        animalName: row.name,
        earTag: row.calfNumber,
        birthday: row.birthday
      });
    });

    summaryBreedings.forEach((row) => {
      const method = row.breedingMethod && row.breedingMethod !== '未選択' ? row.breedingMethod : '繁殖管理';
      // 農場ストーリーは予定・更新日時ではなく、実際に行った作業の日付で並べる。
      const performedDate = method === '受精卵移植'
        ? dateOnly(row.transferDate || row.actualTransferDate)
        : dateOnly(row.inseminationDate);
      const confirmedHeatDate = row.breedingStatus === '発情確認' ? dateOnly(row.heatDate) : '';
      const eventDate = performedDate || confirmedHeatDate;
      if (!eventDate || eventDate > todayText()) return;
      const detailParts = [row.breedingStatus, row.pregnancyResult !== '未鑑定' ? row.pregnancyResult : '', row.transferCancelReason].filter(Boolean);
      const cattleMatch = cattle.find((animal) => String(animal.earTag) === String(row.cowEarTag));
      items.push({
        id: `breeding-${row.id}`,
        date: eventDate,
        categoryId: 'breeding',
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
      const cattleMatch = cattle.find((animal) =>
        (row.cowId || row.cattleId) && String(animal.id) === String(row.cowId || row.cattleId)
      ) || cattle.find((animal) => row.cowEarTag && String(animal.earTag) === String(row.cowEarTag));
      const motherLabel = row.cowEarTag || cattleMatch?.earTag || row.cowName || cattleMatch?.name || '母牛未登録';
      items.push({
        id: `calving-${row.id}`,
        date: dateOnly(row.actualCalvingDate || row.updatedAt || row.createdAt),
        categoryId: 'calving',
        category: '分娩',
        title: `${motherLabel}：分娩記録`,
        detail: `子牛：${value(row.calfName)}　結果：${value(row.calvingResult)}`,
        animalKind: 'cattle',
        animalId: cattleMatch?.id,
        animalName: row.cowName || cattleMatch?.name,
        earTag: row.cowEarTag || cattleMatch?.earTag
      });
    });

    // 農場全体の作業履歴は、実施済みかつ実施日がある記録のみ追加する。
    const animalLink = (number: unknown) => {
      const tag = String(number || '');
      const cow = cattle.find((animal) => tag && String(animal.earTag) === tag);
      if (cow) return { animalKind: 'cattle' as const, animalId: cow.id };
      const calf = calves.find((animal) => tag && String(animal.calfNumber || animal.earTag) === tag);
      if (calf) return { animalKind: 'calf' as const, animalId: calf.id, birthday: calf.birthday };
      return {};
    };

    treatments.forEach((row) => {
      const date = dateOnly(row.treatmentDate);
      if (!date || date > todayText()) return;
      const medication = row.recordType === '投薬';
      if (medication && (row.deletedAt || row.treatmentSyncDeletePending)) return;
      const matched = medication ? resolveTreatmentAnimal(row, { cattle, calves }) : null;
      items.push({
        id: `treatment-${row.id}`,
        date,
        categoryId: 'treatment',
        category: medication ? '投薬' : '治療',
        title: `${value(row.targetNumber)} ${value(row.targetName)}：${medication ? '投薬' : '治療'}`,
        detail: medication ? medicationHistoryDetail(row) : [row.diagnosis || row.symptom, row.progress].filter(Boolean).join('・') || '治療実施',
        ...(medication
          ? matched ? { animalKind: matched.kind, animalId: matched.animal.id, birthday: matched.animal.birthday } : {}
          : animalLink(row.targetNumber)),
        animalName: row.targetName,
        earTag: matched ? (matched.kind === 'calf' ? matched.animal.calfNumber : matched.animal.earTag) || row.targetNumber : row.targetNumber,
        ...(medication ? { sourcePath: treatmentHistoryEditPath(row, '/') } : {}),
      });
    });

    vaccines.forEach((row) => {
      const date = dateOnly(row.vaccinationDate);
      if (row.status !== '接種済み' || !date || date > todayText()) return;
      items.push({
        id: `vaccine-${row.id}`,
        date,
        categoryId: 'vaccine',
        category: '健康',
        title: `${value(row.targetNumber)} ${value(row.targetName)}：ワクチン`,
        detail: `${value(row.vaccineName)} 接種済み`,
        ...animalLink(row.targetNumber),
        animalName: row.targetName,
        earTag: row.targetNumber
      });
    });

    sales.forEach((row) => {
      if (!['出荷済み', '販売済み'].includes(row.status)) return;
      const date = dateOnly(row.status === '販売済み' ? (row.saleDate || row.shippingDate) : row.shippingDate);
      if (!date || date > todayText()) return;
      items.push({
        id: `sale-${row.id}`,
        date,
        categoryId: 'sale',
        category: '販売',
        title: `${value(row.targetNumber)} ${value(row.targetName)}：${row.status}`,
        detail: row.marketName || row.buyer || '出荷・販売',
        ...animalLink(row.targetNumber),
        animalName: row.targetName,
        earTag: row.targetNumber
      });
    });

    // Home summaries may use presentation-only IDs; animal routes require the local ledger IDs.
    const knownCalves = calves;
    const linkedAdditionalItems = additionalStoryItems.map<StoryItem>((item) => {
      if (item.categoryId === 'animalRecord') {
        const matched = findActivityAnimal(item.activityAnimal || {}, cattle, knownCalves);
        if (matched) return { ...item, animalKind: matched.kind, animalId: matched.animal.id };
        // A remote numeric ID or reused ear tag is never enough for a chart link.
        const { animalId: _id, ...unresolved } = item;
        return unresolved;
      }
      const tag = String(item.earTag || '').trim();
      const id = item.animalId === undefined ? '' : String(item.animalId);
      // A number identifies the animal across ledgers; never turn a calf's name into a number.
      const cow = item.animalKind !== 'calf' ? cattle.find((row) => tag
        ? String(row.earTag || '').trim() === tag : item.animalKind === 'cattle' && id && String(row.id) === id) : undefined;
      const calf = item.animalKind !== 'cattle' ? knownCalves.find((row) => tag
        ? String(row.calfNumber || row.earTag || '').trim() === tag : item.animalKind === 'calf' && id && String(row.id) === id) : undefined;
      if (cow) return { ...item, animalKind: 'cattle' as const, animalId: cow.id,
        animalName: item.animalName || cow.name, earTag: tag || cow.earTag };
      if (calf) return { ...item, animalKind: 'calf' as const, animalId: calf.id,
        animalName: item.animalName || calf.name, earTag: tag || calf.calfNumber || calf.earTag,
        birthday: item.birthday || calf.birthday };
      // Unresolved business references still open their source record, never a guessed animal.
      const { animalId: _animalId, animalKind: _animalKind, ...unresolved } = item;
      return unresolved;
    });
    const selected = new Set(storyCategories);
    return [...items, ...linkedAdditionalItems]
      .filter((item) => item.date && selected.has(item.categoryId))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [cattle, calves, summaryCalves, summaryBreedings, calvings, treatments, vaccines, sales, additionalStoryItems, storyCategories]);

  const homeBreedingPlans = useMemo(() => {
    const plans: TodayItem[] = [];
    const issues: string[] = [];
    if (!cattlePlanSnapshot) return { plans, issues, attention: 0 };

    const today = localCattlePlanToday();
    const groups = homeCattleBreedingPlans(cattle, cattlePlanSnapshot, today);
    groups.forEach(({ animal, plans: animalPlans, issues: animalIssues }) => {
      animalIssues.forEach((message) => {
        const prefix = `耳標 ${value(animal.earTag)}　${value(animal.name)}：`;
        const text = `${prefix}${message}`;
        if (!issues.includes(text)) issues.push(text);
      });

      animalPlans.forEach((item) => {
        const status: TodayItem['status'] = item.date === null
          ? '継続中' : homeTaskStatus(item.date, today, item.title)!;
        const destination = cattlePlanDestination(item, animal, '/');
        plans.push({
          id: `${animal.id}-${item.sourceRecordId || 'post-calving'}-${item.kind}-${item.date || item.relatedDate || ''}`,
          date: item.date || '',
          label: item.title,
          animalName: value(animal.name),
          earTag: value(animal.earTag),
          status,
          to: destination.to,
          note: [item.note, item.date && item.dateSource === 'calculated' ? '計算予定日（保存値は変更しません）' : item.date && item.dateSource === 'stored' ? '保存済み予定日' : '', item.kind === 'feed-review' && item.relatedDate ? `分娩予定日：${item.relatedDate}` : ''].filter(Boolean).join(' ')
        });
      });
    });

    plans.sort((a, b) => {
      if (!a.date && b.date) return 1;
      if (a.date && !b.date) return -1;
      return a.date.localeCompare(b.date);
    });
    return { plans, issues, attention: homeBreedingAttentionCount(groups) };
  }, [cattle, cattlePlanSnapshot]);

  const todayPlans = homeBreedingPlans.plans;
  const todayPlanIssues = homeBreedingPlans.issues;

  const suppressedTodayScheduleKeys = useMemo(() => {
    const keys = new Set<string>();
    const aliasesByLabel: Record<string, string[]> = {
      '発情予定日': ['発情確認', '次回発情確認', '分娩後の発情確認', '発情予定日'],
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
    const sold = (animal: AnyRow) => sales.some(sale => sale.status === '販売済み' && sale.targetType === '成牛' &&
      !sale.deletedAt && planAnimalMatch(sale, animal) === 'match');
    const residentCattle = cattle.filter(animal => !isAnimalDeceased(animal) && !sold(animal));
    const breedingEligible = residentCattle.filter(animal => !isAnimalBreedingInactive(animal));
    const breedingInactive = cattle.filter(animal => isAnimalBreedingInactive(animal) || sold(animal));

    summaryBreedings.forEach((row) => {
      if (breedingInactive.some(animal => planAnimalMatch(row, animal) === 'match')) return;
      const pregnancyResult = String(row.pregnancyResult || '未鑑定');
      const breedingStatus = String(row.breedingStatus || '');
      const isCalved = breedingStatus === '分娩済み';
      const isPregnant = ['受胎', '妊娠'].includes(pregnancyResult);
      const cowKey = String(row.cowEarTag || row.cowName || row.id);

      if (!isCalved && isPregnant) pregnantCows.add(cowKey);
      if (isCalved) return;

    });

    return {
      breedingCattle: breedingEligible.filter((row) => row.stage !== '育成牛').length,
      growingCattle: breedingEligible.filter((row) => row.stage === '育成牛').length,
      culledCattle: residentCattle.filter(animal => isAnimalBreedingInactive(animal)).length,
      calves: summaryCalves.filter((row) =>
        !isAnimalDeceased(row) && !['牛台帳へ移行済み', '販売済み'].includes(displayedCalfStatus(row as Parameters<typeof displayedCalfStatus>[0], cattle as Parameters<typeof displayedCalfStatus>[1]))
      ).length,
      pregnant: pregnantCows.size,
      attention: homeBreedingPlans.attention,
    };
  }, [cattle, summaryCalves, summaryBreedings, homeBreedingPlans.attention, sales]);

  const openStoryItem = useCallback((item: StoryItem) => {
    const hasAnimalId = item.animalId !== undefined && item.animalId !== null && String(item.animalId) !== '';
    if (item.animalKind && hasAnimalId) {
      navigate(item.animalKind === 'calf' ? `/calves/${item.animalId}` : `/cattle/${item.animalId}`);
      return;
    }
    setSelectedStory(item);
  }, [navigate]);

  const selectedAnimalStory = useMemo(() => {
    if (!selectedStory?.earTag) return [];
    return story.filter((item) => {
      if (item.id === selectedStory.id) return true;
      if (item.categoryId === 'animalRecord' || selectedStory.categoryId === 'animalRecord' ||
          item.category === '投薬' || selectedStory.category === '投薬') {
        return item.animalId !== undefined && selectedStory.animalId !== undefined &&
          item.animalKind === selectedStory.animalKind && String(item.animalId) === String(selectedStory.animalId);
      }
      return item.earTag === selectedStory.earTag;
    });
  }, [selectedStory, story]);
  const selectedStoryItems = selectedStory?.earTag
    ? selectedAnimalStory : selectedStory ? [selectedStory] : [];

  const hasSelectedAnimalId = selectedStory?.animalId !== undefined && selectedStory?.animalId !== null && String(selectedStory.animalId) !== '';
  const canOpenAnimal = selectedStory?.sourcePath ? Boolean(selectedStory.animalKind && hasSelectedAnimalId) : Boolean(selectedStory?.earTag);
  const detailLink = hasSelectedAnimalId
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

  const breedingTaskItems: HomeTaskItem[] = todayPlans.map((item) => ({
    id: `breeding-${item.id}`,
    status: item.status,
    plannedDate: item.date,
    content: (
      <HomeTaskCard
        key={item.id}
        to={item.to}
        status={item.status}
        statusColor={statusColor(item.status)}
        category="繁殖"
        date={item.date}
        title={item.label}
        detail={`耳標 ${item.earTag}　${item.animalName}`}
        note={item.note}
      />
    ),
  }));

  return (
    <Stack spacing={2}>
      <Card sx={{ overflow: 'hidden' }}>
        <CardContent sx={{ p: { xs: 2, md: 2 }, '&:last-child': { pb: { xs: 2, md: 2 } } }}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={{ xs: 0.25, md: 2 }} alignItems={{ md: 'center' }}>
            <Typography component="h1" variant="h5" fontWeight={900}>ホーム</Typography>
            <Typography color="text.secondary" fontWeight={700}>{formatToday()}</Typography>
            <Typography color="text.secondary" sx={{ ml: { md: 'auto !important' } }}>予定と農場の状況を確認できます。</Typography>
          </Stack>
        </CardContent>
      </Card>

      {loading && <Alert severity="info">ホームを読み込み中です...</Alert>}

      {!loading && cattle.length === 0 && summaryCalves.length === 0 && (
        <Card component="section" aria-label="牛の登録" variant="outlined">
          <CardContent sx={{ p: { xs: 1.5, sm: 2 }, '&:last-child': { pb: { xs: 1.5, sm: 2 } } }}>
            <Stack spacing={1}>
              <Typography variant="h6" fontWeight={800}>牛を登録する</Typography>
              <Typography color="text.secondary">初めて使う方は、牛1頭の登録から始められます。</Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <Button component={RouterLink} to="/cattle/new" variant="contained" size="large" sx={{ minHeight: 48, fontWeight: 800 }}>
                  繁殖牛・育成牛を登録
                </Button>
                <Button component={RouterLink} to="/calves/new" variant="outlined" size="large" sx={{ minHeight: 48, fontWeight: 800 }}>
                  子牛を登録
                </Button>
              </Stack>
              <Button component={RouterLink} to="/help" sx={{ alignSelf: 'flex-start', minHeight: 44 }}>
                使い方を見る
              </Button>
            </Stack>
          </CardContent>
        </Card>
      )}

      <Grid container spacing={2} alignItems="stretch">
        <Grid item xs={12}>
          <Card sx={{ border: 2, borderColor: 'primary.main', height: '100%' }}>
            <CardContent>
              <Stack spacing={2}>
                <Box>
                  <Typography variant="h5" fontWeight={900}>予定</Typography>
                  <Typography color="text.secondary">今日から近日中に対応する作業を、優先順に確認します。ETの予定は発情日が基準です。</Typography>
                </Box>
                <Divider />
                <TodayTasks
                  suppressedScheduleKeys={suppressedTodayScheduleKeys}
                  renderItems={(items, taskLoading, taskIssues) => (
                    <HomeTaskSections
                      items={[...breedingTaskItems, ...items]}
                      today={todayText()}
                      loading={loading || taskLoading}
                      issues={[...todayPlanIssues, ...taskIssues]}
                    />
                  )}
                />
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={4}>
          <Card sx={{ border: 2, borderColor: farmSummary.attention > 0 ? 'warning.main' : 'divider', height: '100%' }}>
            <CardContent>
              <Stack spacing={1.5}>
                <Box>
                  <Typography variant="h5" fontWeight={900}>注意牛</Typography>
                  <Typography color="text.secondary">確認が必要な牛を見逃さないための入口です。</Typography>
                </Box>
                <SummaryCard
                  label="繁殖要対応牛"
                  to="/alerts?scope=breeding"
                  ariaLabel="繁殖要対応牛を確認する"
                  valueText={<Typography variant="h4" fontWeight={900}>{farmSummary.attention}<Typography component="span" variant="body1"> 頭</Typography></Typography>}
                />
                <Button component={RouterLink} to="/alerts?scope=breeding" variant="outlined">注意牛を確認</Button>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={4}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Stack spacing={1.5}>
                <Box>
                  <Typography variant="h5" fontWeight={900}>繁殖</Typography>
                  <Typography color="text.secondary">飼養頭数と受胎状況を確認します。</Typography>
                </Box>
                <Grid container spacing={1.5}>
                  <Grid item xs={6}>
                    <SummaryCard label="繁殖牛" to="/cattle" ariaLabel="繁殖牛一覧を開く"
                      valueText={<Typography variant="h4" fontWeight={900}>{farmSummary.breedingCattle}<Typography component="span" variant="body1"> 頭</Typography></Typography>} />
                  </Grid>
                  <Grid item xs={6}>
                    <SummaryCard label="育成牛" to="/cattle/growing" ariaLabel="育成牛一覧を開く"
                      valueText={<Typography variant="h4" fontWeight={900}>{farmSummary.growingCattle}<Typography component="span" variant="body1"> 頭</Typography></Typography>} />
                  </Grid>
                  <Grid item xs={6}>
                    <SummaryCard label="子牛" to="/calves" ariaLabel="子牛台帳を開く"
                      valueText={<Typography variant="h4" fontWeight={900}>{farmSummary.calves}<Typography component="span" variant="body1"> 頭</Typography></Typography>} />
                  </Grid>
                  <Grid item xs={6}>
                    <SummaryCard label="受胎中" to="/breedings" ariaLabel="繁殖管理を開く"
                      valueText={<Typography variant="h4" fontWeight={900}>{farmSummary.pregnant}<Typography component="span" variant="body1"> 頭</Typography></Typography>} />
                  </Grid>
                </Grid>
                <Button component={RouterLink} to="/breedings" variant="outlined">繁殖管理を確認</Button>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={4}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Stack spacing={1.5}>
                <Box>
                  <Typography variant="h5" fontWeight={900}>経営</Typography>
                  <Typography color="text.secondary">今月の売上・経費・差引収支を確認します。</Typography>
                </Box>
                <Grid container spacing={1.5}>
                  <Grid item xs={12}>
                    <SummaryCard label="今月の売上" to="/sales" ariaLabel="売上一覧を開く"
                      valueText={<Typography variant="h5" fontWeight={900}>{yen(currentMonthBalance.sales)}</Typography>} />
                  </Grid>
                  <Grid item xs={12}>
                    <SummaryCard label="今月の経費" to="/expenses" ariaLabel="経費一覧を開く"
                      valueText={<Typography variant="h5" fontWeight={900}>{yen(currentMonthBalance.expenses)}</Typography>} />
                  </Grid>
                  <Grid item xs={12}>
                    <SummaryCard label="今月の差引収支" to="/monthly-balance" ariaLabel="月別収支を開く"
                      valueText={<Typography variant="h5" fontWeight={900}>{yen(currentMonthBalance.balance)}</Typography>} />
                  </Grid>
                </Grid>
                <Button component={RouterLink} to="/monthly-balance" variant="outlined">月別収支を確認</Button>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12}>
          <Card component="section" aria-label="農場ストーリー">
            <CardContent sx={{ p: { xs: 1.5, sm: 2 }, '&:last-child': { pb: { xs: 1.5, sm: 2 } } }}>
              <Stack spacing={1}>
                <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
                  <Typography variant="h6" fontWeight={900}>農場ストーリー</Typography>
                  <Button size="small" variant="outlined" sx={{ minHeight: 44, flexShrink: 0 }} onClick={() => setStorySettingsOpen(true)}>
                    表示設定
                  </Button>
                </Stack>
                {(failedStoryCategories.length > 0 || additionalStoryError) && (
                  <Alert severity="warning">
                    <Stack spacing={1} alignItems="flex-start">
                      <Typography variant="body2">
                        {additionalStoryError || `${failedStoryCategories.map((id) => FARM_STORY_CATEGORIES.find((item) => item.id === id)?.label || id).join('・')}の記録を読み込めませんでした。`}
                      </Typography>
                      <Button size="small" disabled={additionalStoryLoading} onClick={() => setStoryRefresh((count) => count + 1)}>再読み込み</Button>
                    </Stack>
                  </Alert>
                )}
                {additionalStoryLoading && storyCategories.some((id) => !FARM_STORY_CATEGORIES.find((item) => item.id === id)?.defaultEnabled) && (
                  <Typography variant="body2" color="text.secondary">選択した項目を読み込み中です...</Typography>
                )}
                {storyCategories.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">表示する項目を選んでください。</Typography>
                ) : story.length === 0 ? (
                  loading || additionalStoryLoading
                    ? <Typography variant="body2" color="text.secondary">記録を読み込み中です...</Typography>
                    : failedStoryCategories.length > 0 || additionalStoryError ? null
                      : <Typography variant="body2" color="text.secondary">選択した項目に表示できる記録はまだありません。</Typography>
                ) : (
                  <Stack divider={<Divider flexItem />}>
                    {story.slice(0, visibleStoryCount).map((item) => (
                      <CardActionArea key={item.id} onClick={() => openStoryItem(item)} sx={{ borderRadius: 1 }}>
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
                          <Typography variant="body2" color="primary" fontWeight={800}>
                            {item.animalKind && item.animalId !== undefined && item.animalId !== null && String(item.animalId) !== ''
                              ? '個体カルテを開く →'
                              : '開く →'}
                          </Typography>
                        </Stack>
                      </CardActionArea>
                    ))}
                    {visibleStoryCount < story.length && (
                      <Button size="small" onClick={() => setVisibleStoryCount((count) => Math.min(count + 40, story.length))}>
                        続きを表示（{Math.min(visibleStoryCount, story.length)} / {story.length}件）
                      </Button>
                    )}
                  </Stack>
                )}
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <FarmStoryDisplaySettings
        open={storySettingsOpen}
        selected={storyCategories}
        onClose={() => setStorySettingsOpen(false)}
        onSave={saveStoryCategories}
      />

      {isFreePlan && (
        <Box component="section" aria-label="無料プランの保存について" sx={{ px: 1.5, py: 1, bgcolor: 'action.hover', borderRadius: 1 }}>
          <Typography variant="body2" color="text.secondary">
            無料プランの記録は、この端末・ブラウザーに保存されます。定期的にバックアップを保存してください。
          </Typography>
          <Stack direction="row" spacing={1}>
            <Button component={RouterLink} to="/backups" sx={{ minHeight: 44 }}>バックアップ</Button>
            <Button component={RouterLink} to="/help" sx={{ minHeight: 44 }}>使い方</Button>
          </Stack>
        </Box>
      )}

      <Drawer anchor="right" open={Boolean(selectedStory)} onClose={() => setSelectedStory(null)}>
        <Box sx={{ width: { xs: 320, sm: 460 }, p: 2.5 }}>
          <Stack spacing={2}>
            <Box>
              <Typography variant="h5" fontWeight={900}>{selectedStory?.earTag ? '個体ストーリー' : '記録の詳細'}</Typography>
              {selectedStory?.earTag && <Typography color="text.secondary">{selectedStoryNumberLabel} {selectedStoryNumber}　{value(selectedStory?.animalName)}</Typography>}
            </Box>
            <Divider />
            {selectedStoryItems.map((item) => (
              <Card key={item.id} variant="outlined">
                <CardContent sx={{ py: 1.25, '&:last-child': { pb: 1.25 } }}>
                  <Typography fontWeight={900}>{item.date}　{item.category}</Typography>
                  <Typography>{item.title}</Typography>
                  <Typography color="text.secondary">{item.detail}</Typography>
                  {item.category === '分娩' && <Chip sx={{ mt: 1 }} size="small" color={resultColor(item.detail.split('結果：')[1]) as any} label="分娩記録" />}
                </CardContent>
              </Card>
            ))}
            {selectedStory?.sourcePath && <Button component={RouterLink} to={selectedStory.sourcePath} variant="contained" size="large">
              元の記録を開く
            </Button>}
            {canOpenAnimal && <Button component={RouterLink} to={detailLink} variant={selectedStory?.sourcePath ? 'outlined' : 'contained'} size="large">
              個体カルテを開く
            </Button>}
            <Button variant="outlined" onClick={() => setSelectedStory(null)}>閉じる</Button>
          </Stack>
        </Box>
      </Drawer>
    </Stack>
  );
}

export default Home;
