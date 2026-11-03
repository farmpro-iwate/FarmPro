import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCalfFarmExpenseAllocation } from './farmExpenseAllocation';
import { getCattleFarmExpenseAllocation } from './cattleFarmExpenseAllocation';
import { getAllFarmExpenseAllocation } from './allFarmExpenseAllocation';

const fixture = vi.hoisted(() => ({
  cattle: [] as any[], calves: [] as any[], sales: [] as any[], expenses: [] as any[],
  target: 'all', method: 'headcount',
}));
vi.mock('../storage/repository', () => ({ getAllRecords: async (store: string) => store === 'cattle' ? fixture.cattle : fixture.calves }));
vi.mock('./settingsApi', () => ({ getFarmSettings: async () => ({ farmExpenseAllocation: 'equal',
  farmExpenseAllocationTarget: fixture.target, farmExpenseAllocationPeriod: 'monthly', farmExpenseAllocationMethod: fixture.method }) }));
vi.mock('./expensesApi', () => ({ getExpensesList: async () => fixture.expenses }));
vi.mock('./salesApi', () => ({ getSalesList: async () => fixture.sales }));

const death = { version: 1, death: { date: '2026-01-31', reason: '試験', note: '', recordedAt: '2026-02-01T00:00:00Z' } };
const culling = { version: 1, culling: { date: '2026-01-31', reason: '試験', note: '', route: 'fattening', recordedAt: '2026-02-01T00:00:00Z' } };
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-03-01T03:00:00Z'));
  fixture.target = 'all'; fixture.method = 'headcount'; fixture.sales = [];
  fixture.cattle = [
    { id: 1, earTag: '0001', name: '試験母牛1', birthday: '2020-01-01', acquisitionDate: '2020-01-01', lifecycle: death },
    { id: 2, earTag: '0002', name: '試験母牛2', birthday: '2020-01-01', acquisitionDate: '2020-01-01' },
  ];
  fixture.calves = [
    { id: 3, calfNumber: '0003', name: '試験子牛1', birthday: '2026-01-01', lifecycle: death },
    { id: 4, calfNumber: '0004', name: '試験子牛2', birthday: '2026-01-01' },
  ];
  fixture.expenses = [
    { id: 'january', category: '農場経費', paymentDate: '2026-01-10', amount: 100 },
    { id: 'february', category: '農場経費', paymentDate: '2026-02-10', amount: 100 },
  ];
});
afterEach(() => vi.useRealTimers());

describe('死亡日を使う在籍期間の経費按分', () => {
  it('子牛のみの按分は死亡後の経費を載せず、生前分を保持する', async () => {
    fixture.target = 'calf';
    expect(await getCalfFarmExpenseAllocation('3')).toBe(50);
    expect(await getCalfFarmExpenseAllocation('4')).toBe(150);
  });
  it('成牛のみの按分は死亡後の経費を載せず、生前分を保持する', async () => {
    fixture.target = 'cattle';
    expect(await getCattleFarmExpenseAllocation('1')).toBe(50);
    expect(await getCattleFarmExpenseAllocation('2')).toBe(150);
  });
  it('全頭への按分も死亡した成牛と子牛の両方を死亡日で区切る', async () => {
    expect(await getAllFarmExpenseAllocation('cattle', '1')).toBe(25);
    expect(await getAllFarmExpenseAllocation('calf', '3')).toBe(25);
    expect(await getAllFarmExpenseAllocation('cattle', '2')).toBe(75);
    expect(await getAllFarmExpenseAllocation('calf', '4')).toBe(75);
  });
  it('廃用後も在籍して肥育する牛は継続して按分する', async () => {
    fixture.cattle[0].lifecycle = culling; fixture.calves[0].lifecycle = culling;
    expect(await getAllFarmExpenseAllocation('cattle', '1')).toBe(50);
    expect(await getAllFarmExpenseAllocation('calf', '3')).toBe(50);
    fixture.target = 'cattle'; expect(await getCattleFarmExpenseAllocation('1')).toBe(100);
    fixture.target = 'calf'; expect(await getCalfFarmExpenseAllocation('3')).toBe(100);
  });
  it('日数按分でも登録された死亡日までの日数だけを計上する', async () => {
    fixture.method = 'days'; fixture.target = 'calf';
    fixture.expenses = [{ id: 'january', category: '農場経費', paymentDate: '2026-01-10', amount: 460 }];
    fixture.calves[0].lifecycle = { ...death, death: { ...death.death, date: '2026-01-15' } };
    expect(await getCalfFarmExpenseAllocation('3')).toBe(150);
    expect(await getCalfFarmExpenseAllocation('4')).toBe(310);
  });
  it('死亡日は含め、日付未詳の旧状態から架空の死亡日を作らない', async () => {
    fixture.target = 'calf';
    fixture.expenses = [{ id: 'last-day', category: '農場経費', paymentDate: '2026-01-31', amount: 100 }];
    expect(await getCalfFarmExpenseAllocation('3')).toBe(50);
    fixture.calves[0] = { ...fixture.calves[0], lifecycle: undefined, managementStatus: '死亡・その他' };
    fixture.expenses = [{ id: 'unknown-day', category: '農場経費', paymentDate: '2026-02-10', amount: 100 }];
    expect(await getCalfFarmExpenseAllocation('3')).toBe(50);
  });
});
