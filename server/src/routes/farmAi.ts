import { Router } from 'express';
import OpenAI from 'openai';
import { listBreedings } from '../breedingStore';
import { listTreatments } from '../treatmentStore';
import { listSyncedSales } from '../salesSyncStore';

export const farmAiRouter = Router();

type RequestBody = {
  question?: string;
};

type MonthlyBalanceSummaryBody = {
  question?: string;
  summary?: {
    yearMonth?: string;
    salesTotalAmount?: number;
    salesProductionCostAmount?: number;
    salesProfitAmount?: number;
    expenseTotalAmount?: number;
    balanceAmount?: number;
    salesSoldCount?: number;
    expenseCount?: number;
    expenseFeedAmount?: number;
    expenseMedicalAmount?: number;
    expenseBreedingAmount?: number;
    expenseLaborAmount?: number;
    expenseOtherAmount?: number;
  };
  previousSummary?: {
    yearMonth?: string;
    salesTotalAmount?: number;
    salesProductionCostAmount?: number;
    salesProfitAmount?: number;
    expenseTotalAmount?: number;
    balanceAmount?: number;
    salesSoldCount?: number;
    expenseCount?: number;
    expenseFeedAmount?: number;
    expenseMedicalAmount?: number;
    expenseBreedingAmount?: number;
    expenseLaborAmount?: number;
    expenseOtherAmount?: number;
  };
};

function asksSalesPercentDifference(question: string) {
  const normalized = question.replace(/[\s　。、・「」『』（）()？?]/g, '');
  return (
    normalized.includes('今月') &&
    normalized.includes('先月') &&
    normalized.includes('売上') &&
    (
      normalized.includes('何%') ||
      normalized.includes('何％') ||
      normalized.includes('何パーセント') ||
      normalized.includes('増減率')
    )
  );
}

function asksSalesAmountDifference(question: string) {
  const normalized = question.replace(/[\s　。、・「」『』（）()？?]/g, '');
  return (
    normalized.includes('今月') &&
    normalized.includes('先月') &&
    normalized.includes('売上') &&
    (
      normalized.includes('いくら増え') ||
      normalized.includes('いくら減っ') ||
      normalized.includes('差額')
    )
  );
}

function asksSalesCountDifference(question: string) {
  const normalized = question.replace(/[\s　。、・「」『』（）()？?]/g, '');
  return (
    normalized.includes('今月') &&
    normalized.includes('先月') &&
    (
      normalized.includes('販売頭数') ||
      normalized.includes('何頭')
    ) &&
    (
      normalized.includes('増え') ||
      normalized.includes('減っ') ||
      normalized.includes('差')
    )
  );
}

function asksPreviousAverageSaleAmount(question: string) {
  const normalized = question.replace(/[\s　。、・「」『』（）()？?]/g, '');
  return (
    normalized.includes('先月') &&
    (
      normalized.includes('平均販売額') ||
      normalized.includes('平均売上') ||
      normalized.includes('1頭あたり') ||
      normalized.includes('一頭あたり')
    )
  );
}

function asksAverageSaleAmount(question: string) {
  const normalized = question.replace(/[\s　。、・「」『』（）()？?]/g, '');
  return (
    normalized.includes('今月') &&
    (
      normalized.includes('平均販売額') ||
      normalized.includes('平均売上') ||
      normalized.includes('1頭あたり') ||
      normalized.includes('一頭あたり')
    )
  );
}

function asksMonthlySalesSummary(question: string) {
  const normalized = question.replace(/[\s　。、・「」『』（）()？?]/g, '');
  return (
    normalized.includes('今月') &&
    (normalized.includes('売上') || normalized.includes('販売')) &&
    (
      normalized.includes('何頭') ||
      normalized.includes('何頭で') ||
      normalized.includes('いくら')
    )
  );
}

function asksOneLineMonthlyComparison(question: string) {
  const normalized = question.replace(/[\s　。、・「」『』（）()？?]/g, '');
  return (
    normalized.includes('今月') &&
    normalized.includes('先月') &&
    (
      normalized.includes('一言') ||
      normalized.includes('短く') ||
      normalized.includes('ひとこと')
    ) &&
    (
      normalized.includes('比べ') ||
      normalized.includes('比較')
    )
  );
}

function asksOneLineManagementSummary(question: string) {
  const normalized = question.replace(/[\s　。、・「」『』（）()？?]/g, '');
  return (
    normalized.includes('今月') &&
    normalized.includes('経営') &&
    (
      normalized.includes('一言') ||
      normalized.includes('短くまとめ') ||
      normalized.includes('ひとことで')
    )
  );
}

function asksMonthlyCaution(question: string) {
  const normalized = question.replace(/[\s　。、・「」『』（）()？?]/g, '');
  return (
    normalized.includes('今月') &&
    (
      normalized.includes('注意点') ||
      normalized.includes('注意すること') ||
      normalized.includes('気をつける')
    )
  );
}

function asksImprovement(question: string) {
  const normalized = question.replace(/[\s　。、・「」『』（）()？?]/g, '');
  return (
    normalized.includes('改善') ||
    normalized.includes('見直すなら') ||
    normalized.includes('見直すとしたら')
  );
}

