import { FormEvent, useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { farmProAiHelpGuides, type FarmProAiHelpGuide } from '../ai/helpGuideData';

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
  const [question, setQuestion] = useState('');
  const [followUpQuestion, setFollowUpQuestion] = useState('');
  const [submittedQuestion, setSubmittedQuestion] = useState('');
  const [guide, setGuide] = useState<FarmProAiHelpGuide | null>(null);
  const [searched, setSearched] = useState(false);

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
              {guide.freePlan && (
                <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: 'action.hover' }}>
                  <Typography fontWeight={900}>Standardなら、農場データもAIに聞けます</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, lineHeight: 1.7 }}>
                    例：「123番の前回授精は？」のように、登録済みの牛や農場の記録を使った質問ができます。
                  </Typography>
                  <Button component={RouterLink} to="/settings" size="small" sx={{ mt: 0.75, px: 0, fontWeight: 800 }}>
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

      {searched && !guide && <Alert severity="warning">まだこの質問の案内は登録されていません。言い方を少し変えて、画面名や「〜の使い方」と入力してみてください。</Alert>}
    </Stack>
  );
}

export default AiHelpPage;
