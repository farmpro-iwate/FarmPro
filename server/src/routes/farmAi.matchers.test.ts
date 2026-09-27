import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isLatestBreedingSireQuestion,
  isLatestPregnancyCheckQuestion,
  isUpcomingSchedulesQuestion,
  isWeeklyBreedingTasksQuestion,
  monthlySaleProfit,
  upcomingBreedingTasks,
} from './farmAi';

test('identified cattle pregnancy check question works without 前回/直近/最後', () => {
  assert.equal(isLatestPregnancyCheckQuestion('7358番 はなみつの妊娠鑑定は？'), true);
  assert.equal(isLatestPregnancyCheckQuestion('7358番の妊鑑は？'), true);
});

test('pregnancy check question without cattle context still needs latest wording', () => {
  assert.equal(isLatestPregnancyCheckQuestion('妊娠鑑定は？'), false);
  assert.equal(isLatestPregnancyCheckQuestion('前回の妊娠鑑定は？'), true);
});

test('latest used sire question is treated as breeding history', () => {
  assert.equal(isLatestBreedingSireQuestion('7358番 はなみつの前回使用した種雄牛は？'), true);
  assert.equal(isLatestBreedingSireQuestion('7358番が最後に使った父牛は？'), true);
});

test('plain sire question remains basic cattle information', () => {
  assert.equal(isLatestBreedingSireQuestion('7358番の父牛は？'), false);
  assert.equal(isLatestBreedingSireQuestion('7358番の種雄牛は？'), false);
});


test('farm-wide schedule questions are recognized', () => {
  assert.equal(isUpcomingSchedulesQuestion('今後の予定は？'), true);
  assert.equal(isUpcomingSchedulesQuestion('これからの予定を教えて'), true);
  assert.equal(isWeeklyBreedingTasksQuestion('今週の繁殖予定は？'), true);
});

test('upcoming schedules include a registered expected calving date before pregnancy check', () => {
  const tasks = upcomingBreedingTasks([
    {
      cowEarTag: '7358',
      cowName: 'はなみつ',
      pregnancyResult: '未鑑定',
      breedingStatus: '移植実施',
      pregnancyCheckDate: '',
      nextHeatExpectedDate: '',
      pregnancyCheckExpectedDate: '2099-11-04',
      expectedCalvingDate: '2099-07-05',
      transferDate: '2098-09-23',
      transferPlannedDate: '',
    },
  ] as any);

  assert.ok(tasks.some((item) =>
    item.title === '分娩予定' &&
    item.date === '2099-07-05' &&
    item.targetNumber === '7358'
  ));
});

test('monthly sales profit matches monthly balance aggregation rules', () => {
  const result = monthlySaleProfit([
    {
      status: '販売済み',
      saleDate: '2099-09-01',
      salePrice: 500000,
      productionCostSnapshot: null,
      profitSnapshot: null,
      targetNumber: '',
      targetName: '耳標未装着',
    },
    {
      status: '販売済み',
      saleDate: '2099-09-02',
      salePrice: 876000,
      productionCostSnapshot: 0,
      profitSnapshot: null,
      targetNumber: '総合テスト牛',
      targetName: '',
    },
    {
      status: '販売済み',
      saleDate: '2099-09-03',
      salePrice: 0,
      productionCostSnapshot: 0,
      profitSnapshot: 0,
      targetNumber: 'zero',
      targetName: '0円販売',
    },
  ] as any, '2099-09');

  assert.equal(result.summarized.count, 2);
  assert.equal(result.summarized.salePrice, 1376000);
  assert.equal(result.summarized.productionCost, 0);
  assert.equal(result.summarized.profit, 1376000);
  assert.equal(result.summarized.unsettled, 0);
});