function asksTopExpense(question: string) {
  const normalized = question.replace(/[\s　。、・「」『』（）()？?]/g, '');
  return (
    (normalized.includes('一番') || normalized.includes('最も')) &&
    (normalized.includes('お金') || normalized.includes('経費') || normalized.includes('費用'))
  );
}

function normalizeDigits(value: string) {
  return value.replace(/[０-９]/g, (digit) => String.fromCharCode(digit.charCodeAt(0) - 0xfee0));
}

function extractEarTag(question: string) {
  const normalized = normalizeDigits(question);
  const numbered = normalized.match(/([0-9]{1,15})\s*番/);
  if (numbered) return numbered[1];

  const labeled = normalized.match(/耳標(?:番号)?\s*[:：]?\s*([0-9]{1,15})/);
  return labeled?.[1] || '';
}

function isPreviousInseminationQuestion(question: string) {
  const normalized = question.replace(/[\s　]/g, '');
  const asksInsemination = normalized.includes('授精') || normalized.includes('受精') || normalized.includes('種付');
  const asksPrevious = normalized.includes('前回') || normalized.includes('最後') || normalized.includes('直近');
  return asksInsemination && asksPrevious;
}

function isBreedingStageQuestion(question: string) {
  const normalized = question.replace(/[\s　]/g, '');
  return (
    (normalized.includes('繁殖') && (normalized.includes('段階') || normalized.includes('状態'))) ||
    normalized.includes('今どの段階') ||
    normalized.includes('今どんな段階')
  );
}

function isWeeklyBreedingTasksQuestion(question: string) {
  const normalized = question.replace(/[\s　。、・「」『』（）()？?]/g, '');
  const asksPeriod = normalized.includes('今週') || normalized.includes('7日以内') || normalized.includes('近日');
  const asksAction = normalized.includes('対応') || normalized.includes('予定') || normalized.includes('やること') || normalized.includes('作業');
  const asksAnimal = normalized.includes('牛') || normalized.includes('繁殖');
  return asksPeriod && asksAction && asksAnimal;
}

function isNearCalvingsQuestion(question: string) {
  const normalized = question.replace(/[\s　。、・「」『』（）()？?]/g, '');
  const asksCalving = normalized.includes('分娩') || normalized.includes('出産');
  const asksNear = normalized.includes('近い') || normalized.includes('もうすぐ') || normalized.includes('60日以内');
  const asksAnimal = normalized.includes('牛') || normalized.includes('母牛');
  return asksCalving && asksNear && asksAnimal;
}

function isWithdrawalCattleQuestion(question: string) {
  const normalized = question.replace(/[\s　。、・「」『』（）()？?]/g, '');
  const asksWithdrawal = normalized.includes('休薬');
  const asksAnimal = normalized.includes('牛') || normalized.includes('個体') || normalized.includes('いる');
  return asksWithdrawal && asksAnimal;
}

function isMonthlySalesProfitQuestion(question: string) {
  const normalized = question.replace(/[\s　。、・「」『』（）()？?]/g, '');
  const asksMonth = normalized.includes('今月');
  const asksSale = normalized.includes('売った') || normalized.includes('販売') || normalized.includes('売却');
  const asksProfit = normalized.includes('利益') || normalized.includes('儲け');
  const asksAnimal = normalized.includes('牛') || normalized.includes('個体');
  return asksMonth && asksSale && asksProfit && asksAnimal;
}

