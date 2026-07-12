import { Router } from 'express';
import fs from 'fs';
import path from 'path';

export const reportsRouter = Router();

function readJsonFile<T>(fileName: string, fallback: T): T {
  try {
    const dataPath = path.join(process.cwd(), 'src', 'data', fileName);
    if (!fs.existsSync(dataPath)) return fallback;

    const raw = fs.readFileSync(dataPath, 'utf-8');
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function currentMonthText() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function todayIsoDate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDaysIsoDate(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function countByStatus(items: any[], status: string) {
  return items.filter((item) => String(item.status || '') === status).length;
}

function calcFeedingAlertActionsSummary() {
  const actions = readJsonFile<any[]>('feedingAlertActions.json', []);
  const currentMonth = currentMonthText();

  return {
    totalCount: actions.length,
    notStartedCount: countByStatus(actions, '未対応'),
    inProgressCount: countByStatus(actions, '対応中'),
    doneCount: countByStatus(actions, '対応済み'),
    watchingCount: countByStatus(actions, '様子見'),
    recheckCount: countByStatus(actions, '再確認必要'),
    thisMonthCount: actions.filter((item) => String(item.actionDate || '').startsWith(currentMonth)).length
  };
}

function dueStatusForAction(item: any) {
  const status = String(item.status || '');
  const nextCheckDate = String(item.nextCheckDate || '');
  const today = todayIsoDate();
  const soonLimit = addDaysIsoDate(3);

  if (status === '対応済み') {
    return { dueStatus: '対応済み', priority: '低', shouldShow: false };
  }

  if (status === '再確認必要') {
    return { dueStatus: '再確認必要', priority: '高', shouldShow: true };
  }

  if (nextCheckDate) {
    if (nextCheckDate < today) {
      return { dueStatus: '期限切れ', priority: '高', shouldShow: true };
    }
    if (nextCheckDate === today) {
      return { dueStatus: '今日確認', priority: '高', shouldShow: true };
    }
    if (nextCheckDate > today && nextCheckDate <= soonLimit) {
      return { dueStatus: 'まもなく確認', priority: '中', shouldShow: true };
    }
  }

  if (status === '未対応') {
    return { dueStatus: '未対応', priority: '中', shouldShow: true };
  }
  if (status === '対応中') {
    return { dueStatus: '対応中', priority: '中', shouldShow: false };
  }
  if (status === '様子見') {
    return { dueStatus: '様子見', priority: '低', shouldShow: false };
  }

  return { dueStatus: '通常', priority: '低', shouldShow: false };
}

function priorityScore(priority: string) {
  if (priority === '高') return 3;
  if (priority === '中') return 2;
  if (priority === '低') return 1;
  return 0;
}

function dueStatusScore(dueStatus: string) {
  if (dueStatus === '期限切れ') return 6;
  if (dueStatus === '今日確認') return 5;
  if (dueStatus === '再確認必要') return 4;
  if (dueStatus === 'まもなく確認') return 3;
  if (dueStatus === '未対応') return 2;
  return 1;
}

function calcFeedingAlertActionDueAlerts() {
  const actions = readJsonFile<any[]>('feedingAlertActions.json', []);

  const details = actions.map((item) => {
    const due = dueStatusForAction(item);
    return {
      id: String(item.id || ''),
      actionDate: String(item.actionDate || ''),
      calfId: String(item.calfId || ''),
      calfName: String(item.calfName || ''),
      ageDays: String(item.ageDays || ''),
      alertType: String(item.alertType || ''),
      actionType: String(item.actionType || ''),
      status: String(item.status || ''),
      nextCheckDate: String(item.nextCheckDate || ''),
      memo: String(item.memo || ''),
      dueStatus: due.dueStatus,
      priority: due.priority,
      shouldShow: due.shouldShow
    };
  });

  const attentionDetails = details
    .filter((item) => item.shouldShow)
    .sort((a, b) => {
      const dueCompare = dueStatusScore(b.dueStatus) - dueStatusScore(a.dueStatus);
      if (dueCompare !== 0) return dueCompare;
      const priorityCompare = priorityScore(b.priority) - priorityScore(a.priority);
      if (priorityCompare !== 0) return priorityCompare;
      return String(a.nextCheckDate || '9999-99-99').localeCompare(String(b.nextCheckDate || '9999-99-99'));
    });

  return {
    overdueCount: details.filter((item) => item.dueStatus === '期限切れ').length,
    todayCount: details.filter((item) => item.dueStatus === '今日確認').length,
    soonCount: details.filter((item) => item.dueStatus === 'まもなく確認').length,
    recheckCount: details.filter((item) => item.dueStatus === '再確認必要').length,
    notStartedCount: details.filter((item) => item.dueStatus === '未対応').length,
    totalAttentionCount: attentionDetails.length,
    details: attentionDetails
  };
}

function calcFeedingAlertsSummary() {
  const calves = readJsonFile<any[]>('calves.json', []);
  const feedings = readJsonFile<any[]>('feedings.json', []);
  const guides = readJsonFile<any[]>('feedingGuide.json', []);

  function toNumber(value: unknown) {
    if (value === null || value === undefined || value === '') return 0;
    const n = Number(String(value).replace(/,/g, ''));
    return Number.isNaN(n) ? 0 : n;
  }

  function calfBirthDate(calf: any) {
    return String(calf.birthDate || calf.birthday || calf.dateOfBirth || '');
  }

  function ageDaysFromBirthDate(birthDate: string) {
    if (!birthDate) return null;
    const birth = new Date(`${birthDate}T00:00:00`);
    if (Number.isNaN(birth.getTime())) return null;
    const today = new Date();
    const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const birthOnly = new Date(birth.getFullYear(), birth.getMonth(), birth.getDate());
    return Math.floor((todayDate.getTime() - birthOnly.getTime()) / (1000 * 60 * 60 * 24));
  }

  function nearestGuide(ageDays: number) {
    if (guides.length === 0) return null;
    const numericGuides = guides
      .map((guide) => ({ guide, age: toNumber(guide.ageDays) }))
      .filter((item) => item.age >= 0)
      .sort((a, b) => {
        const diffA = Math.abs(a.age - ageDays);
        const diffB = Math.abs(b.age - ageDays);
        if (diffA !== diffB) return diffA - diffB;
        return a.age - b.age;
      });
    return numericGuides[0]?.guide || null;
  }

  function feedingDate(record: any) {
    return String(record.date || record.feedingDate || record.recordDate || '');
  }

  function sameCalf(record: any, calf: any) {
    const calfNames = [calf.id, calf.name, calf.calfName, calf.earTag, calf.managementId]
      .filter(Boolean)
      .map((value) => String(value));
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
    ].filter(Boolean).map((value) => String(value));
    return recordNames.some((value) => calfNames.includes(value));
  }

  function latestRecordsForCalf(calf: any) {
    const matched = feedings.filter((record) => sameCalf(record, calf));
    if (matched.length === 0) return [];
    const sorted = [...matched].sort((a, b) => feedingDate(b).localeCompare(feedingDate(a)));
    const latestDate = feedingDate(sorted[0]);
    if (!latestDate) return sorted.slice(0, 5);
    return sorted.filter((record) => feedingDate(record) === latestDate);
  }

  function sumActual(records: any[]) {
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

  function statusFor(actual: number, guide: number) {
    if (guide <= 0 && actual <= 0) return 'none';
    if (guide <= 0 && actual > 0) return 'none';
    const rate = (actual - guide) / guide;
    if (Math.abs(rate) <= 0.15) return 'ok';
    if (actual < guide) return 'shortage';
    return 'over';
  }

  const details = calves.map((calf) => {
    const calfId = String(calf.id || '');
    const calfName = String(calf.name || calf.calfName || calf.earTag || calf.managementId || '');
    const birthDate = calfBirthDate(calf);
    const ageDays = ageDaysFromBirthDate(birthDate);
    const guide = ageDays === null || ageDays < 0 ? null : nearestGuide(ageDays);
    const records = latestRecordsForCalf(calf);

    let shortageCount = 0;
    let overCount = 0;
    let okCount = 0;

    if (guide) {
      const actual = sumActual(records);
      const checks = [
        { actual: actual.starter, guide: toNumber(guide.starterAmount) },
        { actual: actual.growing, guide: toNumber(guide.growingFeedAmount) },
        { actual: actual.roughage, guide: toNumber(guide.roughageAmount) }
      ];
      shortageCount = checks.filter((item) => statusFor(item.actual, item.guide) === 'shortage').length;
      overCount = checks.filter((item) => statusFor(item.actual, item.guide) === 'over').length;
      okCount = checks.filter((item) => statusFor(item.actual, item.guide) === 'ok').length;
    }

    let memo = '判定なし';
    if (ageDays === null) memo = '生年月日なし';
    else if (!guide) memo = '給与目安なし';
    else if (records.length === 0) memo = '実績なし';
    else if (shortageCount > 0 && overCount > 0) memo = '不足と多めあり';
    else if (shortageCount > 0) memo = '不足気味あり';
    else if (overCount > 0) memo = '多めあり';
    else if (okCount > 0) memo = '概ね良好';

    return {
      calfId,
      calfName,
      birthDate,
      ageDays,
      guideAgeDays: guide ? String(guide.ageDays || '') : '',
      stageName: guide ? String(guide.stageName || '') : '',
      latestFeedingDate: records.length > 0 ? feedingDate(records[0]) : '',
      shortageCount,
      overCount,
      okCount,
      recordCount: records.length,
      memo
    };
  });

  return {
    totalCalves: calves.length,
    withGuideCount: details.filter((row) => row.guideAgeDays).length,
    noBirthDateCount: details.filter((row) => row.memo === '生年月日なし').length,
    noGuideCount: details.filter((row) => row.memo === '給与目安なし').length,
    noRecordCount: details.filter((row) => Number(row.recordCount || 0) === 0).length,
    shortageCalfCount: details.filter((row) => Number(row.shortageCount || 0) > 0).length,
    overCalfCount: details.filter((row) => Number(row.overCount || 0) > 0).length,
    okCalfCount: details.filter((row) => Number(row.okCount || 0) > 0 && Number(row.shortageCount || 0) === 0 && Number(row.overCount || 0) === 0).length,
    details
  };
}

reportsRouter.get('/summary', (_req, res) => {
  const cattle = readJsonFile<any[]>('cattle.json', []);
  const calves = readJsonFile<any[]>('calves.json', []);
  const breedings = readJsonFile<any[]>('breedings.json', []);
  const vaccines = readJsonFile<any[]>('vaccines.json', []);
  const treatments = readJsonFile<any[]>('treatments.json', []);
  const schedules = readJsonFile<any[]>('schedules.json', []);
  const sales = readJsonFile<any[]>('sales.json', []);
  const expenses = readJsonFile<any[]>('expenses.json', []);
  const feedings = readJsonFile<any[]>('feedings.json', []);
  const feedInventory = readJsonFile<any[]>('feedInventory.json', []);
  const feedingGuide = readJsonFile<any[]>('feedingGuide.json', []);

  const now = new Date();
  const currentMonth = currentMonthText();
  const currentYear = String(now.getFullYear());

  const salesTotal = sales.reduce((sum, item) => sum + Number(item.amount || item.totalAmount || 0), 0);
  const expenseTotal = expenses.reduce((sum, item) => sum + Number(item.amount || 0), 0);

  const thisMonthSalesTotal = sales
    .filter((item) => String(item.saleDate || item.shippingDate || '').startsWith(currentMonth))
    .reduce((sum, item) => sum + Number(item.amount || item.totalAmount || 0), 0);
  const thisMonthExpenseTotal = expenses
    .filter((item) => String(item.expenseDate || '').startsWith(currentMonth))
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const thisYearSalesTotal = sales
    .filter((item) => String(item.saleDate || item.shippingDate || '').startsWith(currentYear))
    .reduce((sum, item) => sum + Number(item.amount || item.totalAmount || 0), 0);
  const thisYearExpenseTotal = expenses
    .filter((item) => String(item.expenseDate || '').startsWith(currentYear))
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);

  res.json({
    cattleCount: cattle.length,
    calfCount: calves.length,
    breedingCount: breedings.length,
    vaccineCount: vaccines.length,
    treatmentCount: treatments.length,
    scheduleCount: schedules.length,
    salesCount: sales.length,
    expenseCount: expenses.length,
    feedingCount: feedings.length,
    feedInventoryCount: feedInventory.length,
    feedingGuideCount: feedingGuide.length,
    salesTotal,
    expenseTotal,
    balanceTotal: salesTotal - expenseTotal,
    monthlyBalance: {
      salesTotal: thisMonthSalesTotal,
      expenseTotal: thisMonthExpenseTotal,
      balanceTotal: thisMonthSalesTotal - thisMonthExpenseTotal
    },
    yearlyBalance: {
      salesTotal: thisYearSalesTotal,
      expenseTotal: thisYearExpenseTotal,
      balanceTotal: thisYearSalesTotal - thisYearExpenseTotal
    },
    feedingAlerts: calcFeedingAlertsSummary(),
    feedingAlertActions: calcFeedingAlertActionsSummary(),
    feedingAlertActionDueAlerts: calcFeedingAlertActionDueAlerts()
  });
});

export default reportsRouter;
