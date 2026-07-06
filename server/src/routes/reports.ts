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
    return {
      dueStatus: '対応済み',
      priority: '低',
      shouldShow: false
    };
  }

  if (status === '再確認必要') {
    return {
      dueStatus: '再確認必要',
      priority: '高',
      shouldShow: true
    };
  }

  if (nextCheckDate) {
    if (nextCheckDate < today) {
      return {
        dueStatus: '期限切れ',
        priority: '高',
        shouldShow: true
      };
    }

    if (nextCheckDate === today) {
      return {
        dueStatus: '今日確認',
        priority: '高',
        shouldShow: true
      };
    }

    if (nextCheckDate > today && nextCheckDate <= soonLimit) {
      return {
        dueStatus: 'まもなく確認',
        priority: '中',
        shouldShow: true
      };
    }
  }

  if (status === '未対応') {
    return {
      dueStatus: '未対応',
      priority: '中',
      shouldShow: true
    };
  }

  if (status === '対応中') {
    return {
      dueStatus: '対応中',
      priority: '中',
      shouldShow: false
    };
  }

  if (status === '様子見') {
    return {
      dueStatus: '様子見',
      priority: '低',
      shouldShow: false
    };
  }

  return {
    dueStatus: '通常',
    priority: '低',
    shouldShow: false
  };
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

  const today = new Date();

  function ageDaysFromBirthDate(birthDate: string) {
    if (!birthDate) return null;
    const birth = new Date(birthDate);
    if (Number.isNaN(birth.getTime())) return null;
    return Math.floor((today.getTime() - birth.getTime()) / (1000 * 60 * 60 * 24));
  }

  function nearestGuide(ageDays: number) {
    if (!guides.length) return null;

    return [...guides].sort((a, b) => {
      const da = Math.abs(Number(a.ageDays || 0) - ageDays);
      const db = Math.abs(Number(b.ageDays || 0) - ageDays);
      return da - db;
    })[0];
  }

  function latestFeedingForCalf(calfId: string, calfName: string) {
    const rows = feedings.filter((row) => {
      const rowCalfId = String(row.calfId || '');
      const rowCalfName = String(row.calfName || '');
      return (calfId && rowCalfId === calfId) || (calfName && rowCalfName === calfName);
    });

    return [...rows].sort((a, b) => String(b.feedingDate || '').localeCompare(String(a.feedingDate || '')))[0] || null;
  }

  function statusFor(actual: number, guide: number) {
    if (!guide || guide <= 0) return 'ok';
    const rate = ((actual - guide) / guide) * 100;

    if (rate < -15) return 'shortage';
    if (rate > 15) return 'over';
    return 'ok';
  }

  const details = calves.map((calf) => {
    const calfId = String(calf.id || '');
    const calfName = String(calf.name || calf.calfName || calf.earTag || '');
    const birthDate = String(calf.birthDate || '');
    const ageDays = ageDaysFromBirthDate(birthDate);

    if (ageDays === null) {
      return {
        calfId,
        calfName,
        birthDate,
        ageDays,
        guideAgeDays: '',
        stageName: '',
        latestFeedingDate: '',
        shortageCount: 0,
        overCount: 0,
        okCount: 0,
        memo: '生年月日なし'
      };
    }

    const guide = nearestGuide(ageDays);

    if (!guide) {
      return {
        calfId,
        calfName,
        birthDate,
        ageDays,
        guideAgeDays: '',
        stageName: '',
        latestFeedingDate: '',
        shortageCount: 0,
        overCount: 0,
        okCount: 0,
        memo: '給与目安なし'
      };
    }

    const latest = latestFeedingForCalf(calfId, calfName);

    if (!latest) {
      return {
        calfId,
        calfName,
        birthDate,
        ageDays,
        guideAgeDays: String(guide.ageDays || ''),
        stageName: String(guide.stageName || ''),
        latestFeedingDate: '',
        shortageCount: 0,
        overCount: 0,
        okCount: 0,
        memo: '実績なし'
      };
    }

    const checks = [
      {
        actual: Number(latest.starterKg || 0),
        guide: Number(guide.starterKg || 0)
      },
      {
        actual: Number(latest.growingFeedKg || 0),
        guide: Number(guide.growingFeedKg || 0)
      },
      {
        actual: Number(latest.roughageKg || 0),
        guide: Number(guide.roughageKg || 0)
      }
    ];

    const shortageCount = checks.filter((item) => statusFor(item.actual, item.guide) === 'shortage').length;
    const overCount = checks.filter((item) => statusFor(item.actual, item.guide) === 'over').length;
    const okCount = checks.filter((item) => statusFor(item.actual, item.guide) === 'ok').length;

    let memo = '良好';
    if (shortageCount > 0 && overCount > 0) memo = '不足・多めあり';
    else if (shortageCount > 0) memo = '不足気味';
    else if (overCount > 0) memo = '多め';

    return {
      calfId,
      calfName,
      birthDate,
      ageDays,
      guideAgeDays: String(guide.ageDays || ''),
      stageName: String(guide.stageName || ''),
      latestFeedingDate: String(latest.feedingDate || ''),
      shortageCount,
      overCount,
      okCount,
      memo
    };
  });

  return {
    totalCalves: calves.length,
    withGuideCount: details.filter((row) => row.guideAgeDays).length,
    noBirthDateCount: details.filter((row) => row.memo === '生年月日なし').length,
    noGuideCount: details.filter((row) => row.memo === '給与目安なし').length,
    noRecordCount: details.filter((row) => row.memo === '実績なし').length,
    shortageCalfCount: details.filter((row) => Number(row.shortageCount || 0) > 0).length,
    overCalfCount: details.filter((row) => Number(row.overCount || 0) > 0).length,
    okCalfCount: details.filter((row) => row.memo === '良好').length,
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
