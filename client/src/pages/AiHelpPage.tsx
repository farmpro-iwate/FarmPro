import { FormEvent, useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Collapse,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { farmProAiHelpGuides, type FarmProAiHelpGuide } from '../ai/helpGuideData';

const primaryExampleQuestions = [
  '最初に何を設定すればいい？',
  '牛を登録したい',
  '発情を登録したい',
  '分娩を登録したい',
];

const otherExampleQuestions = [
  '農場名を変えたい',
  '発情周期はどこ？',
  '経費を牛に分けたい',
  '通知を設定したい',
  '人工授精を登録したい',
  'ET予定を登録したい',
  '妊娠鑑定を登録したい',
  '治療を登録したい',
  'ワクチンを登録したい',
];

const standardFarmDataGuide: FarmProAiHelpGuide = {
  id: 'standard-farm-data',
  title: 'この質問はStandard以上で利用できます',
  intents: [],
  route: '/settings',
  freePlan: true,
  answer: '実際の牛や農場の記録を確認する質問はStandard以上の機能です。Free版では、FarmProの使い方・画面案内・用語説明・警告の意味説明までご案内します。',
  notes: ['例：「123番の前回授精は？」のように、登録済みの農場データを見る質問はStandard以上です。'],
};

const acquisitionCostGuide: FarmProAiHelpGuide = {
  id: 'acquisition-cost-allocation',
  title: '繁殖牛の取得原価の分け方',
  intents: ['繁殖牛の取得原価を何産で分ける', '取得原価を何産で分ける', '取得原価の配分とは', '8産で分ける意味', '何産にすればいい'],
  route: '/settings',
  freePlan: true,
  answer: '取得原価とは、繁殖牛を購入した金額や、自家保留したときにその牛を繁殖牛として持つための原価です。この金額を最初の1頭の子牛だけに全部のせるのではなく、将来生まれる複数の子牛へ分けて生産費に入れます。たとえば取得原価80万円を8産で分けると、1産あたり10万円を子牛の生産費へ配分します。5産で分けると1産あたり16万円、10産で分けると1産あたり8万円になります。設定する産数が少ないほど1頭あたりの負担は大きくなり、多いほど小さくなります。農場設定の「繁殖牛の取得原価を何産で分ける？」で選び、迷う場合は8産を目安にして農場の考え方に合わせて調整してください。',
  notes: ['実際に何産まで使うかは牛や農場によって異なります。FarmProでは、最初に決めた考え方をそろえて使うことが大切です。'],
};

const allocationMethodGuide: FarmProAiHelpGuide = {
  id: 'expense-allocation-method',
  title: '頭数で均等と在籍日数の違い',
  intents: ['頭数で均等とは', '在籍日数に応じてとは', '頭数均等と在籍日数の違い', 'どっちを選べばいい', '経費の分け方はどっちがいい'],
  route: '/settings',
  freePlan: true,
  answer: '「頭数で均等」は、その期間の対象牛へ同じ金額ずつ経費を分ける方法です。たとえば月の経費10万円を対象牛10頭へ分ける場合は、1頭あたり1万円ずつ配分します。「在籍日数に応じて」は、その期間に農場にいた日数が長い牛ほど多く、短い牛ほど少なく配分する方法です。たとえば月の途中で導入した牛や途中で販売した牛がいる場合、その牛は1か月ずっといた牛より少ない負担になります。途中導入や販売が少ない農場なら「頭数で均等」が簡単で分かりやすく、途中導入や販売が多い場合は「在籍日数に応じて」の方が実態に近い計算になります。迷う場合は、まず「頭数で均等」から始め、必要になったら在籍日数方式へ変更できます。',
  notes: ['どちらが正解というより、農場の運用に合う方法を継続して使うことが大切です。'],
};

const allocationPeriodGuide: FarmProAiHelpGuide = {
  id: 'expense-allocation-period',
  title: '月ごとと年ごとの違い',
  intents: ['月ごとと年ごとの違い', '月ごととは', '年ごととは', '月ごとと年ごとどっち', 'どの期間で計算するとは'],
  route: '/settings',
  freePlan: true,
  answer: '「月ごと」は、その月に発生した農場全体の経費を、その月の対象牛へ配分する方法です。月別収支や月ごとの生産費を確認したい場合に向いています。「年ごと」は、1年間に発生した農場全体の経費をまとめて、その年の対象牛へ配分する考え方です。年間全体で大きく生産費を見たい場合に向いています。たとえば電気代や燃料費を毎月入力して月別の動きを確認したいなら「月ごと」が分かりやすく、細かな月の差より1年間の合計を重視するなら「年ごと」が合います。FarmProでは月別収支も確認するため、迷う場合はまず「月ごと」から始めると分かりやすいです。',
  notes: ['途中で方式を変えると比較しにくくなるため、運用を始めたら同じ考え方を継続して使うのがおすすめです。'],
};

const allocationTargetGuide: FarmProAiHelpGuide = {
  id: 'expense-allocation-target',
  title: '全頭・繁殖牛・子牛の違い',
  intents: ['全頭とは', '繁殖牛とは', '子牛とは', 'どの牛に分ける', '全頭と繁殖牛と子牛の違い', '経費をどの牛に分ければいい'],
  route: '/settings',
  freePlan: true,
  answer: '「どの牛に分ける？」は、農場全体の共通経費をどの牛の生産費へ負担させるかを決める設定です。繁殖農家では、売上の中心は基本的に子牛の販売なので、子牛1頭を生産するためにいくらかかったかを見る目的では「子牛」へ配分する考え方が基本になります。「子牛」は農場全体の共通経費を子牛の生産費へ配分します。「繁殖牛」は繁殖牛だけへ配分し、繁殖牛そのものの維持費を個体別に見たい場合などに使います。「全頭」は繁殖牛と子牛の両方へ配分しますが、子牛の販売利益を把握したい繁殖農家では、共通経費が繁殖牛側にも分かれるため、子牛1頭あたりの生産費が小さく見えることがあります。繁殖牛を販売した場合は、その販売額は繁殖牛の売却収入として扱います。迷う場合は、繁殖農家の共通経費はまず「子牛」から始めるのが分かりやすいです。',
  notes: ['「全頭」が間違いという意味ではありません。農場独自の原価管理方針がある場合は選べますが、FarmProでは繁殖農家の子牛生産費・販売利益を把握しやすくするため「子牛」を基本とします。'],
};

const expenseIncludeGuide: FarmProAiHelpGuide = {
  id: 'expense-allocation-include',
  title: '農場全体の経費を含める・含めないの違い',
  intents: ['農場全体の経費を含めるとは', '含めると含めないの違い', '経費は含めた方がいい', '個体別生産費に経費を含める', '農場全体の経費を個体別生産費に含めるとは'],
  route: '/settings',
  freePlan: true,
  answer: '「含める」は、電気代・燃料費・共通の消耗品費など、1頭へ直接ひも付けにくい農場全体の経費も子牛の生産費へ配分して計算する方法です。「含めない」は、こうした共通経費を個体別生産費には入れず、飼料費・治療費・取得原価など個体へ直接つながる費用を中心に計算します。月別収支では、共通経費そのものは経費として確認できますが、「含めない」を選ぶと子牛1頭あたりの生産費には反映されません。繁殖農家で「子牛1頭を生産するのに実際いくらかかったか」や、販売時の利益をできるだけ実態に近く見たい場合は「含める」が基本です。「含める」を選んだ後は、繁殖農家では共通経費の配分先を「子牛」にする考え方が分かりやすいです。',
  notes: ['「含めない」でも月別収支から農場全体の経費は確認できます。ただし、個体別生産費や販売時利益には共通経費が入らないため、利益が大きめに見える場合があります。'],
};

const treatmentGuide: FarmProAiHelpGuide = {
  id: 'treatment-create',
  title: '治療登録',
  intents: ['治療を登録したい', '治療記録を入れたい', '薬を使った記録をしたい', '投薬を登録したい', '休薬期間を記録したい', '診療費を登録したい'],
  route: '/treatments/new',
  freePlan: true,
  answer: '画面上部の「＋」を押し、「活動登録」から「治療」を選んで開きます。まず対象牛を選び、必須の「治療日」を入力します。一般治療では「症状」も必須なので、どのような症状だったか入力してください。治療区分は一般治療のほか、繁殖治療・予防・去勢・削蹄・その他の処置から選べます。疾病名・処置内容・薬剤・投薬量・獣医師名・経過・次回予定日・メモなどは、実際の治療内容に合わせて入力します。薬剤マスターに肉・出荷の制限期間が登録されている薬を選ぶと、治療日から休薬期間終了日の目安を自動入力します。製品表示や獣医師の指示が優先なので、必要なら日付を修正してください。医薬品費と診療費を入力すると、保存時に経費管理へそれぞれ「医薬品費」「診療費」として自動反映されます。入力できたら「保存」を押してください。',
  notes: ['必須なのは対象牛の耳標番号・名号・治療日です。一般治療と繁殖治療では症状も必須です。薬剤を使った場合は休薬情報を確認し、医薬品費・診療費を入力した場合は経費管理へ自動反映されるため、同じ費用を手入力で重複登録しないようにしてください。'],
};

const vaccineGuide: FarmProAiHelpGuide = {
  id: 'vaccine-create',
  title: 'ワクチン登録',
  intents: ['ワクチンを登録したい', 'ワクチン接種を記録したい', '予防接種を登録したい', '次回ワクチン予定を入れたい', 'ワクチン予定を登録したい', 'ワクチン費用を登録したい'],
  route: '/vaccines/new',
  freePlan: true,
  answer: 'ワクチンを登録するには、「その他の管理」から「ワクチン」を開いて「新規登録」を押します。対象は登録済みの繁殖牛または子牛から選べ、対象番号を直接入力した場合も登録済みの番号と一致すれば対象名が自動表示されます。必須なのは対象区分・対象番号・対象名・ワクチン名です。ワクチン名は薬剤検索から選ぶこともできます。接種した場合は「接種日」を入力し、「状態」を「接種済み」にします。ワクチン費用を入力して「接種済み」で保存すると、経費管理へ「医薬品費」として自動反映され、対象個体にもひも付きます。未接種の予定段階ではワクチン費用を入力しても経費には反映しません。次回も接種予定がある場合は「次回予定日」を入力してください。次回予定日を入れて状態が未接種の記録は、時期が近づくとホームの対応表示やアラートに出て、カレンダーにもワクチン予定として表示されます。必要ならメモを入力し、最後に「保存」を押します。',
  notes: ['接種済みのワクチン費用は経費管理の「医薬品費」へ自動反映されるため、同じ費用を経費管理で重複登録しないようにしてください。次回接種を忘れないため、次回予定日も入力しておくのがおすすめです。'],
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
};

function normalize(text: string) {
  return text
    .toLowerCase()
    .replace(/[\s　。、・「」『』（）()？?]/g, '')
    .replace(/種付け/g, '種付')
    .replace(/妊鑑/g, '妊娠鑑定');
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

  const hasAnimalNumber = /\d+番/.test(normalizedQuestion);
  const asksPreviousFarmRecord = normalizedQuestion.includes('前回')
    && /(発情|人工授精|授精|種付|受精卵移植|移植|妊娠鑑定|分娩)/.test(normalizedQuestion);
  if (hasAnimalNumber && asksPreviousFarmRecord) return standardFarmDataGuide;

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
  const [question, setQuestion] = useState('');
  const [followUpQuestion, setFollowUpQuestion] = useState('');
  const [submittedQuestion, setSubmittedQuestion] = useState('');
  const [guide, setGuide] = useState<FarmProAiHelpGuide | null>(null);
  const [searched, setSearched] = useState(false);
  const [showMoreExamples, setShowMoreExamples] = useState(false);

  const notes = useMemo(() => guide?.notes ?? [], [guide]);
  const answerSteps = useMemo(() => (guide ? splitAnswerSteps(guide.answer) : []), [guide]);
  const routeLabel = guide ? (routeLabels[guide.route] ?? guide.title) : '';

  const ask = (nextQuestion: string) => {
    const trimmed = nextQuestion.trim();
    const nextGuide = findGuide(trimmed);
    setQuestion(trimmed);
    setSubmittedQuestion(trimmed);
    setGuide(nextGuide);
    setSearched(Boolean(trimmed));
    setFollowUpQuestion('');
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    ask(question);
  };

  const handleFollowUpSubmit = (event: FormEvent) => {
    event.preventDefault();
    ask(followUpQuestion);
  };

  return (
    <Stack spacing={2} sx={{ maxWidth: 900, mx: 'auto' }}>
      <Box>
        <Typography variant="h5" fontWeight={900}>AIに聞く</Typography>
        <Typography color="text.secondary" sx={{ mt: 0.5 }}>
          分からないことを、そのまま入力してください。
        </Typography>
      </Box>

      <Alert severity="info">FarmProの使い方や設定を案内します。</Alert>

      <Card variant="outlined">
        <CardContent>
          <Box component="form" onSubmit={handleSubmit}>
            <Stack spacing={1.5}>
              <TextField size="small" label="分からないことを入力" placeholder="例：最初に何を設定すればいい？" value={question} onChange={(event) => setQuestion(event.target.value)} fullWidth autoComplete="off" />
              <Button type="submit" variant="contained" size="large" disabled={!question.trim()}>AIに聞く</Button>
            </Stack>
          </Box>
        </CardContent>
      </Card>

      <Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>よくある質問</Typography>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          {primaryExampleQuestions.map((example) => <Chip key={example} label={example} onClick={() => ask(example)} variant="outlined" clickable />)}
        </Stack>
        <Button size="small" onClick={() => setShowMoreExamples((prev) => !prev)} sx={{ mt: 1, px: 0.5, fontWeight: 700 }}>{showMoreExamples ? '質問例を閉じる' : 'ほかの質問例を見る'}</Button>
        <Collapse in={showMoreExamples}>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>
            {otherExampleQuestions.map((example) => <Chip key={example} label={example} onClick={() => ask(example)} variant="outlined" clickable />)}
          </Stack>
        </Collapse>
      </Box>

      {searched && guide && (
        <Card>
          <CardContent>
            <Stack spacing={2}>
              <Box><Typography variant="body2" color="text.secondary">質問</Typography><Typography fontWeight={800} sx={{ mt: 0.5 }}>{submittedQuestion}</Typography></Box>
              <Box><Typography variant="h6" fontWeight={900}>{guide.title}</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{guide.id === 'standard-farm-data' ? 'ご利用範囲' : '操作手順'}</Typography></Box>
              <Stack spacing={1.25}>
                {answerSteps.map((step, index) => (
                  <Stack key={`${step}-${index}`} direction="row" spacing={1.25} alignItems="flex-start">
                    <Box sx={{ width: 28, height: 28, borderRadius: '50%', bgcolor: 'primary.main', color: 'primary.contrastText', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, flexShrink: 0, mt: 0.15 }}>{index + 1}</Box>
                    <Typography sx={{ lineHeight: 1.8, pt: 0.1 }}>{step}</Typography>
                  </Stack>
                ))}
              </Stack>
              {notes.length > 0 && <Box><Typography variant="body2" fontWeight={800} sx={{ mb: 0.75 }}>注意</Typography><Stack spacing={1}>{notes.map((note) => <Alert key={note} severity="info">{note}</Alert>)}</Stack></Box>}
              {guide.id === 'standard-farm-data' ? null : guide.id === 'feed-cost-accuracy' ? (
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}><Button component={RouterLink} to="/feed-inventory" variant="contained" size="large" fullWidth>飼料在庫管理を開く</Button><Button component={RouterLink} to="/feedings" variant="contained" size="large" fullWidth>飼料給与管理を開く</Button></Stack>
              ) : guide.id === 'production-cost-accuracy' ? (
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}><Button component={RouterLink} to="/settings" variant="contained" size="large" fullWidth>農場設定を開く</Button><Button component={RouterLink} to="/feed-inventory" variant="contained" size="large" fullWidth>飼料在庫管理を開く</Button><Button component={RouterLink} to="/feedings" variant="contained" size="large" fullWidth>飼料給与管理を開く</Button></Stack>
              ) : (
                <Button component={RouterLink} to={guide.route} variant="contained" size="large">{routeLabel}を開く</Button>
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

      {searched && !guide && <Alert severity="warning">まだこの質問の案内は登録されていません。現在は「設定・牛の登録・発情・人工授精・ET予定・妊娠鑑定・分娩・治療・ワクチン・生産費・飼料費」の使い方をご案内できます。</Alert>}
    </Stack>
  );
}

export default AiHelpPage;
