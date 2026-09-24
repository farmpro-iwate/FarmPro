import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { farmProAiHelpGuides, type FarmProAiHelpGuide } from '../ai/helpGuideData';
import { parseRegistrationIntent, type FarmProAiRegistrationIntent } from '../ai/registrationIntent';
import { getStoredAuthUser } from '../services/authClient';
import { askFarmAi, askMonthlyBalanceAi } from '../services/farmAiClient';
import { getMonthlyBalance } from '../services/monthlyBalanceApi';
import { getCattleList } from '../services/api';
import { getCalfList } from '../services/calfApi';
import { normalizeFeedAnimalNumber, type FeedAllocationTargetAnimal } from '../services/feedAllocationTargets';
import { formatTemporaryCalfNumber } from '../utils/temporaryCalfNumber';
import { createBreeding, getBreedingList, updateBreeding } from '../services/breedingApi';
import { createCalving, registerCalvingToCalfLedger } from '../services/calvingsApi';
import { createTreatment } from '../services/treatmentApi';
import { createVaccine } from '../services/vaccineApi';
import { upsertExpenseBySource } from '../services/expensesApi';
import { ensureCalvingMotherCattle } from '../services/motherCattleLink';
import { SireSearchField } from '../components/SireSearchField';
import { InseminatorSearchField } from '../components/InseminatorSearchField';
import { MedicineSearchField, type MedicineOption } from '../components/MedicineSearchField';
import { getFarmSettings } from '../services/settingsApi';
import { createFeedInventory, getFeedInventoryList, type FeedInventoryInput } from '../services/feedInventoryApi';
import { buildFeedCostingSnapshot } from '../services/feedCostingSnapshot';
import {
  calculateExpectedCalvingDate,
  calculateNextHeatExpectedDate,
  calculatePregnancyCheckExpectedDate,
} from '../utils/breeding';

const acquisitionCostGuide: FarmProAiHelpGuide = {
  id: 'acquisition-cost-allocation',
  title: '繁殖牛の取得原価の分け方',
  intents: ['繁殖牛の取得原価を何産で分ける', '取得原価を何産で分ける', '取得原価の配分とは', '8産で分ける意味', '何産にすればいい'],
  route: '/settings',
  freePlan: true,
  answer: '取得原価は、繁殖牛を購入した金額や、自家保留した繁殖牛にかかった原価を、将来生まれる子牛へ分けて入れるための考え方です。たとえば取得原価80万円を8産で分けると、1産あたり10万円を子牛の生産費へ配分します。5産なら1産あたり16万円、10産なら1産あたり8万円です。設定する産数が少ないほど1頭あたりの負担は大きくなり、多いほど小さくなります。「農場設定」の「繁殖牛の取得原価を何産で分ける？」で、農場の考え方に合う産数を選んでください。',
  notes: ['実際に何産まで使うかは牛や農場によって異なります。迷う場合は8産を目安にして、運用後も同じ考え方でそろえると比較しやすくなります。'],
};

const allocationMethodGuide: FarmProAiHelpGuide = {
  id: 'expense-allocation-method',
  title: '頭数で均等と在籍日数の違い',
  intents: ['頭数で均等とは', '在籍日数に応じてとは', '頭数均等と在籍日数の違い', 'どっちを選べばいい', '経費の分け方はどっちがいい'],
  route: '/settings',
  freePlan: true,
  answer: '「頭数で均等」は、その期間の対象牛へ同じ金額ずつ経費を分ける方法です。たとえば月の農場共通経費が10万円で対象牛が10頭なら、1頭あたり1万円ずつ配分します。「在籍日数に応じて」は、その期間に農場にいた日数に合わせて分ける方法です。月の途中で導入した牛や販売した牛は、1か月ずっといた牛より少ない配分になります。牛の出入りが少ない農場なら「頭数で均等」が分かりやすく、途中導入や販売が多い場合は「在籍日数に応じて」の方が実態に近い計算になります。',
  notes: ['どちらが正解というより、農場の運用に合う方法を選ぶ設定です。途中で頻繁に変えるより、同じ考え方で続ける方が生産費を比較しやすくなります。'],
};

const allocationPeriodGuide: FarmProAiHelpGuide = {
  id: 'expense-allocation-period',
  title: '月ごとと年ごとの違い',
  intents: ['月ごとと年ごとの違い', '月ごととは', '年ごととは', '月ごとと年ごとどっち', 'どの期間で計算するとは'],
  route: '/settings',
  freePlan: true,
  answer: '「月ごと」は、その月に発生した農場全体の経費を、その月の対象牛へ配分する方法です。たとえば9月の電気代・燃料費・消耗品費を、9月の対象牛へ分けます。月別収支や月ごとの生産費の動きを見たい場合に向いています。「年ごと」は、1年間に発生した農場全体の経費をまとめて、その年の対象牛へ配分する方法です。月ごとの細かな差より、年間全体で生産費を見たい場合に向いています。FarmProでは月別収支も確認できるため、月ごとの動きを見たい場合は「月ごと」が分かりやすいです。',
  notes: ['どちらを選んでも、途中で頻繁に変更すると比較しにくくなります。運用を始めたら、同じ考え方で続けるのがおすすめです。'],
};

const allocationTargetGuide: FarmProAiHelpGuide = {
  id: 'expense-allocation-target',
  title: '全頭・繁殖牛・子牛の違い',
  intents: ['全頭とは', '繁殖牛とは', '子牛とは', 'どの牛に分ける', '全頭と繁殖牛と子牛の違い', '経費をどの牛に分ければいい'],
  route: '/settings',
  freePlan: true,
  answer: '「どの牛に分ける？」は、電気代・燃料費・消耗品費などの農場共通経費を、どの牛の生産費へ負担させるかを決める設定です。「子牛」は、共通経費を子牛の生産費へ配分します。子牛1頭を生産するのにいくらかかったか、販売時の利益はいくらかを見たい場合に分かりやすい方法です。「繁殖牛」は、共通経費を繁殖牛の生産費へ配分します。繁殖牛そのものの維持費や個体別コストを見たい場合に使います。「全頭」は、繁殖牛と子牛の両方へ配分します。共通経費を農場にいる牛全体で負担させたい場合に使います。繁殖農家で子牛の生産費と販売利益を中心に見たい場合は、「子牛」が分かりやすい設定です。',
  notes: ['どれが正解というより、何の生産費を見たいかで選ぶ設定です。途中で頻繁に変更すると比較しにくくなるため、運用を始めたら同じ考え方で続けるのがおすすめです。'],
};

const expenseIncludeGuide: FarmProAiHelpGuide = {
  id: 'expense-allocation-include',
  title: '農場全体の経費を含める・含めないの違い',
  intents: ['農場全体の経費を含めるとは', '含めると含めないの違い', '経費は含めた方がいい', '個体別生産費に経費を含める', '農場全体の経費を個体別生産費に含めるとは'],
  route: '/settings',
  freePlan: true,
  answer: '「含める」は、電気代・燃料費・消耗品費など、1頭の牛だけに直接つけにくい農場共通経費も、個体別生産費へ分けて入れる方法です。たとえば子牛の生産費を見る場合、飼料費や治療費だけでなく、農場全体でかかった共通経費も子牛へ配分します。「含めない」は、こうした共通経費を個体別生産費には入れず、飼料費・治療費・ワクチン費・取得原価など、個体へ直接つながる費用を中心に計算します。農場全体の経費そのものは月別収支で確認できますが、「含めない」を選ぶと個体別生産費や販売時利益には反映されません。子牛1頭を生産するのに実際いくらかかったかをできるだけ実態に近く見たい場合は、「含める」が分かりやすい設定です。',
  notes: ['「含める」を選ぶと個体別生産費は高くなりやすく、「含めない」を選ぶと販売時利益が大きめに見える場合があります。どちらで見るかを決めたら、同じ考え方で続けると比較しやすくなります。'],
};

const treatmentGuide: FarmProAiHelpGuide = {
  id: 'treatment-create',
  title: '治療登録',
  intents: ['治療を登録したい', '治療記録を入れたい', '薬を使った記録をしたい', '投薬を登録したい', '休薬期間を記録したい', '診療費を登録したい'],
  route: '/treatments/new',
  freePlan: true,
  answer: '画面上部の「＋」→「活動登録」→「治療」を開きます。また、ホームの「今日の対応」「近日の対応」に治療予定が表示されている場合は、そこから対象牛を開いて進めます。対象牛を選び、「治療日」と「症状」を入力して保存してください。薬剤を使った場合は、薬剤名・投薬量・休薬期間終了日も確認してください。',
  notes: ['医薬品費や診療費を入力した場合は経費管理へ自動反映されます。薬剤マスターに休薬期間が登録されている場合は休薬終了日の目安を自動入力しますが、製品表示や獣医師の指示を優先してください。'],
};

const vaccineGuide: FarmProAiHelpGuide = {
  id: 'vaccine-create',
  title: 'ワクチン登録',
  intents: ['ワクチンを登録したい', 'ワクチン接種を記録したい', '予防接種を登録したい', '次回ワクチン予定を入れたい', 'ワクチン予定を登録したい', 'ワクチン費用を登録したい'],
  route: '/vaccines/new',
  freePlan: true,
  answer: '画面上部の「＋」→「活動登録」→「ワクチン」を開きます。また、ホームの「今日の対応」「近日の対応」にワクチン予定が表示されている場合は、そこから対象牛を開いて進めます。対象牛とワクチン名を選び、接種した場合は「接種日」と「状態」を確認して保存してください。次回も接種予定がある場合は「次回予定日」を入力してください。',
  notes: ['接種済みのワクチン費用を入力した場合は経費管理の「医薬品費」へ自動反映されます。同じ費用を手入力で重複登録しないようにしてください。'],
};

const routeLabels: Record<string, string> = {
  '/settings': '農場設定',
  '/masters': 'マスター登録',
  '/backups': 'バックアップ',
  '/cattle/new': '牛の新規登録',
  '/breedings/new': '発情登録',
  '/breedings/ai/new': '種付登録',
  '/breedings/transfer-plan/new': 'ET予定登録',
  '/pregnancy-checks': '妊娠鑑定一覧',
  '/calvings/new': '分娩記録',
  '/treatments/new': '治療登録',
  '/vaccines/new': 'ワクチン新規登録',
  '/feed-inventory': '飼料在庫管理',
  '/feedings': '飼料給与管理',
  '/feeding-guide': '給与目安',
  '/cattle/sold': '販売済み牛一覧',
  '/animal-import': '牛情報を取り込む',
  '/device-sync': '複数端末同期',
  '/print': '印刷',
};

function normalize(text: string) {
  return text
    .toLowerCase()
    .replace(/[\s　。、・「」『』（）()？?]/g, '')
    .replace(/種付け/g, '種付')
    .replace(/妊鑑/g, '妊娠鑑定');
}


function isSalesPercentDifferenceQuestion(question: string) {
  const normalizedQuestion = normalize(question);
  return (
    normalizedQuestion.includes('今月') &&
    normalizedQuestion.includes('先月') &&
    normalizedQuestion.includes('売上') &&
    (
      normalizedQuestion.includes('何%') ||
      normalizedQuestion.includes('何％') ||
      normalizedQuestion.includes('何パーセント') ||
      normalizedQuestion.includes('増減率')
    )
  );
}

function isSalesAmountDifferenceQuestion(question: string) {
  const normalizedQuestion = normalize(question);
  return (
    normalizedQuestion.includes('今月') &&
    normalizedQuestion.includes('先月') &&
    normalizedQuestion.includes('売上') &&
    (
      normalizedQuestion.includes('いくら増え') ||
      normalizedQuestion.includes('いくら減っ') ||
      normalizedQuestion.includes('差額')
    )
  );
}

function isSalesCountDifferenceQuestion(question: string) {
  const normalizedQuestion = normalize(question);
  return (
    normalizedQuestion.includes('今月') &&
    normalizedQuestion.includes('先月') &&
    (
      normalizedQuestion.includes('販売頭数') ||
      normalizedQuestion.includes('何頭')
    ) &&
    (
      normalizedQuestion.includes('増え') ||
      normalizedQuestion.includes('減っ') ||
      normalizedQuestion.includes('差')
    )
  );
}

function isPreviousAverageSaleAmountQuestion(question: string) {
  const normalizedQuestion = normalize(question);
  return (
    normalizedQuestion.includes('先月') &&
    (
      normalizedQuestion.includes('平均販売額') ||
      normalizedQuestion.includes('平均売上') ||
      normalizedQuestion.includes('1頭あたり') ||
      normalizedQuestion.includes('一頭あたり')
    )
  );
}

function isAverageSaleAmountQuestion(question: string) {
  const normalizedQuestion = normalize(question);
  return (
    normalizedQuestion.includes('今月') &&
    (
      normalizedQuestion.includes('平均販売額') ||
      normalizedQuestion.includes('平均売上') ||
      normalizedQuestion.includes('1頭あたり') ||
      normalizedQuestion.includes('一頭あたり')
    )
  );
}

function isMonthlySalesSummaryQuestion(question: string) {
  const normalizedQuestion = normalize(question);
  return (
    normalizedQuestion.includes('今月') &&
    (normalizedQuestion.includes('売上') || normalizedQuestion.includes('販売')) &&
    (
      normalizedQuestion.includes('何頭') ||
      normalizedQuestion.includes('何頭で') ||
      normalizedQuestion.includes('いくら')
    )
  );
}

function isOneLineMonthlyComparisonQuestion(question: string) {
  const normalizedQuestion = normalize(question);
  return (
    normalizedQuestion.includes('今月') &&
    normalizedQuestion.includes('先月') &&
    (
      normalizedQuestion.includes('一言') ||
      normalizedQuestion.includes('短く') ||
      normalizedQuestion.includes('ひとこと')
    ) &&
    (
      normalizedQuestion.includes('比べ') ||
      normalizedQuestion.includes('比較')
    )
  );
}

function isOneLineManagementSummaryQuestion(question: string) {
  const normalizedQuestion = normalize(question);
  return (
    normalizedQuestion.includes('今月') &&
    normalizedQuestion.includes('経営') &&
    (
      normalizedQuestion.includes('一言') ||
      normalizedQuestion.includes('短くまとめ') ||
      normalizedQuestion.includes('ひとことで')
    )
  );
}

function isMonthlyCautionQuestion(question: string) {
  const normalizedQuestion = normalize(question);
  return (
    normalizedQuestion.includes('今月') &&
    (
      normalizedQuestion.includes('注意点') ||
      normalizedQuestion.includes('注意すること') ||
      normalizedQuestion.includes('気をつける')
    )
  );
}

function isImprovementQuestion(question: string) {
  const normalizedQuestion = normalize(question);
  return (
    normalizedQuestion.includes('改善') ||
    normalizedQuestion.includes('見直すなら') ||
    normalizedQuestion.includes('見直すとしたら')
  );
}

function isTopExpenseQuestion(question: string) {
  const normalizedQuestion = normalize(question);
  return (
    (normalizedQuestion.includes('一番') || normalizedQuestion.includes('最も')) &&
    (
      normalizedQuestion.includes('お金') ||
      normalizedQuestion.includes('経費') ||
      normalizedQuestion.includes('費用')
    )
  );
}

