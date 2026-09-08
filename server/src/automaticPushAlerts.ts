import fs from 'node:fs/promises';
import path from 'node:path';
import { runWithFarm } from './farmContext';
import { listSchedules } from './scheduleStore';
import { listBreedings } from './breedingStore';
import { listVaccines } from './vaccineStore';
import { listTreatments } from './treatmentStore';
import { getAlertSettingsFromCloud } from './alertSettingsStore';
import { getSubscribedFarmIds, sendPushToFarm } from './routes/pushNotifications';

type DeliveryState = Record<string, string>;

type AlertItem = {
  id: string;
  title: string;
  target?: string;
  days?: number | null;
  level: 'danger' | 'warning' | 'info';
};

const dataDir = process.env.FARMPRO_DATA_DIR?.trim() || path.resolve(process.cwd(), 'data');
const deliveryFile = path.join(dataDir, 'push-alert-delivery.json');

function jstNow() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(now);

  const value = (type: string) => parts.find((part) => part.type === type)?.value || '';
  return {
    date: `${value('year')}-${value('month')}-${value('day')}`,
    hour: Number(value('hour')),
  };
}

function daysUntil(dateString?: string) {
  if (!dateString) return null;
  const target = new Date(`${dateString}T00:00:00+09:00`);
  if (Number.isNaN(target.getTime())) return null;
  const todayString = jstNow().date;
  const today = new Date(`${todayString}T00:00:00+09:00`);
  return Math.floor((target.getTime() - today.getTime()) / 86400000);
}

function validDate(value: unknown): value is string {
  if (!value) return false;
  return !Number.isNaN(new Date(String(value)).getTime());
}

async function readDeliveryState(): Promise<DeliveryState> {
  try {
    const raw = await fs.readFile(deliveryFile, 'utf8');
    return JSON.parse(raw) as DeliveryState;
  } catch (error: any) {
    if (error?.code === 'ENOENT') return {};
    throw error;
  }
}

async function writeDeliveryState(value: DeliveryState) {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(deliveryFile, JSON.stringify(value, null, 2), 'utf8');
}

function pushIfInWindow(result: AlertItem[], input: AlertItem & { date?: string; windowDays: number }) {
  if (!validDate(input.date)) return;
  const days = daysUntil(input.date);
  if (days === null || days < -7 || days > input.windowDays) return;
  result.push({ ...input, days });
}

