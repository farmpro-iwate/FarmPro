import { getAllRecords } from '../storage/repository';

type AnyRow = Record<string, unknown> & { id: string | number };

async function safeGetAll(storeName: Parameters<typeof getAllRecords>[0]): Promise<AnyRow[]> {
  try {
    return await getAllRecords<AnyRow>(storeName);
  } catch {
    return [];
  }
}

function numberValue(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function isCurrentMonth(value: unknown, now: Date): boolean {
  const text = dateText(value);
  if (!text) return false;

  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return false;

  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth()
  );
}

function daysUntil(value: unknown): number | null {
  const text = dateText(value);
  if (!text) return null;

  const target = new Date(`${text.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
}

export async function getReportSummary(): Promise<Record<string, unknown>> {
  const [
    cattle,
    calves,
    breedings,
    vaccines,
    blvTests,
    schedules,
    treatments,
    sales,
    expenses,
    feedInventory,
    feedingGuide,
  ] = await Promise.all([
    safeGetAll('cattle'),
    safeGetAll('calves'),
    safeGetAll('breedings'),
    safeGetAll('vaccines'),
    safeGetAll('blvTests'),
    safeGetAll('schedules'),
    safeGetAll('treatments'),
    safeGetAll('sales'),
    safeGetAll('expenses'),
    safeGetAll('feedInventory'),
    safeGetAll('feedingGuide'),
  ]);

  const now = new Date();

  const salesTotal = sales.reduce(
    (sum, row) => sum + numberValue(row.salePrice),
    0,
  );

  const expenseTotal = expenses.reduce(
    (sum, row) => sum + numberValue(row.amount),
    0,
  );

  const monthlySalesTotal = sales
    .filter((row) => isCurrentMonth(row.saleDate, now))
    .reduce((sum, row) => sum + numberValue(row.salePrice), 0);

  const monthlyExpenseTotal = expenses
    .filter((row) => isCurrentMonth(row.paymentDate, now))
    .reduce((sum, row) => sum + numberValue(row.amount), 0);

  const openSchedules = schedules.filter(
    (row) => !['完了', '取消', 'キャンセル'].includes(String(row.status ?? '')),
  );

  const activeTreatments = treatments.filter(
    (row) => !['完了', '終了'].includes(String(row.progress ?? '')),
  );

  const withdrawalTreatments = treatments
    .filter((row) => {
      const days = daysUntil(row.withdrawalEndDate);
      return days !== null && days >= 0;
    })
    .map((row) => ({
      id: Number(row.id),
      targetName: String(row.targetName ?? ''),
      medicine: String(row.medicine ?? ''),
      withdrawalEndDate: String(row.withdrawalEndDate ?? ''),
      daysUntil: daysUntil(row.withdrawalEndDate),
    }));

  const nearSchedules = openSchedules
    .filter((row) => {
      const days = daysUntil(row.dueDate);
      return days !== null && days <= 30;
    })
    .map((row) => ({
      id: Number(row.id),
      scheduleType: String(row.scheduleType ?? ''),
      title: String(row.title ?? ''),
      targetName: String(row.targetName ?? ''),
      dueDate: String(row.dueDate ?? ''),
      daysUntil: daysUntil(row.dueDate),
    }))
    .sort((a, b) => (a.daysUntil ?? 999999) - (b.daysUntil ?? 999999));

  const blvPositive = blvTests.filter((row) =>
    ['陽性', 'positive', 'Positive'].includes(String(row.result ?? '')),
  ).length;

  return {
    counts: {
      cattle: cattle.length,
      calves: calves.length,
      breedings: breedings.length,
      vaccines: vaccines.length,
      blvPositive,
      openSchedules: openSchedules.length,
      activeTreatments: activeTreatments.length,
      withdrawal: withdrawalTreatments.length,
    },
    nearSchedules,
    withdrawalTreatments,

    salesTotal,
    expenseTotal,
    balanceTotal: salesTotal - expenseTotal,

    monthlyBalance: {
      salesTotal: monthlySalesTotal,
      expenseTotal: monthlyExpenseTotal,
      balanceTotal: monthlySalesTotal - monthlyExpenseTotal,
    },

    yearlyBalance: {
      salesTotal,
      expenseTotal,
      balanceTotal: salesTotal - expenseTotal,
    },

    cattleCount: cattle.length,
    calfCount: calves.length,
    breedingCount: breedings.length,
    vaccineCount: vaccines.length,
    blvPositiveCount: blvPositive,
    scheduleCount: openSchedules.length,
    treatmentCount: activeTreatments.length,
    feedInventoryCount: feedInventory.length,
    feedingGuideCount: feedingGuide.length,

    feedingAlerts: {
      totalCalves: calves.length,
      withGuideCount: 0,
      noBirthDateCount: calves.filter((row) => !row.birthDate && !row.birthday).length,
      noGuideCount: 0,
      noRecordCount: 0,
      shortageCalfCount: 0,
      overCalfCount: 0,
      okCalfCount: 0,
    },
  };
}

export function downloadCsv(_kind: string): void {
  throw new Error('CSV出力は端末内保存対応を今後実装します。');
}