function isMonthlyComparisonQuestion(question: string) {
  const normalizedQuestion = normalize(question);
  return (
    normalizedQuestion.includes('先月') ||
    normalizedQuestion.includes('前月比') ||
    normalizedQuestion.includes('前月と比べ') ||
    isOneLineMonthlyComparisonQuestion(question)
  );
}

function isMonthlyBalanceQuestion(question: string) {
  const normalizedQuestion = normalize(question);
  return (
    (
      normalizedQuestion.includes('今月') &&
      (normalizedQuestion.includes('収支') || normalizedQuestion.includes('経営'))
    ) ||
    isMonthlyComparisonQuestion(question) ||
    isTopExpenseQuestion(question) ||
    isImprovementQuestion(question) ||
    isMonthlyCautionQuestion(question) ||
    isOneLineManagementSummaryQuestion(question) ||
    isMonthlySalesSummaryQuestion(question) ||
    isAverageSaleAmountQuestion(question) ||
    isPreviousAverageSaleAmountQuestion(question) ||
    isSalesCountDifferenceQuestion(question) ||
    isSalesAmountDifferenceQuestion(question) ||
    isSalesPercentDifferenceQuestion(question)
  );
}

function previousYearMonth(yearMonth: string) {
  const [yearText, monthText] = yearMonth.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return '';

  const date = new Date(Date.UTC(year, month - 2, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function isLatestHeatQuestion(question: string) {
  const normalizedQuestion = normalize(question);
  const asksHeat = normalizedQuestion.includes('発情');
  const asksLatest =
    normalizedQuestion.includes('最終') ||
    normalizedQuestion.includes('直近') ||
    normalizedQuestion.includes('前回') ||
    normalizedQuestion.includes('最後');
  return asksHeat && asksLatest;
}

function isLastYearServiceCountQuestion(question: string) {
  const normalizedQuestion = normalize(question);
  const asksLastYear = normalizedQuestion.includes('去年') || normalizedQuestion.includes('昨年');
  const asksService = normalizedQuestion.includes('種付') || normalizedQuestion.includes('授精');
  const asksCount = normalizedQuestion.includes('回数') || normalizedQuestion.includes('何回');
  return asksLastYear && asksService && asksCount;
}

function isCattleBreedingSummaryQuestion(question: string) {
  const normalizedQuestion = normalize(question);
  return (
    normalizedQuestion.includes('今') &&
    (
      normalizedQuestion.includes('状況') ||
      normalizedQuestion.includes('状態')
    ) &&
    (
      normalizedQuestion.includes('教えて') ||
      normalizedQuestion.includes('まとめ') ||
      normalizedQuestion.includes('どうなって')
    )
  );
}

function isLatestCalvingQuestion(question: string) {
  const normalizedQuestion = normalize(question);
  const asksCalving = normalizedQuestion.includes('分娩') || normalizedQuestion.includes('出産');
  const asksLatest = normalizedQuestion.includes('前回') || normalizedQuestion.includes('直近') || normalizedQuestion.includes('最後');
  return asksCalving && asksLatest;
}

function isFutureCalvingWindowQuestion(question: string) {
  const normalizedQuestion = normalize(question);
  const asksCalving = normalizedQuestion.includes('分娩') || normalizedQuestion.includes('出産');
  if (!asksCalving) return false;

  return (
    normalizedQuestion.includes('次の分娩') ||
    normalizedQuestion.includes('次の出産') ||
    normalizedQuestion.includes('一か月先') ||
    normalizedQuestion.includes('1か月先') ||
    normalizedQuestion.includes('１か月先') ||
    normalizedQuestion.includes('来月') ||
    normalizedQuestion.includes('二か月先') ||
    normalizedQuestion.includes('2か月先') ||
    normalizedQuestion.includes('２か月先') ||
    normalizedQuestion.includes('再来月')
  );
}

function isLastYearCalvingCountQuestion(question: string) {
  const normalizedQuestion = normalize(question);
  const asksLastYear = normalizedQuestion.includes('去年') || normalizedQuestion.includes('昨年');
  const asksCalving = normalizedQuestion.includes('分娩') || normalizedQuestion.includes('出産');
  const asksCount = normalizedQuestion.includes('回数') || normalizedQuestion.includes('何回');
  return asksLastYear && asksCalving && asksCount;
}

function isExpectedCalvingDateQuestion(question: string) {
  const normalizedQuestion = normalize(question);
  return (
    normalizedQuestion.includes('分娩予定日') ||
    normalizedQuestion.includes('出産予定日')
  );
}

function isLatestPregnancyCheckQuestion(question: string) {
  const normalizedQuestion = normalize(question);
  const asksCheck = normalizedQuestion.includes('妊娠鑑定') || normalizedQuestion.includes('妊鑑');
  const asksLatest = normalizedQuestion.includes('直近') || normalizedQuestion.includes('前回') || normalizedQuestion.includes('最後');
  return asksCheck && asksLatest;
}

function isCattleBasicInfoQuestion(question: string) {
  const normalizedQuestion = normalize(question);
  return (
    normalizedQuestion.includes('生年月日') ||
    normalizedQuestion.includes('種雄牛') ||
    normalizedQuestion.includes('父牛') ||
    normalizedQuestion.includes('産次') ||
    normalizedQuestion.includes('何産')
  );
}

function isNearShippingCalvesQuestion(question: string) {
  const normalizedQuestion = normalize(question);
  return (
    normalizedQuestion.includes('子牛') &&
    (
      normalizedQuestion.includes('300日未満') ||
      normalizedQuestion.includes('出荷が近い') ||
      normalizedQuestion.includes('出荷候補') ||
      normalizedQuestion.includes('市場出荷')
    )
  );
}

function isRecentCalvesQuestion(question: string) {
  const normalizedQuestion = normalize(question);
  return (
    normalizedQuestion.includes('子牛') &&
    (
      normalizedQuestion.includes('最近生まれ') ||
      normalizedQuestion.includes('最近の子牛') ||
      normalizedQuestion.includes('生まれた子牛')
    )
  );
}

function isAttentionCattleQuestion(question: string) {
  const normalizedQuestion = normalize(question);
  return (
    normalizedQuestion.includes('注意') &&
    normalizedQuestion.includes('牛')
  );
}

function isTodayFieldTasksQuestion(question: string) {
  const normalizedQuestion = normalize(question);
  return (
    normalizedQuestion.includes('今日') &&
    (
      normalizedQuestion.includes('何をすれば') ||
      normalizedQuestion.includes('やること') ||
      normalizedQuestion.includes('対応') ||
      normalizedQuestion.includes('作業')
    )
  );
}

function isFirstFarmDataQuestion(question: string) {
  const normalizedQuestion = normalize(question);
  const asksInsemination = normalizedQuestion.includes('授精') || normalizedQuestion.includes('受精') || normalizedQuestion.includes('種付');
  const asksPrevious = normalizedQuestion.includes('前回') || normalizedQuestion.includes('最後') || normalizedQuestion.includes('直近');
  const asksBreedingStage =
    (normalizedQuestion.includes('繁殖') && (normalizedQuestion.includes('段階') || normalizedQuestion.includes('状態'))) ||
    normalizedQuestion.includes('今どの段階') ||
    normalizedQuestion.includes('今どんな段階');
  const asksWeeklyTasks =
    (normalizedQuestion.includes('今週') || normalizedQuestion.includes('7日以内') || normalizedQuestion.includes('近日')) &&
    (normalizedQuestion.includes('対応') || normalizedQuestion.includes('予定') || normalizedQuestion.includes('やること') || normalizedQuestion.includes('作業')) &&
    (normalizedQuestion.includes('牛') || normalizedQuestion.includes('繁殖'));
  const asksNearCalvings =
    (normalizedQuestion.includes('分娩') || normalizedQuestion.includes('出産')) &&
    (normalizedQuestion.includes('近い') || normalizedQuestion.includes('もうすぐ') || normalizedQuestion.includes('60日以内')) &&
    (normalizedQuestion.includes('牛') || normalizedQuestion.includes('母牛'));
  const asksWithdrawalCattle =
    normalizedQuestion.includes('休薬') &&
    (normalizedQuestion.includes('牛') || normalizedQuestion.includes('個体') || normalizedQuestion.includes('いる'));
  const asksMonthlySalesProfit =
    normalizedQuestion.includes('今月') &&
    (normalizedQuestion.includes('売った') || normalizedQuestion.includes('販売') || normalizedQuestion.includes('売却')) &&
    (normalizedQuestion.includes('利益') || normalizedQuestion.includes('儲け')) &&
    (normalizedQuestion.includes('牛') || normalizedQuestion.includes('個体'));
  return (asksInsemination && asksPrevious) || asksBreedingStage || asksWeeklyTasks || asksNearCalvings || asksWithdrawalCattle || asksMonthlySalesProfit || isTodayFieldTasksQuestion(question) || isAttentionCattleQuestion(question) || isRecentCalvesQuestion(question) || isNearShippingCalvesQuestion(question) || isCattleBreedingSummaryQuestion(question) || isLastYearServiceCountQuestion(question) || isLastYearCalvingCountQuestion(question) || isFutureCalvingWindowQuestion(question) || isLatestHeatQuestion(question) || isLatestCalvingQuestion(question) || isExpectedCalvingDateQuestion(question) || isLatestPregnancyCheckQuestion(question) || isCattleBasicInfoQuestion(question) || isMonthlyBalanceQuestion(question);
}

function splitAnswerSteps(answer: string) {
  return answer
    .split('。')
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .map((sentence) => `${sentence}。`);
}

function findGuide(question: string): FarmProAiHelpGuide | null {
  const normalizedQuestion = normalize(question);
  if (!normalizedQuestion) return null;

  if (normalizedQuestion.includes('ワクチン') || normalizedQuestion.includes('予防接種')) return vaccineGuide;
  if (normalizedQuestion.includes('治療') || normalizedQuestion.includes('投薬') || normalizedQuestion.includes('休薬')) return treatmentGuide;
  if (normalizedQuestion.includes('取得原価') && (normalizedQuestion.includes('何産') || normalizedQuestion.includes('配分') || normalizedQuestion.includes('8産') || normalizedQuestion.includes('分け'))) return acquisitionCostGuide;
  if (normalizedQuestion.includes('頭数') && (normalizedQuestion.includes('均等') || normalizedQuestion.includes('在籍日数') || normalizedQuestion.includes('どっち'))) return allocationMethodGuide;
  if (normalizedQuestion.includes('在籍日数') && (normalizedQuestion.includes('意味') || normalizedQuestion.includes('違い') || normalizedQuestion.includes('どっち') || normalizedQuestion.includes('分け'))) return allocationMethodGuide;
  if (normalizedQuestion.includes('月ごと') && (normalizedQuestion.includes('年ごと') || normalizedQuestion.includes('違い') || normalizedQuestion.includes('どっち') || normalizedQuestion.includes('意味'))) return allocationPeriodGuide;
  if (normalizedQuestion.includes('年ごと') && (normalizedQuestion.includes('月ごと') || normalizedQuestion.includes('違い') || normalizedQuestion.includes('どっち') || normalizedQuestion.includes('意味'))) return allocationPeriodGuide;
  if (normalizedQuestion.includes('どの期間で計算')) return allocationPeriodGuide;
  if (normalizedQuestion.includes('どの牛に分け') || (normalizedQuestion.includes('全頭') && (normalizedQuestion.includes('繁殖牛') || normalizedQuestion.includes('子牛') || normalizedQuestion.includes('違い'))) || (normalizedQuestion.includes('繁殖牛') && normalizedQuestion.includes('子牛') && normalizedQuestion.includes('違い'))) return allocationTargetGuide;
  if ((normalizedQuestion.includes('含める') && normalizedQuestion.includes('含めない')) || (normalizedQuestion.includes('経費') && (normalizedQuestion.includes('含める') || normalizedQuestion.includes('含めない') || normalizedQuestion.includes('個体別生産費')))) return expenseIncludeGuide;

  if (normalizedQuestion === '発情') return farmProAiHelpGuides.find((guide) => guide.id === 'heat-create') ?? null;

  let best: { guide: FarmProAiHelpGuide; score: number } | null = null;
  for (const guide of farmProAiHelpGuides) {
    let score = 0;
    const normalizedTitle = normalize(guide.title);
    if (normalizedQuestion.includes(normalizedTitle) || normalizedTitle.includes(normalizedQuestion)) score = Math.max(score, 80);
    for (const intent of guide.intents) {
      const normalizedIntent = normalize(intent);
      if (normalizedQuestion === normalizedIntent) score = Math.max(score, 100);
      else if (normalizedQuestion.includes(normalizedIntent) || normalizedIntent.includes(normalizedQuestion)) score = Math.max(score, 70);
      else {
        const keywords = normalizedIntent.match(/農場名|代表者|担当者|電話|住所|設定|発情周期|周期|経費|配分|通知|アラート|アカウント|メール|プラン|牛|登録|発情|人工授精|授精|種付|et|受精卵移植|移植|妊娠鑑定|分娩|子牛|マスター|バックアップ|飼料|在庫|給与|生産費|利益|取得原価|何産|頭数|均等|在籍日数|月ごと|年ごと|期間|全頭|繁殖牛|含める|含めない/g) ?? [];
        const matched = keywords.filter((keyword) => normalizedQuestion.includes(keyword)).length;
        score = Math.max(score, matched * 10);
      }
    }
    if (!best || score > best.score) best = { guide, score };
  }
  return best && best.score >= 20 ? best.guide : null;
}

export function AiHelpPage() {
  const [searchParams] = useSearchParams();
  const entryMode = searchParams.get('mode') === 'record' ? 'record' : 'ask';
  const isRecordMode = entryMode === 'record';
  const prefill = searchParams.get('prefill') || '';
  const [question, setQuestion] = useState(prefill);
  const [followUpQuestion, setFollowUpQuestion] = useState('');
  const [submittedQuestion, setSubmittedQuestion] = useState('');
  const [guide, setGuide] = useState<FarmProAiHelpGuide | null>(null);
  const [registrationIntent, setRegistrationIntent] = useState<FarmProAiRegistrationIntent | null>(null);
  const [registrationCattle, setRegistrationCattle] = useState<{ earTag: string; name: string } | null>(null);
  const [registrationFeedTarget, setRegistrationFeedTarget] = useState<FeedAllocationTargetAnimal | null>(null);
  const [registrationFeedCandidates, setRegistrationFeedCandidates] = useState<FeedAllocationTargetAnimal[]>([]);
  const [registrationFeedInboundTotalPrice, setRegistrationFeedInboundTotalPrice] = useState('');
  const [registrationFeedInboundBagWeightKg, setRegistrationFeedInboundBagWeightKg] = useState('');
  const [registrationLookupError, setRegistrationLookupError] = useState('');
  const [registrationHeatDate, setRegistrationHeatDate] = useState('');
  const [registrationInseminationDate, setRegistrationInseminationDate] = useState('');
  const [registrationTransferDate, setRegistrationTransferDate] = useState('');
  const [registrationPregnancyCheckDate, setRegistrationPregnancyCheckDate] = useState('');
  const [registrationCalvingDate, setRegistrationCalvingDate] = useState('');
  const [registrationCalvingResult, setRegistrationCalvingResult] = useState('');
  const [registrationCalfEarTag, setRegistrationCalfEarTag] = useState('');
  const [registrationCalfSex, setRegistrationCalfSex] = useState('');
  const [registrationBirthWeightKg, setRegistrationBirthWeightKg] = useState('');
  const [registrationPregnancyResult, setRegistrationPregnancyResult] = useState('');
  const [registrationRecheckExpectedDate, setRegistrationRecheckExpectedDate] = useState('');
  const [registrationEmbryoNumber, setRegistrationEmbryoNumber] = useState('');
  const [registrationDonorCowName, setRegistrationDonorCowName] = useState('');
  const [registrationEmbryoSireName, setRegistrationEmbryoSireName] = useState('');
  const [registrationEmbryoSireMasterId, setRegistrationEmbryoSireMasterId] = useState<number | undefined>(undefined);
  const [registrationTransferTechnician, setRegistrationTransferTechnician] = useState('');
  const [registrationTransferTechnicianMasterId, setRegistrationTransferTechnicianMasterId] = useState<number | undefined>(undefined);
  const [registrationBullName, setRegistrationBullName] = useState('');
  const [registrationBullMasterId, setRegistrationBullMasterId] = useState<number | undefined>(undefined);
  const [registrationInseminatorName, setRegistrationInseminatorName] = useState('');
  const [registrationEstrusType, setRegistrationEstrusType] = useState('');
  const [registrationEstrusSigns, setRegistrationEstrusSigns] = useState<string[]>([]);
  const [registrationNote, setRegistrationNote] = useState('');
  const [registrationTreatmentMedicine, setRegistrationTreatmentMedicine] = useState('');
  const [registrationTreatmentMedicineOption, setRegistrationTreatmentMedicineOption] = useState<MedicineOption | null>(null);
  const [registrationTreatmentWithdrawalEndDate, setRegistrationTreatmentWithdrawalEndDate] = useState('');
  const [registrationTreatmentMedicineCost, setRegistrationTreatmentMedicineCost] = useState('');
  const [registrationTreatmentMedicalFee, setRegistrationTreatmentMedicalFee] = useState('');
  const [registrationVaccinationDate, setRegistrationVaccinationDate] = useState('');
  const [registrationVaccineName, setRegistrationVaccineName] = useState('');
  const [registrationVaccineNextDueDate, setRegistrationVaccineNextDueDate] = useState('');
  const [registrationVaccineCost, setRegistrationVaccineCost] = useState('');
  const [registrationSaving, setRegistrationSaving] = useState(false);
  const [registrationSaveError, setRegistrationSaveError] = useState('');
  const [registrationCalendarOpen, setRegistrationCalendarOpen] = useState(false);
  const [registrationCalendarMonth, setRegistrationCalendarMonth] = useState(() => {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    return `${now.getFullYear()}-${month}`;
  });
  const [registrationStep, setRegistrationStep] = useState<'idle' | 'confirm-date' | 'confirm-estrus-type' | 'confirm-calving-result' | 'confirm-calf-info' | 'confirm-calf-sex' | 'confirm-calf-weight' | 'confirm-pregnancy-result' | 'confirm-recheck-date' | 'confirm-bull' | 'confirm-embryo-number' | 'confirm-donor' | 'confirm-embryo-sire' | 'confirm-transfer-technician' | 'confirm-inseminator' | 'confirm-signs' | 'confirm-note' | 'confirm-medicine' | 'confirm-treatment-costs' | 'confirm-vaccine' | 'confirm-vaccine-next-date' | 'confirm-vaccine-cost' | 'review' | 'complete'>('idle');
  const [searched, setSearched] = useState(false);
  const [farmAiAnswer, setFarmAiAnswer] = useState('');
  const [farmAiError, setFarmAiError] = useState('');
  const [askingFarmAi, setAskingFarmAi] = useState(false);
  const previousEntryModeRef = useRef(entryMode);

  useEffect(() => {
    if (previousEntryModeRef.current === entryMode) return;
    previousEntryModeRef.current = entryMode;

    setQuestion(prefill);
    setFollowUpQuestion('');
    setSubmittedQuestion('');
    setGuide(null);
    setRegistrationIntent(null);
    setRegistrationCattle(null);
    setRegistrationFeedTarget(null);
    setRegistrationFeedCandidates([]);
    setRegistrationFeedInboundTotalPrice('');
    setRegistrationFeedInboundBagWeightKg('');
    setRegistrationLookupError('');
    setRegistrationHeatDate('');
    setRegistrationInseminationDate('');
    setRegistrationTransferDate('');
    setRegistrationPregnancyCheckDate('');
    setRegistrationCalvingDate('');
    setRegistrationCalvingResult('');
    setRegistrationCalfEarTag('');
    setRegistrationCalfSex('');
    setRegistrationBirthWeightKg('');
    setRegistrationPregnancyResult('');
    setRegistrationRecheckExpectedDate('');
    setRegistrationEmbryoNumber('');
    setRegistrationDonorCowName('');
    setRegistrationEmbryoSireName('');
    setRegistrationEmbryoSireMasterId(undefined);
    setRegistrationTransferTechnician('');
    setRegistrationTransferTechnicianMasterId(undefined);
    setRegistrationBullName('');
    setRegistrationBullMasterId(undefined);
    setRegistrationInseminatorName('');
    setRegistrationEstrusType('');
    setRegistrationEstrusSigns([]);
    setRegistrationNote('');
    setRegistrationTreatmentMedicine('');
    setRegistrationTreatmentMedicineOption(null);
    setRegistrationTreatmentWithdrawalEndDate('');
    setRegistrationTreatmentMedicineCost('');
    setRegistrationTreatmentMedicalFee('');
    setRegistrationVaccinationDate('');
    setRegistrationVaccineName('');
    setRegistrationVaccineNextDueDate('');
    setRegistrationVaccineCost('');
    setRegistrationSaving(false);
    setRegistrationSaveError('');
    setRegistrationCalendarOpen(false);
    setRegistrationStep('idle');
    setSearched(false);
    setFarmAiAnswer('');
    setFarmAiError('');
    setAskingFarmAi(false);
  }, [entryMode, prefill]);

  const notes = useMemo(() => guide?.notes ?? [], [guide]);
  const answerSteps = useMemo(() => (guide ? splitAnswerSteps(guide.answer) : []), [guide]);
  const routeLabel = guide ? (routeLabels[guide.route] ?? guide.title) : '';
  const plan = getStoredAuthUser()?.plan ?? 'free';
  const isFreePlan = plan === 'free';
  const canUseFarmAi = plan === 'standard' || plan === 'pro';

  const ask = async (nextQuestion: string) => {
    const trimmed = nextQuestion.trim();
    const nextRegistrationIntent = parseRegistrationIntent(trimmed, { recordMode: isRecordMode });
    const nextGuide = nextRegistrationIntent ? null : findGuide(trimmed);
    setQuestion(trimmed);
    setSubmittedQuestion(trimmed);
    setRegistrationIntent(nextRegistrationIntent);
    if (nextRegistrationIntent?.kind === 'feed-inbound') {
      setRegistrationFeedInboundTotalPrice(nextRegistrationIntent.feedTotalPrice || '');
      setRegistrationFeedInboundBagWeightKg(nextRegistrationIntent.feedBagWeightKg || '');
    }
    setRegistrationCattle(null);
    setRegistrationFeedTarget(null);
    setRegistrationFeedCandidates([]);
    setRegistrationFeedInboundTotalPrice('');
    setRegistrationFeedInboundBagWeightKg('');
    setRegistrationLookupError('');
    setRegistrationHeatDate('');
    setRegistrationInseminationDate('');
    setRegistrationTransferDate('');
    setRegistrationPregnancyCheckDate('');
    setRegistrationCalvingDate('');
    setRegistrationCalvingResult('');
    setRegistrationCalfEarTag('');
    setRegistrationCalfSex('');
    setRegistrationBirthWeightKg('');
    setRegistrationPregnancyResult('');
    setRegistrationRecheckExpectedDate('');
    setRegistrationEmbryoNumber('');
    setRegistrationDonorCowName('');
    setRegistrationEmbryoSireName('');
    setRegistrationEmbryoSireMasterId(undefined);
    setRegistrationTransferTechnician('');
    setRegistrationTransferTechnicianMasterId(undefined);
    setRegistrationBullName('');
    setRegistrationBullMasterId(undefined);
    setRegistrationInseminatorName('');
    setRegistrationEstrusType('');
    setRegistrationEstrusSigns([]);
    setRegistrationNote('');
    setRegistrationTreatmentMedicine('');
    setRegistrationTreatmentMedicineOption(null);
    setRegistrationTreatmentWithdrawalEndDate('');
    setRegistrationTreatmentMedicineCost('');
    setRegistrationTreatmentMedicalFee('');
    setRegistrationVaccinationDate('');
    setRegistrationVaccineName('');
    setRegistrationVaccineNextDueDate('');
    setRegistrationVaccineCost('');
    setRegistrationSaving(false);
    setRegistrationSaveError('');
    setRegistrationStep('idle');
    setGuide(nextGuide);
    setSearched(Boolean(trimmed));
    setFollowUpQuestion('');
    setFarmAiAnswer('');
    setFarmAiError('');

    // Voice/registration requests keep the existing guided registration flow.
    // Standard/Pro farm-data questions use the farm AI endpoint.
    if (!nextRegistrationIntent && canUseFarmAi && (isFirstFarmDataQuestion(trimmed) || !nextGuide)) {
      setGuide(null);
      setAskingFarmAi(true);
      try {
        if (isMonthlyBalanceQuestion(trimmed)) {
          const monthly = await getMonthlyBalance();
          const currentMonth = new Date().toLocaleDateString('en-CA', {
            timeZone: 'Asia/Tokyo',
            year: 'numeric',
            month: '2-digit',
          }).slice(0, 7);
          const emptyRow = {
            yearMonth: currentMonth,
            salesTotalAmount: 0,
            salesProductionCostAmount: 0,
            salesProfitAmount: 0,
            expenseTotalAmount: 0,
            balanceAmount: 0,
            salesSoldCount: 0,
            expenseCount: 0,
            expenseFeedAmount: 0,
            expenseMedicalAmount: 0,
            expenseBreedingAmount: 0,
            expenseOtherAmount: 0,
          };
          const row = monthly.rows.find((item) => item.yearMonth === currentMonth) ?? emptyRow;
          const previousMonth = previousYearMonth(currentMonth);
          const previousRow = monthly.rows.find((item) => item.yearMonth === previousMonth) ?? {
            ...emptyRow,
            yearMonth: previousMonth,
          };
          const toAiSummary = (item: typeof row) => ({
            yearMonth: item.yearMonth,
            salesTotalAmount: item.salesTotalAmount,
            salesProductionCostAmount: item.salesProductionCostAmount,
            salesProfitAmount: item.salesProfitAmount,
            expenseTotalAmount: item.expenseTotalAmount,
            balanceAmount: item.balanceAmount,
            salesSoldCount: item.salesSoldCount,
            expenseCount: item.expenseCount,
            expenseFeedAmount: item.expenseFeedAmount,
            expenseMedicalAmount: item.expenseMedicalAmount,
            expenseBreedingAmount: item.expenseBreedingAmount,
            expenseLaborAmount: 0,
            expenseOtherAmount: item.expenseOtherAmount,
          });
          const result = await askMonthlyBalanceAi(
            trimmed,
            toAiSummary(row),
            (
              isMonthlyComparisonQuestion(trimmed) ||
              isPreviousAverageSaleAmountQuestion(trimmed) ||
              isSalesCountDifferenceQuestion(trimmed) ||
              isSalesAmountDifferenceQuestion(trimmed) ||
              isSalesPercentDifferenceQuestion(trimmed)
            ) ? toAiSummary(previousRow) : undefined,
          );
          if (result.handled) {
            setFarmAiAnswer(result.answer || '回答を取得できませんでした。');
            return;
          }
        } else {
          const result = await askFarmAi(trimmed);
          if (result.handled) {
            setFarmAiAnswer(result.answer || '回答を取得できませんでした。');
            return;
          }
          if (!nextGuide) {
            setFarmAiAnswer('この質問にはまだ回答できません。今後の改善のため、未回答の質問として記録しました。');
            return;
          }
        }
      } catch (error) {
        setFarmAiError(error instanceof Error ? error.message : 'Standard AIの回答に失敗しました。');
        return;
      } finally {
        setAskingFarmAi(false);
      }
    }

    if (nextRegistrationIntent?.kind === 'feed-use' && nextRegistrationIntent.feedTargetType === 'individual') {
      try {
        const targetNumber = nextRegistrationIntent.earTag?.trim();
        if (!targetNumber) {
          setRegistrationLookupError('個体番号を確認できませんでした。耳標番号または子牛番号を入力してください。');
        } else {
          const [cattle, calves] = await Promise.all([
            getCattleList().catch(() => []),
            getCalfList().catch(() => []),
          ]);

          const normalizedTargetNumber = normalizeFeedAnimalNumber(targetNumber);

          const cattleMatches: FeedAllocationTargetAnimal[] = cattle
            .filter((item) => normalizeFeedAnimalNumber(item.earTag) === normalizedTargetNumber)
            .map((item) => ({
              animalType: 'cattle' as const,
              animalId: String(item.id),
              earTag: String(item.earTag ?? ''),
              animalName: String(item.name ?? ''),
              weight: 1,
            }));

          const calfMatches: FeedAllocationTargetAnimal[] = calves
            .filter((item) => {
              const displayedTemporaryNumber = formatTemporaryCalfNumber(item.calfNumber, item.birthday);
              const normalizedDisplayedTemporaryNumber = normalizeFeedAnimalNumber(
                displayedTemporaryNumber.replace(/^仮-/, ''),
              );
              return (
                normalizeFeedAnimalNumber(item.calfNumber) === normalizedTargetNumber ||
                normalizeFeedAnimalNumber(item.temporaryCalfNumber) === normalizedTargetNumber ||
                normalizedDisplayedTemporaryNumber === normalizedTargetNumber
              );
            })
            .filter((item) => !['販売済み', '牛台帳へ移行済み', '死亡・その他'].includes(item.managementStatus))
            .map((item) => {
              const displayedNumber = formatTemporaryCalfNumber(item.calfNumber, item.birthday);
              return {
                animalType: 'calf' as const,
                animalId: String(item.id),
                earTag: displayedNumber === '－' ? String(item.calfNumber || item.temporaryCalfNumber || '') : displayedNumber,
                animalName: String(item.name ?? ''),
                motherName: String(item.motherName || item.recipientCowName || item.motherCowName || ''),
                weight: 1,
              };
            });

          const matches = [...cattleMatches, ...calfMatches];
          if (matches.length === 1) {
            setRegistrationFeedTarget(matches[0]);
            setRegistrationFeedCandidates([]);
          } else if (matches.length === 0) {
            setRegistrationFeedCandidates([]);
            setRegistrationLookupError(`番号 ${targetNumber} の牛が見つかりませんでした。`);
          } else {
            setRegistrationFeedCandidates(matches);
            setRegistrationLookupError('');
          }
        }
      } catch {
        setRegistrationLookupError('牛台帳・子牛台帳を確認できませんでした。もう一度お試しください。');
      }
    }

    if (nextRegistrationIntent?.kind === 'heat' || nextRegistrationIntent?.kind === 'insemination' || nextRegistrationIntent?.kind === 'transfer' || nextRegistrationIntent?.kind === 'pregnancy-check' || nextRegistrationIntent?.kind === 'calving' || nextRegistrationIntent?.kind === 'treatment' || nextRegistrationIntent?.kind === 'vaccine') {
      try {
        const cattle = await getCattleList();
        const earTag = nextRegistrationIntent.earTag?.trim();
        const normalizedInput = normalize(trimmed);
        const matches = earTag
          ? cattle.filter((item) => String(item.earTag ?? '').trim() === earTag)
          : cattle.filter((item) => {
              const name = String(item.name ?? '').trim();
              return Boolean(name) && normalizedInput.includes(normalize(name));
            });

        if (matches.length === 1) {
          setRegistrationCattle({
            earTag: String(matches[0].earTag ?? ''),
            name: String(matches[0].name ?? ''),
          });
          setRegistrationStep('confirm-date');
        } else if (matches.length === 0) {
          setRegistrationLookupError(
            earTag
              ? `耳標番号 ${earTag} の牛が見つかりませんでした。`
              : '入力内容から対象牛を特定できませんでした。名号または耳標番号を確認してください。',
          );
        } else {
          setRegistrationLookupError(
            earTag
              ? `耳標番号 ${earTag} の牛が複数見つかりました。牛台帳を確認してください。`
              : '同じ名号の牛が複数見つかりました。耳標番号も入力してください。',
          );
        }
      } catch {
        setRegistrationLookupError('牛台帳を確認できませんでした。もう一度お試しください。');
      }
    }
  };

  const handleQuestionChange = (value: string) => {
    setQuestion(value);

    if (registrationStep === 'complete' && value.trim() !== submittedQuestion.trim()) {
      setSearched(false);
      setRegistrationIntent(null);
      setRegistrationCattle(null);
      setRegistrationFeedTarget(null);
      setRegistrationFeedCandidates([]);
      setRegistrationLookupError('');
      setRegistrationSaveError('');
      setRegistrationStep('idle');
      setGuide(null);
    }
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    void ask(question);
  };

  const handleFollowUpSubmit = (event: FormEvent) => {
    event.preventDefault();
    void ask(followUpQuestion);
  };

  const todayLocalDate = () => {
    const now = new Date();
    const offset = now.getTimezoneOffset();
    return new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 10);
  };

  const saveFeedUseRegistration = async () => {
    if (
      registrationIntent?.kind !== 'feed-use' ||
      !registrationIntent.feedName ||
      !registrationIntent.feedQuantity ||
      !registrationIntent.feedUnit ||
      !registrationIntent.feedTargetType
    ) return;

    setRegistrationSaving(true);
    setRegistrationSaveError('');

    try {
      let bagWeightKg = '';
      let totalWeightKg = '';

      if (registrationIntent.feedUnit === '袋') {
        const rows = await getFeedInventoryList();
        const bagRecord = [...rows]
          .reverse()
          .find((row) =>
            row.feedName.trim() === registrationIntent.feedName?.trim() &&
            row.unit === '袋' &&
            Number(row.bagWeightKg || 0) > 0,
          );

        if (!bagRecord?.bagWeightKg) {
          throw new Error('この飼料は1袋の重量が未登録です。飼料在庫で1袋重量を登録してください。');
        }

        bagWeightKg = bagRecord.bagWeightKg;
        totalWeightKg = String(Number(registrationIntent.feedQuantity) * Number(bagWeightKg));
      }

      const input: FeedInventoryInput = {
        transactionDate: todayLocalDate(),
        feedName: registrationIntent.feedName.trim(),
        transactionType: '出庫',
        quantity: registrationIntent.feedQuantity,
        unit: registrationIntent.feedUnit,
        bagWeightKg,
        totalWeightKg,
        unitPrice: '',
        totalPrice: '',
        supplier: '',
        taxExcludedPrice: '',
        taxAmount: '',
        memo: 'AIで記録から登録',
      };

      if (registrationIntent.feedTargetType === 'individual' && !registrationFeedTarget) {
        throw new Error('対象個体を確認できません。耳標番号または子牛番号を確認してください。');
      }

      const costing = await buildFeedCostingSnapshot(
        input,
        registrationIntent.feedTargetType,
        registrationIntent.feedTargetType === 'individual' ? registrationFeedTarget || undefined : undefined,
      );

      await createFeedInventory({
        ...input,
        costing,
        unitPrice: String(costing.averageUnitCost),
        totalPrice: String(costing.usedCost),
      });

      setRegistrationStep('complete');
    } catch (error) {
      setRegistrationSaveError(error instanceof Error ? error.message : '飼料使用を登録できませんでした。');
    } finally {
      setRegistrationSaving(false);
    }
  };

  const confirmTodayAsHeatDate = () => {
    setRegistrationHeatDate(todayLocalDate());
    setRegistrationStep('confirm-estrus-type');
  };

  const confirmTodayAsInseminationDate = () => {
    setRegistrationInseminationDate(todayLocalDate());
    setRegistrationStep('confirm-bull');
  };

  const confirmTodayAsTransferDate = () => {
    setRegistrationTransferDate(todayLocalDate());
    setRegistrationStep('confirm-embryo-number');
  };

  const confirmTodayAsPregnancyCheckDate = () => {
    setRegistrationPregnancyCheckDate(todayLocalDate());
    setRegistrationStep('confirm-pregnancy-result');
  };

  const confirmTodayAsCalvingDate = () => {
    setRegistrationCalvingDate(todayLocalDate());
    setRegistrationStep('confirm-calving-result');
  };

  const renderRegistrationEntry = ({
    actionLabel,
    titleLabel = actionLabel,
    dateLabel,
    onToday,
    onDateChange,
  }: {
    actionLabel: string;
    titleLabel?: string;
    dateLabel: string;
    onToday: () => void;
    onDateChange: (value: string) => void;
  }) => (
    <>
      <Box>
        <Typography variant="body2" color="text.secondary">登録依頼</Typography>
        <Typography fontWeight={800} sx={{ mt: 0.5 }}>{submittedQuestion}</Typography>
      </Box>
      <Typography variant="h6" fontWeight={900}>{titleLabel}登録を始めます</Typography>
      {registrationCattle ? (
        <Alert severity="success">
          {registrationCattle.earTag} {registrationCattle.name || '名号未登録'}ですね。{actionLabel}を登録します。
        </Alert>
      ) : registrationLookupError ? (
        <Alert severity="warning">{registrationLookupError}</Alert>
      ) : (
        <Alert severity="info">
          耳標番号 {registrationIntent?.earTag} の牛を確認しています。
        </Alert>
      )}
      {registrationCattle && registrationStep === 'confirm-date' && (
        <Stack spacing={1}>
          <Typography fontWeight={800}>{dateLabel}は今日でいいですか？</Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <Button variant="contained" onClick={onToday} fullWidth>
              はい、今日です
            </Button>
            <Button
              variant="outlined"
              onClick={() => {
                const now = new Date();
                const month = String(now.getMonth() + 1).padStart(2, '0');
                setRegistrationCalendarMonth(`${now.getFullYear()}-${month}`);
                setRegistrationCalendarOpen(true);
              }}
              fullWidth
              sx={{ minHeight: 40 }}
            >
              別の日を指定
            </Button>

            <Dialog
              open={registrationCalendarOpen}
              onClose={() => setRegistrationCalendarOpen(false)}
              fullWidth
              maxWidth="xs"
            >
              <DialogTitle>{dateLabel}を選択</DialogTitle>
              <DialogContent>
                <Stack spacing={1.5}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Button
                      variant="outlined"
                      onClick={() => {
                        const [year, month] = registrationCalendarMonth.split('-').map(Number);
                        const prev = new Date(year, month - 2, 1);
                        setRegistrationCalendarMonth(
                          `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`,
                        );
                      }}
                      sx={{ minWidth: 72 }}
                    >
                      前月
                    </Button>
                    <Typography fontWeight={800} textAlign="center" sx={{ flex: 1 }}>
                      {(() => {
                        const [year, month] = registrationCalendarMonth.split('-');
                        return `${year}年${Number(month)}月`;
                      })()}
                    </Typography>
                    <Button
                      variant="outlined"
                      onClick={() => {
                        const [year, month] = registrationCalendarMonth.split('-').map(Number);
                        const next = new Date(year, month, 1);
                        setRegistrationCalendarMonth(
                          `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`,
                        );
                      }}
                      sx={{ minWidth: 72 }}
                    >
                      翌月
                    </Button>
                  </Stack>

                  <Box
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(7, 1fr)',
                      gap: 0.5,
                    }}
                  >
                    {['日', '月', '火', '水', '木', '金', '土'].map((weekday) => (
                      <Typography
                        key={weekday}
                        variant="caption"
                        fontWeight={800}
                        textAlign="center"
                        sx={{ py: 0.5 }}
                      >
                        {weekday}
                      </Typography>
                    ))}
                    {(() => {
                      const [year, month] = registrationCalendarMonth.split('-').map(Number);
                      const firstWeekday = new Date(year, month - 1, 1).getDay();
                      const daysInMonth = new Date(year, month, 0).getDate();
                      return [
                        ...Array.from({ length: firstWeekday }, (_, index) => (
                          <Box key={`blank-${index}`} />
                        )),
                        ...Array.from({ length: daysInMonth }, (_, index) => {
                          const day = index + 1;
                          const selectedDate = `${registrationCalendarMonth}-${String(day).padStart(2, '0')}`;
                          return (
                            <Button
                              key={selectedDate}
                              variant="text"
                              onClick={() => {
                                onDateChange(selectedDate);
                                setRegistrationCalendarOpen(false);
                              }}
                              sx={{
                                minWidth: 0,
                                width: '100%',
                                aspectRatio: '1 / 1',
                                p: 0,
                                fontWeight: 700,
                              }}
                            >
                              {day}
                            </Button>
                          );
                        }),
                      ];
                    })()}
                  </Box>

                  <Button
                    variant="text"
                    onClick={() => setRegistrationCalendarOpen(false)}
                  >
                    キャンセル
                  </Button>
                </Stack>
              </DialogContent>
            </Dialog>
          </Stack>
        </Stack>
      )}
    </>
  );

  const calculateTreatmentWithdrawalEndDate = (dateText: string, medicine: MedicineOption | null) => {
    if (!dateText || !medicine || medicine.autoCalculateWithdrawal === false || medicine.meatWithdrawalDays === undefined) {
      return '';
    }
    const [year, month, day] = dateText.split('-').map(Number);
    if (!year || !month || !day) return '';
    const date = new Date(year, month - 1, day);
    date.setDate(date.getDate() + medicine.meatWithdrawalDays);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const saveVaccineRegistration = async () => {
    if (!registrationCattle || !registrationVaccinationDate || !registrationVaccineName.trim()) return;

    setRegistrationSaving(true);
    setRegistrationSaveError('');

    try {
      const savedVaccine = await createVaccine({
        targetType: '成牛',
        targetNumber: registrationCattle.earTag,
        targetName: registrationCattle.name,
        vaccineName: registrationVaccineName.trim(),
        vaccineCost: registrationVaccineCost.trim(),
        vaccinationDate: registrationVaccinationDate,
        nextDueDate: registrationVaccineNextDueDate,
        status: '接種済み',
        note: '',
      });

      const vaccineCost = Number(registrationVaccineCost || 0);
      if (Number.isFinite(vaccineCost) && vaccineCost > 0) {
        await upsertExpenseBySource({
          paymentDate: registrationVaccinationDate,
          category: '医薬品費',
          expenseCategoryMasterId: undefined,
          description: `ワクチン：${registrationVaccineName.trim()}`,
          vendor: '',
          vendorMasterId: undefined,
          amount: String(vaccineCost),
          paymentMethod: '',
          target: `${registrationCattle.earTag} ${registrationCattle.name}`.trim(),
          animalType: 'cattle',
          animalId: undefined,
          animalEarTag: registrationCattle.earTag,
          animalName: registrationCattle.name,
          sourceType: 'vaccine',
          sourceId: String(savedVaccine.id),
          memo: `ワクチン記録から自動作成（ワクチン記録ID: ${savedVaccine.id}）`,
        });
      }

      setRegistrationStep('complete');
    } catch (error) {
      setRegistrationSaveError(error instanceof Error ? error.message : 'ワクチンを登録できませんでした。');
    } finally {
      setRegistrationSaving(false);
    }
  };

  const saveTreatmentRegistration = async () => {
    if (!registrationCattle || !registrationHeatDate || !registrationNote.trim()) return;

    setRegistrationSaving(true);
    setRegistrationSaveError('');

    try {
      const savedTreatment = await createTreatment({
        recordType: '治療',
        breedingTreatmentType: '',
        targetNumber: registrationCattle.earTag,
        targetName: registrationCattle.name,
        symptom: registrationNote.trim(),
        diagnosis: '',
        diseaseMasterId: undefined,
        treatmentProcedure: '',
        treatmentProcedureMasterId: undefined,
        hoofAbnormality: '',
        nextScheduledDate: '',
        treatmentDate: registrationHeatDate,
        medicine: registrationTreatmentMedicine.trim(),
        dosage: '',
        medicineCost: registrationTreatmentMedicineCost.trim(),
        medicalFee: registrationTreatmentMedicalFee.trim(),
        withdrawalEndDate: registrationTreatmentWithdrawalEndDate,
        veterinarian: '',
        progress: '治療中',
        note: '',
        sourceScheduleId: undefined,
        synchronizationProgramId: undefined,
        synchronizationProgramName: undefined,
      });

      const sourceId = String(savedTreatment.id);
      const commonExpense = {
        paymentDate: registrationHeatDate,
        expenseCategoryMasterId: undefined,
        vendor: '',
        vendorMasterId: undefined,
        paymentMethod: '',
        target: `${registrationCattle.earTag} ${registrationCattle.name}`.trim(),
        animalType: 'cattle' as const,
        animalId: undefined,
        animalEarTag: registrationCattle.earTag,
        animalName: registrationCattle.name,
        sourceType: 'treatment' as const,
        sourceId,
        memo: `AI治療登録から自動作成（治療記録ID: ${sourceId}）`,
      };

      const medicineCost = Number(registrationTreatmentMedicineCost || 0);
      if (Number.isFinite(medicineCost) && medicineCost > 0) {
        await upsertExpenseBySource({
          ...commonExpense,
          category: '医薬品費',
          description: registrationTreatmentMedicine
            ? `治療薬品：${registrationTreatmentMedicine}`
            : '治療薬品費',
          amount: String(medicineCost),
        });
      }

      const medicalFee = Number(registrationTreatmentMedicalFee || 0);
      if (Number.isFinite(medicalFee) && medicalFee > 0) {
        await upsertExpenseBySource({
          ...commonExpense,
          category: '診療費',
          description: '診療費',
          amount: String(medicalFee),
        });
      }

      setRegistrationStep('complete');
    } catch (error) {
      setRegistrationSaveError(error instanceof Error ? error.message : '治療を登録できませんでした。');
    } finally {
      setRegistrationSaving(false);
    }
  };

  const saveHeatRegistration = async () => {
    if (!registrationCattle || !registrationHeatDate || !registrationEstrusType) return;

    setRegistrationSaving(true);
    setRegistrationSaveError('');

    try {
      await createBreeding({
        cowEarTag: registrationCattle.earTag,
        cowName: registrationCattle.name,
        heatDate: registrationHeatDate,
        estrusType: registrationEstrusType as '自然発情' | '繁殖治療による発情',
        breedingMethod: '未選択',
        breedingStatus: '発情確認',
        inseminationDate: '',
        bullName: '',
        bullMasterId: undefined,
        inseminatorName: '',
        inseminatorMasterId: undefined,
        transferPlannedDate: '',
        transferDate: '',
        transferCost: '',
        transferCancelReason: '',
        embryoNumber: '',
        collectionDate: '',
        embryoType: '未選択',
        donorCowName: '',
        donorCowEarTag: '',
        embryoSireName: '',
        embryoSireMasterId: undefined,
        embryoGrade: '',
        strawNumber: '',
        supplierName: '',
        supplierMasterId: undefined,
        transferTechnician: '',
        transferTechnicianMasterId: undefined,
        nextHeatExpectedDate: '',
        pregnancyCheckExpectedDate: '',
        pregnancyCheckDate: '',
        pregnancyCheckCost: '',
        pregnancyResult: '未鑑定',
        recheckExpectedDate: '',
        expectedCalvingDate: '',
        estrusSigns: registrationEstrusSigns,
        estrusSignsOther: '',
        synchronizationProgramId: undefined,
        synchronizationProgramName: undefined,
        sourceScheduleId: undefined,
        note: registrationNote,
      });
      setRegistrationStep('complete');
    } catch (error) {
      setRegistrationSaveError(error instanceof Error ? error.message : '発情を登録できませんでした。');
    } finally {
      setRegistrationSaving(false);
    }
  };

  const saveInseminationRegistration = async () => {
    if (!registrationCattle || !registrationInseminationDate || !registrationBullName.trim()) return;

    setRegistrationSaving(true);
    setRegistrationSaveError('');

    try {
      const settings = await getFarmSettings();
      const cycleDays = settings.estrousCycleDays || 21;

      await createBreeding({
        cowEarTag: registrationCattle.earTag,
        cowName: registrationCattle.name,
        heatDate: '',
        estrusType: '',
        breedingMethod: '種付',
        breedingStatus: '種付実施',
        inseminationDate: registrationInseminationDate,
        inseminationCost: '',
        bullName: registrationBullName.trim(),
        bullMasterId: registrationBullMasterId,
        inseminatorName: registrationInseminatorName.trim(),
        inseminatorMasterId: undefined,
        transferPlannedDate: '',
        transferDate: '',
        transferCost: '',
        transferCancelReason: '',
        embryoNumber: '',
        collectionDate: '',
        embryoType: '未選択',
        donorCowName: '',
        donorCowEarTag: '',
        embryoSireName: '',
        embryoSireMasterId: undefined,
        embryoGrade: '',
        strawNumber: '',
        supplierName: '',
        supplierMasterId: undefined,
        transferTechnician: '',
        transferTechnicianMasterId: undefined,
        nextHeatExpectedDate: calculateNextHeatExpectedDate(registrationInseminationDate, cycleDays),
        pregnancyCheckExpectedDate: calculatePregnancyCheckExpectedDate(registrationInseminationDate, cycleDays),
        pregnancyCheckDate: '',
        pregnancyCheckCost: '',
        pregnancyResult: '未鑑定',
        recheckExpectedDate: '',
        expectedCalvingDate: calculateExpectedCalvingDate(registrationInseminationDate),
        estrusSigns: [],
        estrusSignsOther: '',
        synchronizationProgramId: undefined,
        synchronizationProgramName: undefined,
        sourceScheduleId: undefined,
        note: registrationNote,
      });
      setRegistrationStep('complete');
    } catch (error) {
      setRegistrationSaveError(error instanceof Error ? error.message : '授精を登録できませんでした。');
    } finally {
      setRegistrationSaving(false);
    }
  };

  const saveTransferRegistration = async () => {
    if (!registrationCattle || !registrationTransferDate) return;

    setRegistrationSaving(true);
    setRegistrationSaveError('');

    try {
      const settings = await getFarmSettings();
      const cycleDays = settings.estrousCycleDays || 21;

      await createBreeding({
        cowEarTag: registrationCattle.earTag,
        cowName: registrationCattle.name,
        heatDate: '',
        estrusType: '',
        breedingMethod: '受精卵移植',
        breedingStatus: '移植実施',
        inseminationDate: '',
        inseminationCost: '',
        bullName: '',
        bullMasterId: undefined,
        inseminatorName: '',
        inseminatorMasterId: undefined,
        transferPlannedDate: '',
        transferDate: registrationTransferDate,
        transferCost: '',
        transferCancelReason: '',
        embryoNumber: registrationEmbryoNumber.trim(),
        collectionDate: '',
        embryoType: '未選択',
        donorCowName: registrationDonorCowName.trim(),
        donorCowEarTag: '',
        embryoSireName: registrationEmbryoSireName.trim(),
        embryoSireMasterId: registrationEmbryoSireMasterId,
        embryoGrade: '',
        strawNumber: '',
        supplierName: '',
        supplierMasterId: undefined,
        transferTechnician: registrationTransferTechnician.trim(),
        transferTechnicianMasterId: registrationTransferTechnicianMasterId,
        nextHeatExpectedDate: calculateNextHeatExpectedDate(registrationTransferDate, cycleDays),
        pregnancyCheckExpectedDate: calculatePregnancyCheckExpectedDate(registrationTransferDate, cycleDays),
        pregnancyCheckDate: '',
        pregnancyCheckCost: '',
        pregnancyResult: '未鑑定',
        recheckExpectedDate: '',
        expectedCalvingDate: calculateExpectedCalvingDate(registrationTransferDate),
        estrusSigns: [],
        estrusSignsOther: '',
        synchronizationProgramId: undefined,
        synchronizationProgramName: undefined,
        sourceScheduleId: undefined,
        note: registrationNote,
      });
      setRegistrationStep('complete');
    } catch (error) {
      setRegistrationSaveError(error instanceof Error ? error.message : '受精卵移植を登録できませんでした。');
    } finally {
      setRegistrationSaving(false);
    }
  };

  const savePregnancyCheckRegistration = async () => {
    if (!registrationCattle || !registrationPregnancyCheckDate || !registrationPregnancyResult) return;

    setRegistrationSaving(true);
    setRegistrationSaveError('');

    try {
      const records = await getBreedingList();
      const candidates = records
        .filter((record) => {
          if (String(record.cowEarTag ?? '').trim() !== registrationCattle.earTag) return false;
          if (!['種付', '受精卵移植', 'AI', 'ET'].includes(record.breedingMethod)) return false;
          const result = record.pregnancyResult || '未鑑定';
          return result === '未鑑定' || result === '再鑑定予定';
        })
        .sort((a, b) => {
          const dateA = a.breedingMethod === '受精卵移植' || a.breedingMethod === 'ET'
            ? (a.transferDate || a.transferPlannedDate || a.heatDate || '')
            : (a.inseminationDate || a.heatDate || '');
          const dateB = b.breedingMethod === '受精卵移植' || b.breedingMethod === 'ET'
            ? (b.transferDate || b.transferPlannedDate || b.heatDate || '')
            : (b.inseminationDate || b.heatDate || '');
          return dateB.localeCompare(dateA);
        });

      const target = candidates[0];
      if (!target) {
        throw new Error('この牛に妊娠鑑定を登録できる種付・受精卵移植記録が見つかりませんでした。');
      }

      const { id, createdAt: _createdAt, updatedAt: _updatedAt, ...input } = target;
      const mergedNote = registrationNote.trim()
        ? [target.note?.trim(), registrationNote.trim()].filter(Boolean).join('\n')
        : (target.note || '');

      await updateBreeding(id, {
        ...input,
        pregnancyCheckDate: registrationPregnancyCheckDate,
        pregnancyResult: registrationPregnancyResult,
        recheckExpectedDate: registrationPregnancyResult === '再鑑定予定' ? registrationRecheckExpectedDate : '',
        note: mergedNote,
      });
      setRegistrationStep('complete');
    } catch (error) {
      setRegistrationSaveError(error instanceof Error ? error.message : '妊娠鑑定を登録できませんでした。');
    } finally {
      setRegistrationSaving(false);
    }
  };

  const saveCalvingRegistration = async () => {
    if (!registrationCattle || !registrationCalvingDate || !registrationCalvingResult) return;

    setRegistrationSaving(true);
    setRegistrationSaveError('');

    try {
      const records = await getBreedingList();
      const candidates = records
        .filter((record) => {
          if (String(record.cowEarTag ?? '').trim() !== registrationCattle.earTag) return false;
          if (record.breedingStatus === '分娩済み') return false;
          return ['受胎', '妊娠'].includes(record.pregnancyResult) || Boolean(record.expectedCalvingDate);
        })
        .sort((a, b) => {
          const dateA = a.transferDate || a.transferPlannedDate || a.inseminationDate || a.heatDate || '';
          const dateB = b.transferDate || b.transferPlannedDate || b.inseminationDate || b.heatDate || '';
          return dateB.localeCompare(dateA);
        });

      const target = candidates[0];
      if (!target) {
        throw new Error('この牛に分娩登録できる受胎済みの繁殖記録が見つかりませんでした。');
      }

      const created = await createCalving({
        cowId: registrationCattle.earTag,
        cowName: registrationCattle.name,
        expectedCalvingDate: target.expectedCalvingDate || '',
        actualCalvingDate: registrationCalvingDate,
        calfName: registrationCalfEarTag.trim(),
        calfSex: registrationCalfSex || '不明',
        birthWeightKg: registrationBirthWeightKg ? Number(registrationBirthWeightKg) : '',
        calvingResult: registrationCalvingResult,
        colostrumStatus: '未確認',
        memo: registrationNote,
        registeredToCalfLedger: false,
        breedingId: String(target.id),
      });

      const linked = await ensureCalvingMotherCattle(created);

      if (registrationCalvingResult !== '死産' && linked.id) {
        await registerCalvingToCalfLedger(String(linked.id));
      }

      setRegistrationStep('complete');
    } catch (error) {
      setRegistrationSaveError(error instanceof Error ? error.message : '分娩を登録できませんでした。');
    } finally {
      setRegistrationSaving(false);
    }
  };

  return (
    <Stack spacing={2} sx={{ maxWidth: 900, mx: 'auto' }}>
      <Box>
        <Typography variant="h5" fontWeight={900}>{isRecordMode ? 'AIで記録' : 'AIに聞く'}</Typography>
        <Typography color="text.secondary" sx={{ mt: 0.5 }}>
          {isRecordMode
            ? '登録したい内容を、そのまま入力してください。'
            : '分からないことを、そのまま入力してください。'}
        </Typography>
      </Box>

      <Alert severity="info">
        {isRecordMode
          ? '発情・授精・ET・妊娠鑑定・分娩・治療・ワクチン・飼料使用を、会話しながら登録できます。'
          : 'FarmProの使い方や設定、農場データについて質問できます。'}
      </Alert>

      <Card variant="outlined">
        <CardContent>
          <Box component="form" onSubmit={handleSubmit}>
            <Stack spacing={1.5}>
              <TextField
                size="small"
                label={isRecordMode ? '登録したい内容を入力' : '分からないことを入力'}
                placeholder={isRecordMode ? '例：1234 発情を登録して' : '例：最初に何を設定すればいい？'}
                value={question}
                onChange={(event) => handleQuestionChange(event.target.value)}
                fullWidth
                autoComplete="off"
              />
              <Button type="submit" variant="contained" size="large" disabled={!question.trim() || askingFarmAi}>
                {askingFarmAi ? 'AIが確認中...' : isRecordMode ? 'AIで記録' : 'AIに聞く'}
              </Button>
            </Stack>
          </Box>
        </CardContent>
      </Card>

      {askingFarmAi && <Alert severity="info">FarmProの農場データを確認しています...</Alert>}

      {searched && farmAiError && <Alert severity="warning">{farmAiError}</Alert>}

      {searched && farmAiAnswer && (
        <Card>
          <CardContent>
            <Stack spacing={1.5}>
              <Box>
                <Typography variant="body2" color="text.secondary">質問</Typography>
                <Typography fontWeight={800} sx={{ mt: 0.5 }}>{submittedQuestion}</Typography>
              </Box>
              <Box>
                <Typography variant="h6" fontWeight={900}>農場データからの回答</Typography>
                <Typography sx={{ mt: 1, lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>{farmAiAnswer}</Typography>
              </Box>
              <Alert severity="info">FarmProに登録されている農場データをもとに回答しています。AIはデータを自動保存・変更しません。</Alert>
            </Stack>
          </CardContent>
        </Card>
      )}

      {searched && registrationIntent?.kind === 'feed-use' && (
        <Card>
          <CardContent>
            {registrationStep === 'complete' ? (
              <Alert severity="success">
                {registrationIntent.feedName}を{registrationIntent.feedTargetType === 'farm' ? '農場全体' : registrationIntent.feedTargetType === 'calfGroup' ? '子牛群' : registrationIntent.feedTargetType === 'growingCattleGroup' ? '育成牛群' : registrationIntent.feedTargetType === 'breedingCattleGroup' ? '繁殖牛群' : registrationFeedTarget ? `${registrationFeedTarget.earTag} ${registrationFeedTarget.animalName || '名号未登録'}`.trim() : '個体'}へ
                {registrationIntent.feedQuantity}{registrationIntent.feedUnit}使用した記録を登録しました。完了です。
              </Alert>
            ) : (
              <Stack spacing={1.5}>
                <Box>
                  <Typography variant="body2" color="text.secondary">登録依頼</Typography>
                  <Typography fontWeight={800} sx={{ mt: 0.5 }}>{submittedQuestion}</Typography>
                </Box>
                <Typography variant="h6" fontWeight={900}>飼料使用の登録候補</Typography>
                <Alert severity="info">内容を確認してから登録します。AIが自動で保存することはありません。</Alert>
                <Card variant="outlined">
                  <CardContent>
                    <Stack spacing={0.75}>
                      <Typography><strong>使用日：</strong>{todayLocalDate()}</Typography>
                      <Typography><strong>飼料名：</strong>{registrationIntent.feedName}</Typography>
                      <Typography><strong>使用先：</strong>{registrationIntent.feedTargetType === 'farm' ? '農場全体' : registrationIntent.feedTargetType === 'calfGroup' ? '子牛群' : registrationIntent.feedTargetType === 'growingCattleGroup' ? '育成牛群' : registrationIntent.feedTargetType === 'breedingCattleGroup' ? '繁殖牛群' : registrationFeedTarget ? `${registrationFeedTarget.earTag} ${registrationFeedTarget.animalName || '名号未登録'}`.trim() : `番号 ${registrationIntent.earTag || '-'} を確認中`}</Typography>
                      <Typography><strong>数量：</strong>{registrationIntent.feedQuantity}{registrationIntent.feedUnit}</Typography>
                    </Stack>
                  </CardContent>
                </Card>
                {registrationFeedCandidates.length > 1 && (
                  <Card variant="outlined">
                    <CardContent>
                      <Stack spacing={1}>
                        <Alert severity="warning">
                          番号 {registrationIntent.earTag} の牛が{registrationFeedCandidates.length}頭見つかりました。対象を選んでください。
                        </Alert>
                        {registrationFeedCandidates.map((candidate) => (
                          <Button
                            key={`${candidate.animalType}:${candidate.animalId}`}
                            variant={registrationFeedTarget?.animalType === candidate.animalType && registrationFeedTarget?.animalId === candidate.animalId ? 'contained' : 'outlined'}
                            onClick={() => {
                              setRegistrationFeedTarget(candidate);
                              setRegistrationLookupError('');
                            }}
                            fullWidth
                            sx={{ justifyContent: 'flex-start', textAlign: 'left' }}
                          >
                            {candidate.animalType === 'calf'
                              ? `子牛｜${candidate.earTag || '-'} ${candidate.animalName || '耳標未装着'}${candidate.motherName ? `／母牛 ${candidate.motherName}` : ''}`
                              : `成牛｜${candidate.earTag || '-'} ${candidate.animalName || '名号未登録'}`}
                          </Button>
                        ))}
                      </Stack>
                    </CardContent>
                  </Card>
                )}
                {registrationLookupError && <Alert severity="warning">{registrationLookupError}</Alert>}
                {registrationSaveError && <Alert severity="error">{registrationSaveError}</Alert>}
                <Button
                  variant="contained"
                  size="large"
                  onClick={() => void saveFeedUseRegistration()}
                  disabled={registrationSaving || (registrationIntent.feedTargetType === 'individual' && !registrationFeedTarget)}
                >
                  {registrationSaving ? '登録中...' : 'この内容で登録'}
                </Button>
              </Stack>
            )}
          </CardContent>
        </Card>
      )}

      {searched && registrationIntent?.kind === 'vaccine' && (
        <Card>
          <CardContent>
            <Stack spacing={1.5}>
              {renderRegistrationEntry({
                actionLabel: 'ワクチン',
                dateLabel: '接種日',
                onToday: () => {
                  setRegistrationVaccinationDate(todayLocalDate());
                  setRegistrationStep('confirm-vaccine');
                },
                onDateChange: (value) => {
                  setRegistrationVaccinationDate(value);
                  if (value) setRegistrationStep('confirm-vaccine');
                },
              })}
              {registrationCattle && registrationStep === 'confirm-vaccine' && (
                <Stack spacing={1}>
                  <Alert severity="success">
                    接種日：{registrationVaccinationDate} で入力しました。
                  </Alert>
                  <Typography fontWeight={800}>ワクチン名は？</Typography>
                  <MedicineSearchField
                    value={registrationVaccineName}
                    onChange={(name) => setRegistrationVaccineName(name)}
                    required
                  />
                  <Button
                    variant="contained"
                    onClick={() => setRegistrationStep('confirm-vaccine-next-date')}
                    disabled={!registrationVaccineName.trim()}
                    fullWidth
                  >
                    次へ
                  </Button>
                </Stack>
              )}
              {registrationCattle && registrationStep === 'confirm-vaccine-next-date' && (
                <Stack spacing={1}>
                  <Alert severity="success">ワクチン：{registrationVaccineName}</Alert>
                  <Typography fontWeight={800}>次回予定日はありますか？</Typography>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                    <TextField
                      label="次回予定日"
                      type="date"
                      value={registrationVaccineNextDueDate}
                      onChange={(event) => setRegistrationVaccineNextDueDate(event.target.value)}
                      InputLabelProps={{ shrink: true }}
                      fullWidth
                    />
                    <Button
                      variant="contained"
                      onClick={() => setRegistrationStep('confirm-vaccine-cost')}
                      disabled={!registrationVaccineNextDueDate}
                      fullWidth
                    >
                      次へ
                    </Button>
                    <Button
                      variant="text"
                      onClick={() => {
                        setRegistrationVaccineNextDueDate('');
                        setRegistrationStep('confirm-vaccine-cost');
                      }}
                      fullWidth
                    >
                      予定なし・不明
                    </Button>
                  </Stack>
                </Stack>
              )}
              {registrationCattle && registrationStep === 'confirm-vaccine-cost' && (
                <Stack spacing={1}>
                  <Alert severity="success">
                    次回予定日：{registrationVaccineNextDueDate || 'なし・不明'}
                  </Alert>
                  <Typography fontWeight={800}>ワクチン費用は？</Typography>
                  <TextField
                    label="ワクチン費用（円）"
                    type="number"
                    value={registrationVaccineCost}
                    onChange={(event) => setRegistrationVaccineCost(event.target.value)}
                    inputProps={{ min: 0, step: 1 }}
                    fullWidth
                  />
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                    <Button variant="contained" onClick={() => setRegistrationStep('review')} fullWidth>
                      この内容で確認へ
                    </Button>
                    <Button
                      variant="text"
                      onClick={() => {
                        setRegistrationVaccineCost('');
                        setRegistrationStep('review');
                      }}
                      fullWidth
                    >
                      費用なし・不明
                    </Button>
                  </Stack>
                </Stack>
              )}
              {registrationCattle && registrationStep === 'review' && (
                <Stack spacing={1.25}>
                  <Typography variant="h6" fontWeight={900}>登録内容を確認してください</Typography>
                  <Card variant="outlined">
                    <CardContent>
                      <Stack spacing={0.75}>
                        <Typography><strong>対象牛：</strong>{registrationCattle.earTag} {registrationCattle.name || '名号未登録'}</Typography>
                        <Typography><strong>接種日：</strong>{registrationVaccinationDate}</Typography>
                        <Typography><strong>ワクチン：</strong>{registrationVaccineName}</Typography>
                        <Typography><strong>次回予定日：</strong>{registrationVaccineNextDueDate || 'なし・不明'}</Typography>
                        <Typography><strong>ワクチン費用：</strong>{registrationVaccineCost ? `${registrationVaccineCost}円` : 'なし・不明'}</Typography>
                      </Stack>
                    </CardContent>
                  </Card>
                  {registrationSaveError && <Alert severity="error">{registrationSaveError}</Alert>}
                  <Button
                    variant="contained"
                    size="large"
                    onClick={() => void saveVaccineRegistration()}
                    disabled={registrationSaving}
                  >
                    {registrationSaving ? '登録中...' : '登録'}
                  </Button>
                </Stack>
              )}
              {registrationCattle && registrationStep === 'complete' && (
                <Alert severity="success">
                  {registrationCattle.earTag} {registrationCattle.name || '名号未登録'} のワクチン接種を登録しました。完了です。
                </Alert>
              )}
            </Stack>
          </CardContent>
        </Card>
      )}

      {searched && registrationIntent?.kind === 'treatment' && (
        <Card>
          <CardContent>
            <Stack spacing={1.5}>
              {renderRegistrationEntry({
                actionLabel: '治療',
                dateLabel: '治療日',
                onToday: () => {
                  setRegistrationHeatDate(todayLocalDate());
                  setRegistrationStep('confirm-note');
                },
                onDateChange: (value) => {
                  setRegistrationHeatDate(value);
                  if (value) setRegistrationStep('confirm-note');
                },
              })}
              {registrationCattle && registrationStep === 'confirm-note' && (
                <Stack spacing={1}>
                  <Alert severity="success">
                    治療日：{registrationHeatDate} で入力しました。
                  </Alert>
                  <Typography fontWeight={800}>症状・治療内容を入力してください</Typography>
                  <TextField
                    label="症状・治療内容"
                    value={registrationNote}
                    onChange={(event) => setRegistrationNote(event.target.value)}
                    placeholder="例：発熱、食欲低下。獣医師診療。"
                    multiline
                    minRows={2}
                    fullWidth
                  />
                  <Button
                    variant="contained"
                    onClick={() => setRegistrationStep('confirm-medicine')}
                    disabled={!registrationNote.trim()}
                    fullWidth
                  >
                    次へ
                  </Button>
                </Stack>
              )}
              {registrationCattle && registrationStep === 'confirm-medicine' && (
                <Stack spacing={1}>
                  <Alert severity="success">
                    症状・治療内容：{registrationNote}
                  </Alert>
                  <Typography fontWeight={800}>使用した薬剤は？</Typography>
                  <MedicineSearchField
                    value={registrationTreatmentMedicine}
                    onChange={(name, medicine) => {
                      const selected = medicine || null;
                      setRegistrationTreatmentMedicine(name);
                      setRegistrationTreatmentMedicineOption(selected);
                      setRegistrationTreatmentWithdrawalEndDate(
                        calculateTreatmentWithdrawalEndDate(registrationHeatDate, selected),
                      );
                    }}
                  />
                  {registrationTreatmentWithdrawalEndDate && (
                    <Alert severity="info">
                      休薬終了日の目安：{registrationTreatmentWithdrawalEndDate}
                    </Alert>
                  )}
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                    <Button
                      variant="contained"
                      onClick={() => setRegistrationStep('confirm-treatment-costs')}
                      disabled={!registrationTreatmentMedicine.trim()}
                      fullWidth
                    >
                      次へ
                    </Button>
                    <Button
                      variant="text"
                      onClick={() => {
                        setRegistrationTreatmentMedicine('');
                        setRegistrationTreatmentMedicineOption(null);
                        setRegistrationTreatmentWithdrawalEndDate('');
                        setRegistrationStep('confirm-treatment-costs');
                      }}
                      fullWidth
                    >
                      薬剤なし・不明
                    </Button>
                  </Stack>
                </Stack>
              )}
              {registrationCattle && registrationStep === 'confirm-treatment-costs' && (
                <Stack spacing={1}>
                  <Alert severity="success">
                    使用薬剤：{registrationTreatmentMedicine || 'なし・不明'}
                    {registrationTreatmentWithdrawalEndDate ? `／休薬終了日：${registrationTreatmentWithdrawalEndDate}` : ''}
                  </Alert>
                  <Typography fontWeight={800}>治療にかかった費用は？</Typography>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                    <TextField
                      label="医薬品費（円）"
                      type="number"
                      value={registrationTreatmentMedicineCost}
                      onChange={(event) => setRegistrationTreatmentMedicineCost(event.target.value)}
                      inputProps={{ min: 0, step: 1 }}
                      fullWidth
                    />
                    <TextField
                      label="診療費（円）"
                      type="number"
                      value={registrationTreatmentMedicalFee}
                      onChange={(event) => setRegistrationTreatmentMedicalFee(event.target.value)}
                      inputProps={{ min: 0, step: 1 }}
                      fullWidth
                    />
                  </Stack>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                    <Button variant="contained" onClick={() => setRegistrationStep('review')} fullWidth>
                      この内容で確認へ
                    </Button>
                    <Button
                      variant="text"
                      onClick={() => {
                        setRegistrationTreatmentMedicineCost('');
                        setRegistrationTreatmentMedicalFee('');
                        setRegistrationStep('review');
                      }}
                      fullWidth
                    >
                      費用なし・不明
                    </Button>
                  </Stack>
                </Stack>
              )}
              {registrationCattle && registrationStep === 'review' && (
                <Stack spacing={1.25}>
                  <Typography variant="h6" fontWeight={900}>登録内容を確認してください</Typography>
                  <Card variant="outlined">
                    <CardContent>
                      <Stack spacing={0.75}>
                        <Typography><strong>対象牛：</strong>{registrationCattle.earTag} {registrationCattle.name || '名号未登録'}</Typography>
                        <Typography><strong>治療日：</strong>{registrationHeatDate}</Typography>
                        <Typography><strong>症状・治療内容：</strong>{registrationNote}</Typography>
                        <Typography><strong>使用薬剤：</strong>{registrationTreatmentMedicine || 'なし・不明'}</Typography>
                        <Typography><strong>休薬終了日：</strong>{registrationTreatmentWithdrawalEndDate || 'なし・未設定'}</Typography>
                        <Typography><strong>医薬品費：</strong>{registrationTreatmentMedicineCost ? `${registrationTreatmentMedicineCost}円` : 'なし・不明'}</Typography>
                        <Typography><strong>診療費：</strong>{registrationTreatmentMedicalFee ? `${registrationTreatmentMedicalFee}円` : 'なし・不明'}</Typography>
                      </Stack>
                    </CardContent>
                  </Card>
                  <Alert severity="info">
                    薬剤マスターに休薬期間が登録されている場合は、休薬終了日の目安を自動表示します。
                  </Alert>
                  {registrationSaveError && <Alert severity="error">{registrationSaveError}</Alert>}
                  <Button
                    variant="contained"
                    size="large"
                    onClick={() => void saveTreatmentRegistration()}
                    disabled={registrationSaving}
                  >
                    {registrationSaving ? '登録中...' : '登録'}
                  </Button>
                </Stack>
              )}
              {registrationCattle && registrationStep === 'complete' && (
                <Alert severity="success">
                  {registrationCattle.earTag} {registrationCattle.name || '名号未登録'} の治療を登録しました。完了です。
                </Alert>
              )}
            </Stack>
          </CardContent>
        </Card>
      )}

      {searched && registrationIntent?.kind === 'calving' && (
        <Card>
          <CardContent>
            <Stack spacing={1.5}>
              {renderRegistrationEntry({
                actionLabel: '分娩',
                dateLabel: '分娩日',
                onToday: confirmTodayAsCalvingDate,
                onDateChange: (value) => {
                  setRegistrationCalvingDate(value);
                  if (value) setRegistrationStep('confirm-calving-result');
                },
              })}
              {registrationCattle && registrationStep === 'confirm-calving-result' && (
                <Stack spacing={1}>
                  <Alert severity="success">
                    分娩日：{registrationCalvingDate} で入力しました。
                  </Alert>
                  <Typography fontWeight={800}>分娩結果は？</Typography>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                    {['正常', '要確認', '死産'].map((result) => (
                      <Button
                        key={result}
                        variant="outlined"
                        onClick={() => {
                          setRegistrationCalvingResult(result);
                          setRegistrationStep('confirm-calf-info');
                        }}
                        fullWidth
                      >
                        {result}
                      </Button>
                    ))}
                  </Stack>
                </Stack>
              )}
              {registrationCattle && registrationStep === 'confirm-calf-info' && (
                <Stack spacing={1}>
                  <Alert severity="success">
                    分娩結果：{registrationCalvingResult} で入力しました。
                  </Alert>
                  <Typography fontWeight={800}>子牛の耳標番号は？</Typography>
                  <TextField
                    label="子牛耳標番号"
                    value={registrationCalfEarTag}
                    onChange={(event) => setRegistrationCalfEarTag(event.target.value)}
                    placeholder="耳標装着前なら空欄でも進められます"
                    fullWidth
                  />
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                    <Button
                      variant="contained"
                      onClick={() => setRegistrationStep('confirm-calf-sex')}
                      disabled={!registrationCalfEarTag.trim()}
                      fullWidth
                    >
                      次へ
                    </Button>
                    <Button
                      variant="text"
                      onClick={() => {
                        setRegistrationCalfEarTag('');
                        setRegistrationStep('confirm-calf-sex');
                      }}
                      fullWidth
                    >
                      耳標まだ・不明
                    </Button>
                  </Stack>
                </Stack>
              )}
              {registrationCattle && registrationStep === 'confirm-calf-sex' && (
                <Stack spacing={1}>
                  <Alert severity="success">
                    子牛耳標番号：{registrationCalfEarTag || '未登録'}
                  </Alert>
                  <Typography fontWeight={800}>子牛の性別は？</Typography>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                    {['メス', 'オス', '不明'].map((sex) => (
                      <Button
                        key={sex}
                        variant="outlined"
                        onClick={() => {
                          setRegistrationCalfSex(sex);
                          setRegistrationStep('confirm-calf-weight');
                        }}
                        fullWidth
                      >
                        {sex}
                      </Button>
                    ))}
                  </Stack>
                </Stack>
              )}
              {registrationCattle && registrationStep === 'confirm-calf-weight' && (
                <Stack spacing={1}>
                  <Alert severity="success">
                    子牛の性別：{registrationCalfSex}
                  </Alert>
                  <Typography fontWeight={800}>出生体重は？</Typography>
                  <TextField
                    label="出生体重（kg）"
                    type="number"
                    value={registrationBirthWeightKg}
                    onChange={(event) => setRegistrationBirthWeightKg(event.target.value)}
                    inputProps={{ min: 0, step: 0.1 }}
                    fullWidth
                  />
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                    <Button
                      variant="contained"
                      onClick={() => setRegistrationStep('confirm-note')}
                      disabled={!registrationBirthWeightKg}
                      fullWidth
                    >
                      次へ
                    </Button>
                    <Button
                      variant="text"
                      onClick={() => {
                        setRegistrationBirthWeightKg('');
                        setRegistrationStep('confirm-note');
                      }}
                      fullWidth
                    >
                      体重不明
                    </Button>
                  </Stack>
                </Stack>
              )}
              {registrationCattle && registrationStep === 'confirm-note' && registrationIntent?.kind === 'calving' && (
                <Stack spacing={1}>
                  <Alert severity="success">
                    子牛情報：耳標 {registrationCalfEarTag || '未登録'}／{registrationCalfSex || '不明'}／
                    {registrationBirthWeightKg ? registrationBirthWeightKg + 'kg' : '体重不明'}
                  </Alert>
                  <Typography fontWeight={800}>メモはありますか？</Typography>
                  <TextField
                    label="メモ"
                    value={registrationNote}
                    onChange={(event) => setRegistrationNote(event.target.value)}
                    placeholder="例：初乳確認済み、介助あり など"
                    multiline
                    minRows={2}
                    fullWidth
                  />
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                    <Button variant="contained" onClick={() => setRegistrationStep('review')} fullWidth>
                      この内容で確認へ
                    </Button>
                    <Button
                      variant="text"
                      onClick={() => {
                        setRegistrationNote('');
                        setRegistrationStep('review');
                      }}
                      fullWidth
                    >
                      メモなし
                    </Button>
                  </Stack>
                </Stack>
              )}
              {registrationCattle && registrationStep === 'review' && registrationIntent?.kind === 'calving' && (
                <Stack spacing={1.25}>
                  <Typography variant="h6" fontWeight={900}>登録内容を確認してください</Typography>
                  <Card variant="outlined">
                    <CardContent>
                      <Stack spacing={0.75}>
                        <Typography><strong>母牛：</strong>{registrationCattle.earTag} {registrationCattle.name || '名号未登録'}</Typography>
                        <Typography><strong>分娩日：</strong>{registrationCalvingDate}</Typography>
                        <Typography><strong>分娩結果：</strong>{registrationCalvingResult}</Typography>
                        <Typography><strong>子牛耳標番号：</strong>{registrationCalfEarTag || '未登録'}</Typography>
                        <Typography><strong>性別：</strong>{registrationCalfSex || '不明'}</Typography>
                        <Typography><strong>出生体重：</strong>{registrationBirthWeightKg ? registrationBirthWeightKg + 'kg' : '不明'}</Typography>
                        <Typography><strong>メモ：</strong>{registrationNote || 'なし'}</Typography>
                      </Stack>
                    </CardContent>
                  </Card>
                  {registrationSaveError && <Alert severity="error">{registrationSaveError}</Alert>}
                  <Button
                    variant="contained"
                    size="large"
                    onClick={() => void saveCalvingRegistration()}
                    disabled={registrationSaving}
                  >
                    {registrationSaving ? '登録中...' : '登録'}
                  </Button>
                </Stack>
              )}
              {registrationCattle && registrationStep === 'complete' && (
                <Alert severity="success">
                  {registrationCalvingResult === '死産'
                    ? `${registrationCattle.earTag} ${registrationCattle.name || '名号未登録'} の分娩を登録しました。死産のため子牛台帳は作成していません。`
                    : `${registrationCattle.earTag} ${registrationCattle.name || '名号未登録'} の分娩と子牛台帳への登録が完了しました。`}
                </Alert>
              )}
            </Stack>
          </CardContent>
        </Card>
      )}

      {searched && registrationIntent?.kind === 'pregnancy-check' && (
        <Card>
          <CardContent>
            <Stack spacing={1.5}>
              {renderRegistrationEntry({
                actionLabel: '妊娠鑑定',
                dateLabel: '妊娠鑑定日',
                onToday: confirmTodayAsPregnancyCheckDate,
                onDateChange: (value) => {
                  setRegistrationPregnancyCheckDate(value);
                  if (value) setRegistrationStep('confirm-pregnancy-result');
                },
              })}
              {registrationCattle && registrationStep === 'confirm-pregnancy-result' && (
                <Stack spacing={1}>
                  <Alert severity="success">
                    妊娠鑑定日：{registrationPregnancyCheckDate} で入力しました。
                  </Alert>
                  <Typography fontWeight={800}>鑑定結果は？</Typography>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} flexWrap="wrap" useFlexGap>
                    {['受胎', '空胎', '再鑑定予定', '流産・胎子喪失'].map((result) => (
                      <Button
                        key={result}
                        variant="outlined"
                        onClick={() => {
                          setRegistrationPregnancyResult(result);
                          setRegistrationStep(result === '再鑑定予定' ? 'confirm-recheck-date' : 'confirm-note');
                        }}
                        fullWidth
                      >
                        {result}
                      </Button>
                    ))}
                  </Stack>
                </Stack>
              )}
              {registrationCattle && registrationStep === 'confirm-recheck-date' && (
                <Stack spacing={1}>
                  <Alert severity="success">
                    鑑定結果：{registrationPregnancyResult} で入力しました。
                  </Alert>
                  <Typography fontWeight={800}>再鑑定予定日はいつですか？</Typography>
                  <TextField
                    label="再鑑定予定日"
                    type="date"
                    value={registrationRecheckExpectedDate}
                    onChange={(event) => setRegistrationRecheckExpectedDate(event.target.value)}
                    InputLabelProps={{ shrink: true }}
                    fullWidth
                  />
                  <Button
                    variant="contained"
                    onClick={() => setRegistrationStep('confirm-note')}
                    disabled={!registrationRecheckExpectedDate}
                    fullWidth
                  >
                    次へ
                  </Button>
                </Stack>
              )}
              {registrationCattle && registrationStep === 'confirm-note' && registrationIntent?.kind === 'pregnancy-check' && (
                <Stack spacing={1}>
                  <Alert severity="success">
                    鑑定結果：{registrationPregnancyResult}
                    {registrationPregnancyResult === '再鑑定予定' && registrationRecheckExpectedDate
                      ? '／再鑑定予定日：' + registrationRecheckExpectedDate
                      : ''}
                  </Alert>
                  <Typography fontWeight={800}>メモはありますか？</Typography>
                  <TextField
                    label="メモ"
                    value={registrationNote}
                    onChange={(event) => setRegistrationNote(event.target.value)}
                    placeholder="例：再鑑定理由や獣医師の所見など"
                    multiline
                    minRows={2}
                    fullWidth
                  />
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                    <Button variant="contained" onClick={() => setRegistrationStep('review')} fullWidth>
                      この内容で確認へ
                    </Button>
                    <Button
                      variant="text"
                      onClick={() => {
                        setRegistrationNote('');
                        setRegistrationStep('review');
                      }}
                      fullWidth
                    >
                      メモなし
                    </Button>
                  </Stack>
                </Stack>
              )}
              {registrationCattle && registrationStep === 'review' && registrationIntent?.kind === 'pregnancy-check' && (
                <Stack spacing={1.25}>
                  <Typography variant="h6" fontWeight={900}>登録内容を確認してください</Typography>
                  <Card variant="outlined">
                    <CardContent>
                      <Stack spacing={0.75}>
                        <Typography><strong>対象牛：</strong>{registrationCattle.earTag} {registrationCattle.name || '名号未登録'}</Typography>
                        <Typography><strong>妊娠鑑定日：</strong>{registrationPregnancyCheckDate}</Typography>
                        <Typography><strong>鑑定結果：</strong>{registrationPregnancyResult}</Typography>
                        {registrationPregnancyResult === '再鑑定予定' && (
                          <Typography><strong>再鑑定予定日：</strong>{registrationRecheckExpectedDate}</Typography>
                        )}
                        <Typography><strong>メモ：</strong>{registrationNote || 'なし'}</Typography>
                      </Stack>
                    </CardContent>
                  </Card>
                  {registrationSaveError && <Alert severity="error">{registrationSaveError}</Alert>}
                  <Button
                    variant="contained"
                    size="large"
                    onClick={() => void savePregnancyCheckRegistration()}
                    disabled={registrationSaving}
                  >
                    {registrationSaving ? '登録中...' : '登録'}
                  </Button>
                </Stack>
              )}
              {registrationCattle && registrationStep === 'complete' && (
                <Alert severity="success">
                  {registrationCattle.earTag} {registrationCattle.name || '名号未登録'} の妊娠鑑定を登録しました。完了です。
                </Alert>
              )}
            </Stack>
          </CardContent>
        </Card>
      )}

      {searched && registrationIntent?.kind === 'transfer' && (
        <Card>
          <CardContent>
            <Stack spacing={1.5}>
              {renderRegistrationEntry({
                actionLabel: '受精卵移植',
                titleLabel: '受精卵移植（ET）',
                dateLabel: '移植日',
                onToday: confirmTodayAsTransferDate,
                onDateChange: (value) => {
                  setRegistrationTransferDate(value);
                  if (value) setRegistrationStep('confirm-embryo-number');
                },
              })}
              {registrationCattle && registrationStep === 'confirm-embryo-number' && (
                <Stack spacing={1}>
                  <Alert severity="success">
                    移植日：{registrationTransferDate} で入力しました。
                  </Alert>
                  <Typography fontWeight={800}>受精卵番号・管理番号は？</Typography>
                  <TextField
                    label="受精卵番号・管理番号"
                    value={registrationEmbryoNumber}
                    onChange={(event) => setRegistrationEmbryoNumber(event.target.value)}
                    placeholder="例：ET-001"
                    fullWidth
                  />
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                    <Button
                      variant="contained"
                      onClick={() => setRegistrationStep('confirm-donor')}
                      disabled={!registrationEmbryoNumber.trim()}
                      fullWidth
                    >
                      次へ
                    </Button>
                    <Button
                      variant="text"
                      onClick={() => {
                        setRegistrationEmbryoNumber('');
                        setRegistrationStep('confirm-donor');
                      }}
                      fullWidth
                    >
                      番号なし・不明
                    </Button>
                  </Stack>
                </Stack>
              )}
              {registrationCattle && registrationStep === 'confirm-donor' && (
                <Stack spacing={1}>
                  <Alert severity="success">
                    受精卵番号：{registrationEmbryoNumber || 'なし・不明'}
                  </Alert>
                  <Typography fontWeight={800}>供卵牛は？</Typography>
                  <TextField
                    label="供卵牛名"
                    value={registrationDonorCowName}
                    onChange={(event) => setRegistrationDonorCowName(event.target.value)}
                    placeholder="例：みどり"
                    fullWidth
                  />
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                    <Button
                      variant="contained"
                      onClick={() => setRegistrationStep('confirm-embryo-sire')}
                      disabled={!registrationDonorCowName.trim()}
                      fullWidth
                    >
                      次へ
                    </Button>
                    <Button
                      variant="text"
                      onClick={() => {
                        setRegistrationDonorCowName('');
                        setRegistrationStep('confirm-embryo-sire');
                      }}
                      fullWidth
                    >
                      供卵牛なし・不明
                    </Button>
                  </Stack>
                </Stack>
              )}
              {registrationCattle && registrationStep === 'confirm-embryo-sire' && (
                <Stack spacing={1}>
                  <Alert severity="success">
                    供卵牛：{registrationDonorCowName || 'なし・不明'}
                  </Alert>
                  <Typography fontWeight={800}>受精卵の父牛は？</Typography>
                  <SireSearchField
                    value={registrationEmbryoSireName}
                    masterId={registrationEmbryoSireMasterId}
                    onChange={(name, masterId) => {
                      setRegistrationEmbryoSireName(name);
                      setRegistrationEmbryoSireMasterId(masterId);
                    }}
                    label="受精卵の父牛"
                  />
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                    <Button
                      variant="contained"
                      onClick={() => setRegistrationStep('confirm-transfer-technician')}
                      disabled={!registrationEmbryoSireName.trim()}
                      fullWidth
                    >
                      次へ
                    </Button>
                    <Button
                      variant="text"
                      onClick={() => {
                        setRegistrationEmbryoSireName('');
                        setRegistrationStep('confirm-transfer-technician');
                      }}
                      fullWidth
                    >
                      父牛なし・不明
                    </Button>
                  </Stack>
                </Stack>
              )}
              {registrationCattle && registrationStep === 'confirm-transfer-technician' && (
                <Stack spacing={1}>
                  <Alert severity="success">
                    受精卵の父牛：{registrationEmbryoSireName || 'なし・不明'}
                  </Alert>
                  <Typography fontWeight={800}>移植担当者は？</Typography>
                  <InseminatorSearchField
                    label="移植担当者"
                    value={registrationTransferTechnician}
                    masterId={registrationTransferTechnicianMasterId}
                    onChange={(name, masterId) => {
                      setRegistrationTransferTechnician(name);
                      setRegistrationTransferTechnicianMasterId(masterId);
                    }}
                  />
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                    <Button
                      variant="contained"
                      onClick={() => setRegistrationStep('confirm-note')}
                      disabled={!registrationTransferTechnician.trim()}
                      fullWidth
                    >
                      次へ
                    </Button>
                    <Button
                      variant="text"
                      onClick={() => {
                        setRegistrationTransferTechnician('');
                        setRegistrationStep('confirm-note');
                      }}
                      fullWidth
                    >
                      担当者なし・不明
                    </Button>
                  </Stack>
                </Stack>
              )}
              {registrationCattle && registrationStep === 'confirm-note' && (
                <Stack spacing={1}>
                  <Alert severity="success">
                    移植担当者：{registrationTransferTechnician || 'なし・不明'}
                  </Alert>
                  <Typography fontWeight={800}>メモはありますか？</Typography>
                  <TextField
                    label="メモ"
                    value={registrationNote}
                    onChange={(event) => setRegistrationNote(event.target.value)}
                    placeholder="例：移植時の様子など"
                    multiline
                    minRows={2}
                    fullWidth
                  />
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                    <Button
                      variant="contained"
                      onClick={() => setRegistrationStep('review')}
                      fullWidth
                    >
                      この内容で確認へ
                    </Button>
                    <Button
                      variant="text"
                      onClick={() => {
                        setRegistrationNote('');
                        setRegistrationStep('review');
                      }}
                      fullWidth
                    >
                      メモなし
                    </Button>
                  </Stack>
                </Stack>
              )}
              {registrationCattle && registrationStep === 'review' && (
                <Stack spacing={1.25}>
                  <Typography variant="h6" fontWeight={900}>登録内容を確認してください</Typography>
                  <Card variant="outlined">
                    <CardContent>
                      <Stack spacing={0.75}>
                        <Typography><strong>対象牛：</strong>{registrationCattle.earTag} {registrationCattle.name || '名号未登録'}</Typography>
                        <Typography><strong>移植日：</strong>{registrationTransferDate}</Typography>
                        <Typography><strong>受精卵番号：</strong>{registrationEmbryoNumber || 'なし・不明'}</Typography>
                        <Typography><strong>供卵牛：</strong>{registrationDonorCowName || 'なし・不明'}</Typography>
                        <Typography><strong>受精卵の父牛：</strong>{registrationEmbryoSireName || 'なし・不明'}</Typography>
                        <Typography><strong>移植担当者：</strong>{registrationTransferTechnician || 'なし・不明'}</Typography>
                        <Typography><strong>メモ：</strong>{registrationNote || 'なし'}</Typography>
                      </Stack>
                    </CardContent>
                  </Card>
                  {registrationSaveError && <Alert severity="error">{registrationSaveError}</Alert>}
                  <Button
                    variant="contained"
                    size="large"
                    onClick={() => void saveTransferRegistration()}
                    disabled={registrationSaving}
                  >
                    {registrationSaving ? '登録中...' : '登録'}
                  </Button>
                </Stack>
              )}
              {registrationCattle && registrationStep === 'complete' && (
                <Alert severity="success">
                  {registrationCattle.earTag} {registrationCattle.name || '名号未登録'} の受精卵移植を登録しました。完了です。
                </Alert>
              )}
            </Stack>
          </CardContent>
        </Card>
      )}

      {searched && registrationIntent?.kind === 'insemination' && (
        <Card>
          <CardContent>
            <Stack spacing={1.5}>
              {renderRegistrationEntry({
                actionLabel: '授精',
                dateLabel: '授精日',
                onToday: confirmTodayAsInseminationDate,
                onDateChange: (value) => {
                  setRegistrationInseminationDate(value);
                  if (value) setRegistrationStep('confirm-bull');
                },
              })}
              {registrationCattle && registrationStep === 'confirm-bull' && (
                <Stack spacing={1}>
                  <Alert severity="success">
                    授精日：{registrationInseminationDate} で入力しました。
                  </Alert>
                  <Typography fontWeight={800}>種雄牛は？</Typography>
                  <SireSearchField
                    value={registrationBullName}
                    masterId={registrationBullMasterId}
                    onChange={(name, masterId) => {
                      setRegistrationBullName(name);
                      setRegistrationBullMasterId(masterId);
                    }}
                    label="種雄牛"
                    required
                  />
                  <Button
                    variant="contained"
                    onClick={() => setRegistrationStep('confirm-inseminator')}
                    disabled={!registrationBullName.trim()}
                    fullWidth
                  >
                    次へ
                  </Button>
                </Stack>
              )}
              {registrationCattle && registrationStep === 'confirm-inseminator' && (
                <Stack spacing={1}>
                  <Alert severity="success">
                    種雄牛：{registrationBullName} で入力しました。
                  </Alert>
                  <Typography fontWeight={800}>授精師は？</Typography>
                  <TextField
                    label="授精師"
                    value={registrationInseminatorName}
                    onChange={(event) => setRegistrationInseminatorName(event.target.value)}
                    placeholder="例：〇〇授精師"
                    fullWidth
                  />
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                    <Button
                      variant="contained"
                      onClick={() => setRegistrationStep('confirm-note')}
                      disabled={!registrationInseminatorName.trim()}
                      fullWidth
                    >
                      次へ
                    </Button>
                    <Button
                      variant="text"
                      onClick={() => {
                        setRegistrationInseminatorName('');
                        setRegistrationStep('confirm-note');
                      }}
                      fullWidth
                    >
                      授精師なし・不明
                    </Button>
                  </Stack>
                </Stack>
              )}
              {registrationCattle && registrationStep === 'confirm-note' && (
                <Stack spacing={1}>
                  <Alert severity="success">
                    授精師：{registrationInseminatorName || 'なし・不明'}
                  </Alert>
                  <Typography fontWeight={800}>メモはありますか？</Typography>
                  <TextField
                    label="メモ"
                    value={registrationNote}
                    onChange={(event) => setRegistrationNote(event.target.value)}
                    placeholder="例：授精時の様子など"
                    multiline
                    minRows={2}
                    fullWidth
                  />
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                    <Button variant="contained" onClick={() => setRegistrationStep('review')} fullWidth>
                      この内容で確認へ
                    </Button>
                    <Button
                      variant="text"
                      onClick={() => {
                        setRegistrationNote('');
                        setRegistrationStep('review');
                      }}
                      fullWidth
                    >
                      メモなし
                    </Button>
                  </Stack>
                </Stack>
              )}
              {registrationCattle && registrationStep === 'review' && (
                <Stack spacing={1.25}>
                  <Typography variant="h6" fontWeight={900}>登録内容を確認してください</Typography>
                  <Card variant="outlined">
                    <CardContent>
                      <Stack spacing={0.75}>
                        <Typography><strong>対象牛：</strong>{registrationCattle.earTag} {registrationCattle.name || '名号未登録'}</Typography>
                        <Typography><strong>授精日：</strong>{registrationInseminationDate}</Typography>
                        <Typography><strong>種雄牛：</strong>{registrationBullName}</Typography>
                        <Typography><strong>授精師：</strong>{registrationInseminatorName || 'なし・不明'}</Typography>
                        <Typography><strong>メモ：</strong>{registrationNote || 'なし'}</Typography>
                      </Stack>
                    </CardContent>
                  </Card>
                  {registrationSaveError && <Alert severity="error">{registrationSaveError}</Alert>}
                  <Button
                    variant="contained"
                    size="large"
                    onClick={() => void saveInseminationRegistration()}
                    disabled={registrationSaving}
                  >
                    {registrationSaving ? '登録中...' : '登録'}
                  </Button>
                </Stack>
              )}
              {registrationCattle && registrationStep === 'complete' && (
                <Alert severity="success">
                  {registrationCattle.earTag} {registrationCattle.name || '名号未登録'} の授精を登録しました。完了です。
                </Alert>
              )}
            </Stack>
          </CardContent>
        </Card>
      )}

      {searched && registrationIntent?.kind === 'heat' && (
        <Card>
          <CardContent>
            <Stack spacing={1.5}>
              {renderRegistrationEntry({
                actionLabel: '発情',
                dateLabel: '発情日',
                onToday: confirmTodayAsHeatDate,
                onDateChange: (value) => {
                  setRegistrationHeatDate(value);
                  if (value) setRegistrationStep('confirm-estrus-type');
                },
              })}
              {registrationCattle && registrationStep === 'confirm-estrus-type' && (
                <Stack spacing={1}>
                  <Alert severity="success">
                    発情日：{registrationHeatDate} で入力しました。
                  </Alert>
                  <Typography fontWeight={800}>発情区分はどちらですか？</Typography>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                    <Button
                      variant="contained"
                      onClick={() => {
                        setRegistrationEstrusType('自然発情');
                        setRegistrationStep('confirm-signs');
                      }}
                      fullWidth
                    >
                      自然発情
                    </Button>
                    <Button
                      variant="outlined"
                      onClick={() => {
                        setRegistrationEstrusType('繁殖治療による発情');
                        setRegistrationStep('confirm-signs');
                      }}
                      fullWidth
                    >
                      繁殖治療による発情
                    </Button>
                  </Stack>
                </Stack>
              )}
              {registrationCattle && registrationStep === 'confirm-signs' && (
                <Stack spacing={1}>
                  <Alert severity="success">
                    発情区分：{registrationEstrusType} で入力しました。
                  </Alert>
                  <Typography fontWeight={800}>発情兆候を選んでください。複数選べます。</Typography>
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    {['粘液', 'スタンディング', '咆哮', '乗駕', '落ち着きがない', '外陰部の腫れ'].map((sign) => {
                      const selected = registrationEstrusSigns.includes(sign);
                      return (
                        <Button
                          key={sign}
                          variant={selected ? 'contained' : 'outlined'}
                          size="small"
                          onClick={() => {
                            setRegistrationEstrusSigns((currentSigns) =>
                              currentSigns.includes(sign)
                                ? currentSigns.filter((item) => item !== sign)
                                : [...currentSigns, sign],
                            );
                          }}
                        >
                          {sign}
                        </Button>
                      );
                    })}
                  </Stack>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                    <Button
                      variant="contained"
                      onClick={() => setRegistrationStep('confirm-note')}
                      fullWidth
                    >
                      これで次へ
                    </Button>
                    <Button
                      variant="text"
                      onClick={() => {
                        setRegistrationEstrusSigns([]);
                        setRegistrationStep('confirm-note');
                      }}
                      fullWidth
                    >
                      兆候なし・不明
                    </Button>
                  </Stack>
                </Stack>
              )}
              {registrationCattle && registrationStep === 'confirm-note' && (
                <Stack spacing={1}>
                  {registrationIntent?.kind === 'heat' ? (
                    <Alert severity="success">
                      発情兆候：{registrationEstrusSigns.length > 0 ? registrationEstrusSigns.join('、') : 'なし・不明'}
                    </Alert>
                  ) : (
                    <Alert severity="success">
                      授精師：{registrationInseminatorName || 'なし・不明'}
                    </Alert>
                  )}
                  <Typography fontWeight={800}>メモはありますか？</Typography>
                  <TextField
                    label="メモ"
                    value={registrationNote}
                    onChange={(event) => setRegistrationNote(event.target.value)}
                    placeholder={registrationIntent?.kind === 'heat' ? '例：朝から乗駕あり' : '例：授精時の様子など'}
                    multiline
                    minRows={2}
                    fullWidth
                  />
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                    <Button
                      variant="contained"
                      onClick={() => setRegistrationStep('review')}
                      fullWidth
                    >
                      この内容で確認へ
                    </Button>
                    <Button
                      variant="text"
                      onClick={() => {
                        setRegistrationNote('');
                        setRegistrationStep('review');
                      }}
                      fullWidth
                    >
                      メモなし
                    </Button>
                  </Stack>
                </Stack>
              )}
              {registrationCattle && registrationStep === 'review' && registrationIntent?.kind === 'heat' && (
                <Stack spacing={1.25}>
                  <Typography variant="h6" fontWeight={900}>登録内容を確認してください</Typography>
                  <Card variant="outlined">
                    <CardContent>
                      <Stack spacing={0.75}>
                        <Typography><strong>対象牛：</strong>{registrationCattle.earTag} {registrationCattle.name || '名号未登録'}</Typography>
                        <Typography><strong>発情日：</strong>{registrationHeatDate}</Typography>
                        <Typography><strong>発情区分：</strong>{registrationEstrusType}</Typography>
                        <Typography><strong>発情兆候：</strong>{registrationEstrusSigns.length > 0 ? registrationEstrusSigns.join('、') : 'なし・不明'}</Typography>
                        <Typography><strong>メモ：</strong>{registrationNote || 'なし'}</Typography>
                      </Stack>
                    </CardContent>
                  </Card>
                  {registrationSaveError && <Alert severity="error">{registrationSaveError}</Alert>}
                  <Button
                    variant="contained"
                    size="large"
                    onClick={() => void saveHeatRegistration()}
                    disabled={registrationSaving}
                  >
                    {registrationSaving ? '登録中...' : '登録'}
                  </Button>
                </Stack>
              )}
              {registrationCattle && registrationStep === 'complete' && (
                <Alert severity="success">
                  {registrationCattle.earTag} {registrationCattle.name || '名号未登録'} の発情を登録しました。完了です。
                </Alert>
              )}
            </Stack>
          </CardContent>
        </Card>
      )}

      {searched && guide && (
        <Card>
          <CardContent>
            <Stack spacing={2}>
              <Box><Typography variant="body2" color="text.secondary">質問</Typography><Typography fontWeight={800} sx={{ mt: 0.5 }}>{submittedQuestion}</Typography></Box>
              <Box><Typography variant="h6" fontWeight={900}>{guide.title}</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>操作手順</Typography></Box>
              <Stack spacing={1.25}>
                {answerSteps.map((step, index) => (
                  <Stack key={`${step}-${index}`} direction="row" spacing={1.25} alignItems="flex-start">
                    <Box sx={{ width: 28, height: 28, borderRadius: '50%', bgcolor: 'primary.main', color: 'primary.contrastText', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, flexShrink: 0, mt: 0.15 }}>{index + 1}</Box>
                    <Typography sx={{ lineHeight: 1.8, pt: 0.1 }}>{step}</Typography>
                  </Stack>
                ))}
              </Stack>
              {notes.length > 0 && <Box><Typography variant="body2" fontWeight={800} sx={{ mb: 0.75 }}>注意</Typography><Stack spacing={1}>{notes.map((note) => <Alert key={note} severity="info">{note}</Alert>)}</Stack></Box>}
              {guide.id === 'feed-cost-accuracy' ? (
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}><Button component={RouterLink} to="/feed-inventory" variant="contained" size="large" fullWidth>飼料在庫管理を開く</Button><Button component={RouterLink} to="/feedings" variant="contained" size="large" fullWidth>飼料給与管理を開く</Button></Stack>
              ) : guide.id === 'production-cost-accuracy' ? (
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}><Button component={RouterLink} to="/settings" variant="contained" size="large" fullWidth>農場設定を開く</Button><Button component={RouterLink} to="/feed-inventory" variant="contained" size="large" fullWidth>飼料在庫管理を開く</Button><Button component={RouterLink} to="/feedings" variant="contained" size="large" fullWidth>飼料給与管理を開く</Button></Stack>
              ) : (
                <Button component={RouterLink} to={guide.route} variant="contained" size="large">{routeLabel}を開く</Button>
              )}
              {guide.freePlan && isFreePlan && (
                <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: 'action.hover' }}>
                  <Typography fontWeight={900}>Standardなら、農場データもAIに聞けます</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, lineHeight: 1.7 }}>
                    例：「123番の前回授精は？」のように、登録済みの牛や農場の記録を使った質問ができます。
                  </Typography>
                  <Button component={RouterLink} to="/paid-plan" size="small" sx={{ mt: 0.75, px: 0, fontWeight: 800 }}>
                    Standardを見る
                  </Button>
                </Box>
              )}
              <Box component="form" onSubmit={handleFollowUpSubmit} sx={{ pt: 1.5, borderTop: 1, borderColor: 'divider' }}>
                <Stack spacing={1}>
                  <Typography fontWeight={800}>続けて質問できます</Typography>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'stretch', sm: 'center' }}>
                    <TextField size="small" placeholder="例：マスター登録は必要？" value={followUpQuestion} onChange={(event) => setFollowUpQuestion(event.target.value)} fullWidth autoComplete="off" />
                    <Button type="submit" variant="outlined" disabled={!followUpQuestion.trim()} sx={{ minWidth: { xs: '100%', sm: 112 }, minHeight: 40, flexShrink: 0 }}>聞く</Button>
                  </Stack>
                </Stack>
              </Box>
            </Stack>
          </CardContent>
        </Card>
      )}

      {searched && !guide && !registrationIntent && !farmAiAnswer && !farmAiError && !askingFarmAi && <Alert severity="warning">まだこの質問の案内は登録されていません。言い方を少し変えて、画面名や「〜の使い方」と入力してみてください。</Alert>}
    </Stack>
  );
}

export default AiHelpPage;