async function collectFarmAlerts(): Promise<AlertItem[]> {
  const [schedules, breedings, vaccines, treatments, settings] = await Promise.all([
    listSchedules().catch(() => []),
    listBreedings().catch(() => []),
    listVaccines().catch(() => []),
    listTreatments().catch(() => []),
    getAlertSettingsFromCloud(),
  ]);

  const result: AlertItem[] = [];

  for (const row of schedules) {
    if (row.status === '完了' || !validDate(row.dueDate)) continue;
    const days = daysUntil(row.dueDate);
    if (days !== null && days <= settings.scheduleDays) {
      result.push({
        id: `schedule-${row.id}`,
        title: row.title || row.scheduleType || '予定',
        target: row.targetName || row.targetNumber || '',
        days,
        level: days < 0 ? 'danger' : days <= 3 ? 'warning' : 'info',
      });
    }
  }

  for (const row of breedings) {
    const pregnancyResult = String(row.pregnancyResult || '未鑑定');
    const breedingStatus = String(row.breedingStatus || '');
    const isCalved = breedingStatus === '分娩済み';
    const isPregnant = ['受胎', '妊娠'].includes(pregnancyResult);
    const isEmpty = ['空胎', '不受胎'].includes(pregnancyResult);
    const needsRecheck = pregnancyResult === '再鑑定予定';
    const hasPregnancyCheck = Boolean(row.pregnancyCheckDate);

    if (isCalved) continue;

    if (row.breedingMethod === '受精卵移植' && !row.transferDate && row.transferPlannedDate) {
      pushIfInWindow(result, {
        id: `breeding-${row.id}-移植予定`,
        title: '移植予定',
        target: row.cowName || row.cowEarTag || '',
        level: 'info',
        date: row.transferPlannedDate,
        windowDays: 7,
      });
    }

    if (!isPregnant && !needsRecheck && !hasPregnancyCheck && breedingStatus !== '移植予定') {
      pushIfInWindow(result, {
        id: `breeding-${row.id}-妊娠鑑定`,
        title: '妊娠鑑定',
        target: row.cowName || row.cowEarTag || '',
        level: 'info',
        date: row.pregnancyCheckExpectedDate,
        windowDays: settings.pregnancyCheckDays,
      });
    }

    if (isEmpty) {
      pushIfInWindow(result, {
        id: `breeding-${row.id}-次回発情確認`,
        title: '次回発情確認',
        target: row.cowName || row.cowEarTag || '',
        level: 'info',
        date: row.nextHeatExpectedDate,
        windowDays: settings.nextHeatDays,
      });
    }

    if (needsRecheck) {
      pushIfInWindow(result, {
        id: `breeding-${row.id}-再鑑定`,
        title: '再鑑定',
        target: row.cowName || row.cowEarTag || '',
        level: 'info',
        date: row.recheckExpectedDate,
        windowDays: settings.recheckDays,
      });
    }

    if (isPregnant) {
      pushIfInWindow(result, {
        id: `breeding-${row.id}-分娩予定`,
        title: '分娩予定',
        target: row.cowName || row.cowEarTag || '',
        level: 'info',
        date: row.expectedCalvingDate,
        windowDays: settings.calvingDays,
      });

      const calvingDays = daysUntil(row.expectedCalvingDate);
      if (calvingDays !== null && calvingDays <= 60) {
        result.push({
          id: `breeding-${row.id}-増し飼い検討`,
          title: '増し飼い検討',
          target: row.cowName || row.cowEarTag || '',
          days: calvingDays,
          level: calvingDays <= 14 ? 'warning' : 'info',
        });
      }
    }
  }

  for (const row of vaccines) {
    if (row.status === '接種済み' || !validDate(row.nextDueDate)) continue;
    const days = daysUntil(row.nextDueDate);
    if (days !== null && days <= settings.vaccineDays) {
      result.push({
        id: `vaccine-${row.id}`,
        title: row.vaccineName || 'ワクチン予定',
        target: row.targetName || row.targetNumber || '',
        days,
        level: days < 0 ? 'danger' : days <= 7 ? 'warning' : 'info',
      });
    }
  }

  for (const row of treatments) {
    if (row.progress === '治療中' || row.progress === '要再診') {
      result.push({
        id: `treatment-${row.id}`,
        title: row.progress || '治療中',
        target: row.targetName || row.targetNumber || '',
        days: row.treatmentDate ? daysUntil(row.treatmentDate) : null,
        level: row.progress === '要再診' ? 'danger' : 'warning',
      });
    }

    if (validDate(row.withdrawalEndDate)) {
      const days = daysUntil(row.withdrawalEndDate);
      if (days !== null && days >= 0) {
        result.push({
          id: `withdrawal-${row.id}`,
          title: '休薬期間中',
          target: row.targetName || row.targetNumber || '',
          days,
          level: days <= 3 ? 'warning' : 'info',
        });
      }
    }
  }

  const order = { danger: 0, warning: 1, info: 2 };
  result.sort((a, b) => order[a.level] - order[b.level] || (a.days ?? 9999) - (b.days ?? 9999));
  return result;
}

function summaryBody(alerts: AlertItem[]) {
  const top = alerts.slice(0, 3).map((item) => {
    const target = item.target ? `${item.target} ` : '';
    const days = item.days === 0 ? '今日' : item.days !== null && item.days !== undefined
      ? item.days < 0 ? `${Math.abs(item.days)}日超過` : `あと${item.days}日`
      : '';
    return `${target}${item.title}${days ? `（${days}）` : ''}`;
  });
  const extra = alerts.length > 3 ? ` ほか${alerts.length - 3}件` : '';
  return `${top.join(' / ')}${extra}`;
}

export async function runAutomaticPushAlertCheck(force = false) {
  const now = jstNow();
  if (!force && now.hour < 8) return { skipped: 'before-8-jst' };

  const farmIds = await getSubscribedFarmIds();
  if (farmIds.length === 0) return { skipped: 'no-subscribers' };

  const delivery = await readDeliveryState();
  let notifiedFarms = 0;

  for (const farmId of farmIds) {
    if (!force && delivery[farmId] === now.date) continue;

    const alerts = await runWithFarm(farmId, () => collectFarmAlerts());
    if (alerts.length === 0) {
      delivery[farmId] = now.date;
      continue;
    }

    const result = await sendPushToFarm(farmId, {
      title: `FarmPro アラート ${alerts.length}件`,
      body: summaryBody(alerts),
      url: '/alerts',
      tag: `farmpro-daily-alert-${now.date}`,
    });

    if (result.sent > 0) {
      delivery[farmId] = now.date;
      notifiedFarms += 1;
    }
  }

  await writeDeliveryState(delivery);
  return { notifiedFarms };
}