function japanTodayText() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function addDays(dateText: string, days: number) {
  const date = new Date(`${dateText}T00:00:00+09:00`);
  date.setUTCDate(date.getUTCDate() + days);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function weeklyStatus(date: string) {
  const today = japanTodayText();
  if (date < addDays(today, -7)) return '';
  if (date < today) return '期限超過';
  if (date === today) return '今日';
  if (date <= addDays(today, 7)) return '近日中';
  return '';
}

type WeeklyBreedingTask = {
  date: string;
  status: string;
  action: string;
  earTag: string;
  cowName: string;
};

function weeklyBreedingTasks(records: Awaited<ReturnType<typeof listBreedings>>) {
  const tasks: WeeklyBreedingTask[] = [];

  for (const row of records) {
    const pregnancyResult = String(row.pregnancyResult || '未鑑定');
    const breedingStatus = String(row.breedingStatus || '');
    const isCalved = breedingStatus === '分娩済み';
    const isPregnant = ['受胎', '妊娠'].includes(pregnancyResult);
    const isEmpty = ['空胎', '不受胎'].includes(pregnancyResult);
    const needsRecheck = pregnancyResult === '再鑑定予定';
    const hasPregnancyCheck = Boolean(row.pregnancyCheckDate);
    const candidates: Array<[string, string]> = [];

    if (!isCalved && !isPregnant && !needsRecheck && !hasPregnancyCheck) {
      candidates.push(['次回発情確認', row.nextHeatExpectedDate || '']);
      candidates.push(['妊娠鑑定', row.pregnancyCheckExpectedDate || '']);
    }
    if (!isCalved && isEmpty) candidates.push(['次回発情確認', row.nextHeatExpectedDate || '']);
    if (!isCalved && needsRecheck) candidates.push(['再鑑定', row.recheckExpectedDate || '']);
    if (!isCalved && isPregnant) candidates.push(['分娩予定', row.expectedCalvingDate || '']);
    if (!isCalved && breedingStatus !== '中止' && !row.transferDate) {
      candidates.push(['移植予定', row.transferPlannedDate || '']);
    }

    for (const [action, rawDate] of candidates) {
      const date = String(rawDate || '').slice(0, 10);
      const status = date ? weeklyStatus(date) : '';
      if (!status) continue;
      tasks.push({
        date,
        status,
        action,
        earTag: String(row.cowEarTag || ''),
        cowName: String(row.cowName || ''),
      });
    }
  }

  return tasks.sort((a, b) => a.date.localeCompare(b.date));
}

type NearCalving = {
  date: string;
  status: string;
  days: number;
  earTag: string;
  cowName: string;
};

function daysFromToday(dateText: string) {
  const today = new Date(`${japanTodayText()}T00:00:00+09:00`).getTime();
  const target = new Date(`${dateText}T00:00:00+09:00`).getTime();
  return Math.round((target - today) / 86400000);
}

function nearCalvings(records: Awaited<ReturnType<typeof listBreedings>>) {
  return records
    .filter((row) => {
      const pregnancyResult = String(row.pregnancyResult || '');
      if (!['受胎', '妊娠'].includes(pregnancyResult)) return false;
      if (String(row.breedingStatus || '') === '分娩済み') return false;
      const date = String(row.expectedCalvingDate || '').slice(0, 10);
      if (!date) return false;
      const days = daysFromToday(date);
      return days >= -7 && days <= 60;
    })
    .map((row): NearCalving => {
      const date = String(row.expectedCalvingDate || '').slice(0, 10);
      const days = daysFromToday(date);
      return {
        date,
        days,
        status: days < 0 ? '予定日超過' : days === 0 ? '今日' : `あと${days}日`,
        earTag: String(row.cowEarTag || ''),
        cowName: String(row.cowName || ''),
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

type WithdrawalCattle = {
  targetNumber: string;
  targetName: string;
  withdrawalEndDate: string;
  medicine: string;
  days: number;
};

function withdrawalCattle(records: Awaited<ReturnType<typeof listTreatments>>) {
  const today = japanTodayText();
  const byAnimal = new Map<string, WithdrawalCattle>();

  for (const row of records) {
    const endDate = String(row.withdrawalEndDate || '').slice(0, 10);
    if (!endDate || endDate < today) continue;

    const targetNumber = String(row.targetNumber || '').trim();
    const targetName = String(row.targetName || '').trim();
    const key = targetNumber || targetName;
    if (!key) continue;

    const item: WithdrawalCattle = {
      targetNumber,
      targetName,
      withdrawalEndDate: endDate,
      medicine: String(row.medicine || ''),
      days: daysFromToday(endDate),
    };

    const existing = byAnimal.get(key);
    if (!existing || item.withdrawalEndDate > existing.withdrawalEndDate) {
      byAnimal.set(key, item);
    }
  }

  return [...byAnimal.values()].sort((a, b) => a.withdrawalEndDate.localeCompare(b.withdrawalEndDate));
}

type MonthlySaleProfitItem = {
  saleDate: string;
  targetNumber: string;
  targetName: string;
  salePrice: number;
  productionCost: number | null;
  profit: number | null;
};

function currentJapanYearMonth() {
  return japanTodayText().slice(0, 7);
}

function optionalNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function monthlySaleProfit(records: Awaited<ReturnType<typeof listSyncedSales>>) {
  const yearMonth = currentJapanYearMonth();
  const items: MonthlySaleProfitItem[] = [];

  for (const row of records) {
    if (row.deletedAt) continue;
    if (row.status !== '販売済み') continue;

    const saleDate = String(row.saleDate || '').slice(0, 10);
    if (!saleDate.startsWith(`${yearMonth}-`)) continue;

    const salePrice = optionalNumber(row.salePrice) ?? 0;
    const productionCost = optionalNumber(row.productionCostSnapshot);
    const storedProfit = optionalNumber(row.profitSnapshot);

    items.push({
      saleDate,
      targetNumber: String(row.targetNumber || ''),
      targetName: String(row.targetName || ''),
      salePrice,
      productionCost,
      profit: storedProfit,
    });
  }

  items.sort((a, b) => a.saleDate.localeCompare(b.saleDate));

  const summarized = items.reduce(
    (acc, item) => {
      acc.salePrice += item.salePrice;
      if (item.productionCost !== null && item.profit !== null) {
        acc.productionCost += item.productionCost;
        acc.profit += item.profit;
        acc.counted += 1;
      } else {
        acc.unsettled += 1;
      }
      return acc;
    },
    { count: items.length, counted: 0, unsettled: 0, salePrice: 0, productionCost: 0, profit: 0 },
  );

  return { yearMonth, items, summarized };
}

function currentBreedingStage(item: Awaited<ReturnType<typeof listBreedings>>[number]) {
  if (item.breedingStatus === '分娩済み') return '分娩済み';
  if (item.breedingStatus === '中止') return '経過観察';
  if (item.pregnancyResult === '受胎') return item.expectedCalvingDate ? '分娩待ち' : '受胎確認';
  if (item.pregnancyResult === '再鑑定予定') return '経過観察';
  if (item.pregnancyResult === '空胎' || item.pregnancyResult === '流産・胎子喪失') return '経過観察';
  if (item.breedingStatus === '種付実施' || item.breedingStatus === '移植実施') return '妊娠鑑定待ち';
  if (item.breedingStatus === '発情確認') return '種付実施';
  if (item.breedingStatus === '完了') return '完了';
  return item.breedingStatus || '発情予定';
}

function normalizeCowName(value: string) {
  return value
    .trim()
    .replace(/(?:号|牛)$/g, '')
    .toLocaleLowerCase();
}

function extractCowName(question: string) {
  const normalized = question.replace(/[\s　]/g, '');
  const marker = normalized.search(/前回|最後|直近|は今|今どの|今どんな|繁殖段階|繁殖状態/);
  if (marker <= 0) return '';

  const candidate = normalized.slice(0, marker)
    .replace(/^(?:牛名|名号)[:：]?/, '')
    .replace(/(?:の|は)?$/, '')
    .trim();

  if (!candidate || /^[0-9０-９]+番?$/.test(candidate)) return '';
  return candidate;
}

farmAiRouter.post('/monthly-balance', async (req, res) => {
  const user = res.locals.authUser as { plan?: string } | undefined;
  if (!user || (user.plan !== 'standard' && user.plan !== 'pro')) {
    res.status(403).json({ message: '農場データを使ったAI質問はStandard以上で利用できます。' });
    return;
  }

  const body = (req.body || {}) as MonthlyBalanceSummaryBody;
  const question = String(body.question || '').trim();
  const summary = body.summary;
  const previousSummary = body.previousSummary;

  if (!question || !summary?.yearMonth) {
    res.status(400).json({ message: '月別収支の集計結果を取得できませんでした。' });
    return;
  }

  const numeric = (value: unknown) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const currentFacts = [
    `対象月: ${String(summary.yearMonth)}`,
    `販売頭数: ${numeric(summary.salesSoldCount)}頭`,
    `売上合計: ${Math.round(numeric(summary.salesTotalAmount))}円`,
    `販売時生産費合計: ${Math.round(numeric(summary.salesProductionCostAmount))}円`,
    `販売利益合計: ${Math.round(numeric(summary.salesProfitAmount))}円`,
    `経費合計: ${Math.round(numeric(summary.expenseTotalAmount))}円`,
    `収支: ${Math.round(numeric(summary.balanceAmount))}円`,
    `経費件数: ${numeric(summary.expenseCount)}件`,
    `飼料・敷料費: ${Math.round(numeric(summary.expenseFeedAmount))}円`,
    `診療・医薬品費: ${Math.round(numeric(summary.expenseMedicalAmount))}円`,
    `種付け・繁殖費: ${Math.round(numeric(summary.expenseBreedingAmount))}円`,
    `人件費: ${Math.round(numeric(summary.expenseLaborAmount))}円`,
    `その他経費: ${Math.round(numeric(summary.expenseOtherAmount))}円`,
  ];

  const previousFacts = previousSummary?.yearMonth
    ? [
        '',
        `比較対象月: ${String(previousSummary.yearMonth)}`,
        `販売頭数: ${numeric(previousSummary.salesSoldCount)}頭`,
        `売上合計: ${Math.round(numeric(previousSummary.salesTotalAmount))}円`,
        `販売時生産費合計: ${Math.round(numeric(previousSummary.salesProductionCostAmount))}円`,
        `販売利益合計: ${Math.round(numeric(previousSummary.salesProfitAmount))}円`,
        `経費合計: ${Math.round(numeric(previousSummary.expenseTotalAmount))}円`,
        `収支: ${Math.round(numeric(previousSummary.balanceAmount))}円`,
        `経費件数: ${numeric(previousSummary.expenseCount)}件`,
        `飼料・敷料費: ${Math.round(numeric(previousSummary.expenseFeedAmount))}円`,
        `診療・医薬品費: ${Math.round(numeric(previousSummary.expenseMedicalAmount))}円`,
        `種付け・繁殖費: ${Math.round(numeric(previousSummary.expenseBreedingAmount))}円`,
        `人件費: ${Math.round(numeric(previousSummary.expenseLaborAmount))}円`,
        `その他経費: ${Math.round(numeric(previousSummary.expenseOtherAmount))}円`,
      ]
    : [];

  const facts = [...currentFacts, ...previousFacts].join('\n');

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    res.status(503).json({ message: 'Standard AIはまだ設定されていません。OPENAI_API_KEYを確認してください。' });
    return;
  }

  try {
    const client = new OpenAI({ apiKey });
    const model = process.env.FARMPRO_AI_ASSISTANT_MODEL?.trim() || 'gpt-5';
    const response = await client.responses.create({
      model,
      input: [{
        role: 'user',
        content: [{
          type: 'input_text',
          text: [
            'あなたは繁殖Farm Proの農場データ回答AIです。',
            '以下の月別収支画面と同じ集計結果だけを根拠に、日本語で短く分かりやすく答えてください。',
            '登録されていない内容を推測しないでください。',
            previousSummary?.yearMonth
              ? asksSalesPercentDifference(question)
                ? '今月の売上合計と先月の売上合計を比べ、売上の増減率だけを1文で短く答えてください。増減率は ((今月売上 - 先月売上) / 先月売上) × 100 で計算してください。先月売上が0円なら計算せず、「先月売上が0円のため増減率は算出できません」と答えてください。販売頭数、経費、収支、販売利益、評価や原因推測は出さないでください。'
                : asksSalesAmountDifference(question)
                  ? '今月の売上合計と先月の売上合計を比べ、いくら増えたか・減ったかだけを1文で短く答えてください。円金額は必ず3桁カンマ区切りで表記してください（例: 1,376,000円）。差が0円なら「変化なし」と答えてください。販売頭数、経費、収支、販売利益、評価や原因推測は出さないでください。'
                  : asksSalesCountDifference(question)
                  ? '今月の販売頭数と先月の販売頭数を比べ、何頭増えたか・減ったかだけを1文で短く答えてください。差が0頭なら「変化なし」と答えてください。売上金額、経費、収支、販売利益、評価や原因推測は出さないでください。'
                  : asksPreviousAverageSaleAmount(question)
                  ? '先月の平均販売額を1文で短く答えてください。平均販売額は比較対象月の売上合計を販売頭数で割って計算してください。販売頭数が0頭なら計算せず、「先月は販売実績がないため平均販売額は算出できません」と答えてください。今月の数字、経費、収支、販売利益、評価や原因推測は出さないでください。'
                  : asksOneLineMonthlyComparison(question)
                    ? '今月と先月の経営を1文だけで短く比較してください。売上・経費・収支の差だけを示してください。販売利益、経費内訳、販売頭数などは出さないでください。前月が0円なら増減率は出さず、差額だけにしてください。良い・悪いなどの評価や原因推測はしないでください。'
                    : '今月と先月の売上、経費、収支をそれぞれ示し、差額も明確にしてください。増減率は元データから計算できる場合だけ示してください。'
              : asksAverageSaleAmount(question)
                ? '今月の平均販売額を1文で短く答えてください。平均販売額は売上合計を販売頭数で割って計算してください。販売頭数が0頭なら計算せず、「今月は販売実績がないため平均販売額は算出できません」と答えてください。販売頭数と売上合計は必要なら括弧で短く補足して構いません。経費、収支、販売利益、評価や原因推測は出さないでください。'
                : asksMonthlySalesSummary(question)
                  ? '今月の販売頭数と売上合計だけを、1文で短く答えてください。経費、収支、販売利益、経費内訳、評価や原因推測は出さないでください。'
                  : asksOneLineManagementSummary(question)
                ? '今月の経営状況を1文だけで短く答えてください。売上、経費、収支の3つを必ず含め、必要なら販売利益を短く補足してください。良い・悪いなどの評価や原因の推測はしないでください。'
                : asksMonthlyCaution(question)
                  ? '今月の登録データから、数字だけで明確に確認できる経営上の注意点があれば1〜3点で示してください。たとえば収支がマイナスなど、事実として確認できるものだけにしてください。0円を未登録・異常・問題と決めつけないでください。注意点を特定できる明確な根拠がない場合は、「今月の登録データから特に注意点は確認できません」と答えてそこで終了してください。改善案や原因の推測はしないでください。'
                  : asksImprovement(question)
                    ? '今月の登録データから改善箇所を特定できる場合だけ、根拠となる数字と一緒に1〜3点で示してください。経費が全項目0円、販売時生産費が0円、件数が少ないなど、改善箇所を特定できる十分なデータがない場合は、改善候補や行動提案を一切作らず、「現時点の登録データだけでは改善箇所を特定できません」と明確に答えてそこで終了してください。0円を未登録と断定したり、データ登録の徹底・モニタリング・記録継続などを改善案として出さないでください。登録されていない費用や原因を推測しないでください。'
                    : asksTopExpense(question)
                      ? '今月の経費内訳のうち金額が最も大きい項目を最初に答えてください。全項目が0円なら、一番かかっている経費はないと明確に答えてください。'
                      : '最初に売上、経費、収支を明確に示してください。',
            '販売利益は収支とは別の指標なので、必要に応じて「販売利益」と明記して補足してください。',
            '経費内訳は金額がある項目を中心に短くまとめてください。',
            '',
            `質問: ${question}`,
            '',
            'FarmPro月別収支データ:',
            facts,
          ].join('\n'),
        }],
      }],
    });

    const answer = response.output_text?.trim();
    if (!answer) {
      res.status(502).json({ message: 'AIから回答が返りませんでした。' });
      return;
    }

    res.json({
      handled: true,
      answer,
      source: {
        recordType: 'monthly-balance',
        yearMonth: String(summary.yearMonth),
      },
      model,
    });
  } catch (caught) {
    console.error('Farm AI monthly balance failed', caught);
    res.status(502).json({
      message: caught instanceof Error ? caught.message : 'Standard AIの回答に失敗しました。',
    });
  }
});

farmAiRouter.post('/question', async (req, res) => {
  const user = res.locals.authUser as { plan?: string } | undefined;
  if (!user || (user.plan !== 'standard' && user.plan !== 'pro')) {
    res.status(403).json({ message: '農場データを使ったAI質問はStandard以上で利用できます。' });
    return;
  }

  const question = String((req.body as RequestBody | undefined)?.question || '').trim();
  if (!question) {
    res.status(400).json({ message: '質問を入力してください。' });
    return;
  }

  const previousInseminationQuestion = isPreviousInseminationQuestion(question);
  const breedingStageQuestion = isBreedingStageQuestion(question);
  const weeklyBreedingQuestion = isWeeklyBreedingTasksQuestion(question);
  const nearCalvingsQuestion = isNearCalvingsQuestion(question);
  const withdrawalQuestion = isWithdrawalCattleQuestion(question);
  const monthlySalesProfitQuestion = isMonthlySalesProfitQuestion(question);

  if (!previousInseminationQuestion && !breedingStageQuestion && !weeklyBreedingQuestion && !nearCalvingsQuestion && !withdrawalQuestion && !monthlySalesProfitQuestion) {
    res.json({ handled: false });
    return;
  }

  if (monthlySalesProfitQuestion) {
    const result = monthlySaleProfit(await listSyncedSales());

    if (result.items.length === 0) {
      res.json({
        handled: true,
        answer: `${result.yearMonth}に販売済みの牛はありません。`,
        source: { recordType: 'monthly-sales-profit', count: 0, yearMonth: result.yearMonth },
      });
      return;
    }

    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      res.status(503).json({ message: 'Standard AIはまだ設定されていません。OPENAI_API_KEYを確認してください。' });
      return;
    }

    try {
      const client = new OpenAI({ apiKey });
      const model = process.env.FARMPRO_AI_ASSISTANT_MODEL?.trim() || 'gpt-5';
      const facts = [
        `対象月: ${result.yearMonth}`,
        `販売頭数: ${result.summarized.count}頭`,
        `販売金額合計: ${Math.round(result.summarized.salePrice)}円`,
        `生産費集計済み: ${result.summarized.counted}頭`,
        `生産費合計: ${Math.round(result.summarized.productionCost)}円`,
        `利益合計: ${Math.round(result.summarized.profit)}円`,
        `利益未集計: ${result.summarized.unsettled}頭`,
        '',
        ...result.items.map((item) =>
          `${item.saleDate} | 耳標:${item.targetNumber || '未登録'} | 牛名:${item.targetName || '未登録'} | 販売金額:${Math.round(item.salePrice)}円 | 生産費:${item.productionCost === null ? '未集計' : Math.round(item.productionCost) + '円'} | 利益:${item.profit === null ? '未集計' : Math.round(item.profit) + '円'}`
        ),
      ].join('\n');

      const response = await client.responses.create({
        model,
        input: [{
          role: 'user',
          content: [{
            type: 'input_text',
            text: [
              'あなたは繁殖Farm Proの農場データ回答AIです。',
              '以下のFarmPro登録データだけを根拠に、日本語で短く分かりやすく答えてください。',
              '登録されていない内容を推測しないでください。',
              '今月の販売頭数、販売金額、生産費、利益を最初にまとめてください。',
              '利益未集計の販売がある場合は、その頭数を明記し、利益合計が集計済み分だけであることを明確にしてください。',
              '必要なら各牛の販売金額と利益を短く列挙してください。',
              '',
              `質問: ${question}`,
              '',
              'FarmPro登録データ:',
              facts,
            ].join('\n'),
          }],
        }],
      });

      const answer = response.output_text?.trim();
      if (!answer) {
        res.status(502).json({ message: 'AIから回答が返りませんでした。' });
        return;
      }

      res.json({
        handled: true,
        answer,
        source: {
          recordType: 'monthly-sales-profit',
          count: result.summarized.count,
          counted: result.summarized.counted,
          unsettled: result.summarized.unsettled,
          yearMonth: result.yearMonth,
        },
        model,
      });
    } catch (caught) {
      console.error('Farm AI monthly sales profit failed', caught);
      res.status(502).json({
        message: caught instanceof Error ? caught.message : 'Standard AIの回答に失敗しました。',
      });
    }
    return;
  }

  if (withdrawalQuestion) {
    const items = withdrawalCattle(await listTreatments());
    if (items.length === 0) {
      res.json({
        handled: true,
        answer: '現在、休薬中の牛はいません。',
        source: { recordType: 'withdrawal-cattle', count: 0 },
      });
      return;
    }

    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      res.status(503).json({ message: 'Standard AIはまだ設定されていません。OPENAI_API_KEYを確認してください。' });
      return;
    }

    try {
      const client = new OpenAI({ apiKey });
      const model = process.env.FARMPRO_AI_ASSISTANT_MODEL?.trim() || 'gpt-5';
      const facts = items.map((item) =>
        `耳標:${item.targetNumber || '未登録'} | 牛名:${item.targetName || '未登録'} | 休薬終了日:${item.withdrawalEndDate} | あと${item.days}日 | 薬剤:${item.medicine || '未登録'}`
      ).join('\n');

      const response = await client.responses.create({
        model,
        input: [{
          role: 'user',
          content: [{
            type: 'input_text',
            text: [
              'あなたは繁殖Farm Proの農場データ回答AIです。',
              '以下のFarmPro登録データだけを根拠に、日本語で短く分かりやすく答えてください。',
              '登録されていない内容を推測しないでください。',
              '休薬中の牛を、牛名または耳標番号、休薬終了日、あと何日かが分かるように整理してください。',
              '薬剤名が登録されていれば短く補足してください。',
              '',
              `質問: ${question}`,
              '',
              'FarmPro登録データ:',
              facts,
            ].join('\n'),
          }],
        }],
      });

      const answer = response.output_text?.trim();
      if (!answer) {
        res.status(502).json({ message: 'AIから回答が返りませんでした。' });
        return;
      }

      res.json({
        handled: true,
        answer,
        source: { recordType: 'withdrawal-cattle', count: items.length },
        model,
      });
    } catch (caught) {
      console.error('Farm AI withdrawal cattle failed', caught);
      res.status(502).json({
        message: caught instanceof Error ? caught.message : 'Standard AIの回答に失敗しました。',
      });
    }
    return;
  }

  if (nearCalvingsQuestion) {
    const items = nearCalvings(await listBreedings());
    if (items.length === 0) {
      res.json({
        handled: true,
        answer: '分娩予定日が過去7日から今後60日以内の牛はありません。',
        source: { recordType: 'near-calvings', count: 0 },
      });
      return;
    }

    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      res.status(503).json({ message: 'Standard AIはまだ設定されていません。OPENAI_API_KEYを確認してください。' });
      return;
    }

    try {
      const client = new OpenAI({ apiKey });
      const model = process.env.FARMPRO_AI_ASSISTANT_MODEL?.trim() || 'gpt-5';
      const facts = items.map((item) =>
        `${item.date} | ${item.status} | 耳標:${item.earTag || '未登録'} | 牛名:${item.cowName || '未登録'}`
      ).join('\n');

      const response = await client.responses.create({
        model,
        input: [{
          role: 'user',
          content: [{
            type: 'input_text',
            text: [
              'あなたは繁殖Farm Proの農場データ回答AIです。',
              '以下のFarmPro登録データだけを根拠に、日本語で短く分かりやすく答えてください。',
              '登録されていない内容を推測しないでください。',
              '分娩予定日が近い順に、牛名または耳標番号、分娩予定日、あと何日かが分かるようにしてください。',
              '予定日を過ぎている場合は、予定日超過と明記してください。',
              '',
              `質問: ${question}`,
              '',
              'FarmPro登録データ:',
              facts,
            ].join('\n'),
          }],
        }],
      });

      const answer = response.output_text?.trim();
      if (!answer) {
        res.status(502).json({ message: 'AIから回答が返りませんでした。' });
        return;
      }

      res.json({
        handled: true,
        answer,
        source: { recordType: 'near-calvings', count: items.length },
        model,
      });
    } catch (caught) {
      console.error('Farm AI near calvings failed', caught);
      res.status(502).json({
        message: caught instanceof Error ? caught.message : 'Standard AIの回答に失敗しました。',
      });
    }
    return;
  }

  if (weeklyBreedingQuestion) {
    const tasks = weeklyBreedingTasks(await listBreedings());
    if (tasks.length === 0) {
      res.json({
        handled: true,
        answer: '今日を含む前後7日以内に、対応が必要な繁殖予定はありません。',
        source: { recordType: 'breeding-weekly-tasks', count: 0 },
      });
      return;
    }

    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      res.status(503).json({ message: 'Standard AIはまだ設定されていません。OPENAI_API_KEYを確認してください。' });
      return;
    }

    try {
      const client = new OpenAI({ apiKey });
      const model = process.env.FARMPRO_AI_ASSISTANT_MODEL?.trim() || 'gpt-5';
      const facts = tasks.map((task) =>
        `${task.date} | ${task.status} | ${task.action} | 耳標:${task.earTag || '未登録'} | 牛名:${task.cowName || '未登録'}`
      ).join('\n');

      const response = await client.responses.create({
        model,
        input: [{
          role: 'user',
          content: [{
            type: 'input_text',
            text: [
              'あなたは繁殖Farm Proの農場データ回答AIです。',
              '以下のFarmPro登録データだけを根拠に、日本語で短く分かりやすく答えてください。',
              '登録されていない内容を推測しないでください。',
              '期限超過、今日、近日中の順で分かりやすく整理してください。',
              '各項目は牛名または耳標番号、対応内容、日付が分かるようにしてください。',
              '',
              `質問: ${question}`,
              '',
              'FarmPro登録データ:',
              facts,
            ].join('\n'),
          }],
        }],
      });

      const answer = response.output_text?.trim();
      if (!answer) {
        res.status(502).json({ message: 'AIから回答が返りませんでした。' });
        return;
      }

      res.json({
        handled: true,
        answer,
        source: { recordType: 'breeding-weekly-tasks', count: tasks.length },
        model,
      });
    } catch (caught) {
      console.error('Farm AI weekly tasks failed', caught);
      res.status(502).json({
        message: caught instanceof Error ? caught.message : 'Standard AIの回答に失敗しました。',
      });
    }
    return;
  }

  const earTag = extractEarTag(question);
  const cowName = extractCowName(question);
  if (!earTag && !cowName) {
    res.json({
      handled: true,
      answer: breedingStageQuestion
        ? '耳標番号または牛名が分かるように質問してください。例：「123番は今どの繁殖段階？」「ふじ号は今どの繁殖段階？」'
        : '耳標番号または牛名が分かるように質問してください。例：「123番の前回授精はいつ？」「ふじ号の前回授精は？」',
    });
    return;
  }

  const normalizedCowName = normalizeCowName(cowName);
  const allCowRecords = (await listBreedings())
    .filter((item) => {
      if (earTag) return String(item.cowEarTag || '').trim() === earTag;
      return normalizeCowName(String(item.cowName || '')) === normalizedCowName;
    });

  const records = previousInseminationQuestion
    ? allCowRecords
        .filter((item) => Boolean(item.inseminationDate))
        .sort((a, b) => String(b.inseminationDate || '').localeCompare(String(a.inseminationDate || '')))
    : allCowRecords;

  const latest = records[0];
  if (!latest) {
    res.json({
      handled: true,
      answer: earTag
        ? `${earTag}番の${breedingStageQuestion ? '繁殖記録' : '授精記録'}は見つかりませんでした。`
        : `${cowName}の${breedingStageQuestion ? '繁殖記録' : '授精記録'}は見つかりませんでした。`,
      source: { earTag, cowName, recordType: 'breeding' },
    });
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    res.status(503).json({ message: 'Standard AIはまだ設定されていません。OPENAI_API_KEYを確認してください。' });
    return;
  }

  try {
    const client = new OpenAI({ apiKey });
    const model = process.env.FARMPRO_AI_ASSISTANT_MODEL?.trim() || 'gpt-5';
    const stage = currentBreedingStage(latest);
    const facts = breedingStageQuestion
      ? [
          `耳標番号: ${latest.cowEarTag || earTag || '未登録'}`,
          `牛名: ${latest.cowName || cowName || '未登録'}`,
          `現在の繁殖段階: ${stage}`,
          `繁殖方法: ${latest.breedingMethod || '未選択'}`,
          `発情日: ${latest.heatDate || '未登録'}`,
          `授精日: ${latest.inseminationDate || '未登録'}`,
          `ET実施日: ${latest.transferDate || '未登録'}`,
          `妊娠鑑定予定日: ${latest.pregnancyCheckExpectedDate || '未登録'}`,
          `妊娠鑑定日: ${latest.pregnancyCheckDate || '未登録'}`,
          `受胎確認: ${latest.pregnancyResult || '未鑑定'}`,
          `分娩予定日: ${latest.expectedCalvingDate || '未登録'}`,
        ].join('\n')
      : [
          `耳標番号: ${latest.cowEarTag || earTag || '未登録'}`,
          `牛名: ${latest.cowName || cowName || '未登録'}`,
          `前回授精日: ${latest.inseminationDate}`,
          `種雄牛: ${latest.bullName || '未登録'}`,
          `授精担当者: ${latest.inseminatorName || '未登録'}`,
          `受胎確認: ${latest.pregnancyResult || '未鑑定'}`,
        ].join('\n');

    const response = await client.responses.create({
      model,
      input: [{
        role: 'user',
        content: [{
          type: 'input_text',
          text: [
            'あなたは繁殖Farm Proの農場データ回答AIです。',
            '以下のFarmPro登録データだけを根拠に、日本語で短く分かりやすく答えてください。',
            '登録されていない内容を推測しないでください。',
            breedingStageQuestion
              ? '質問に直接答え、現在の繁殖段階を最初に明確に示してください。必要なら次に関係する予定日を1文だけ補足してください。'
              : '質問に直接答え、その後に必要なら種雄牛や受胎確認を1文だけ補足してください。',
            '',
            `質問: ${question}`,
            '',
            'FarmPro登録データ:',
            facts,
          ].join('\n'),
        }],
      }],
    });

    const answer = response.output_text?.trim();
    if (!answer) {
      res.status(502).json({ message: 'AIから回答が返りませんでした。' });
      return;
    }

    res.json({
      handled: true,
      answer,
      source: {
        earTag: latest.cowEarTag || earTag,
        cowName: latest.cowName || cowName,
        breedingId: latest.id,
        inseminationDate: latest.inseminationDate,
        stage: breedingStageQuestion ? stage : undefined,
        recordType: 'breeding',
      },
      model,
    });
  } catch (caught) {
    console.error('Farm AI question failed', caught);
    res.status(502).json({
      message: caught instanceof Error ? caught.message : 'Standard AIの回答に失敗しました。',
    });
  }
});
