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
];

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

  if (
    normalizedQuestion.includes('取得原価') &&
    (normalizedQuestion.includes('何産') || normalizedQuestion.includes('配分') || normalizedQuestion.includes('8産') || normalizedQuestion.includes('分け'))
  ) {
    return acquisitionCostGuide;
  }

  if (
    normalizedQuestion.includes('頭数') &&
    (normalizedQuestion.includes('均等') || normalizedQuestion.includes('在籍日数') || normalizedQuestion.includes('どっち'))
  ) {
    return allocationMethodGuide;
  }

  if (
    normalizedQuestion.includes('在籍日数') &&
    (normalizedQuestion.includes('意味') || normalizedQuestion.includes('違い') || normalizedQuestion.includes('どっち') || normalizedQuestion.includes('分け'))
  ) {
    return allocationMethodGuide;
  }

  let best: { guide: FarmProAiHelpGuide; score: number } | null = null;

  for (const guide of farmProAiHelpGuides) {
    let score = 0;
    const normalizedTitle = normalize(guide.title);

    if (normalizedQuestion.includes(normalizedTitle) || normalizedTitle.includes(normalizedQuestion)) {
      score = Math.max(score, 80);
    }

    for (const intent of guide.intents) {
      const normalizedIntent = normalize(intent);
      if (normalizedQuestion === normalizedIntent) score = Math.max(score, 100);
      else if (normalizedQuestion.includes(normalizedIntent) || normalizedIntent.includes(normalizedQuestion)) score = Math.max(score, 70);
      else {
        const keywords = normalizedIntent.match(/農場名|代表者|担当者|電話|住所|設定|発情周期|周期|経費|配分|通知|アラート|アカウント|メール|プラン|牛|登録|発情|人工授精|授精|種付|et|受精卵移植|移植|妊娠鑑定|分娩|子牛|マスター|バックアップ|飼料|在庫|給与|生産費|利益|取得原価|何産|頭数|均等|在籍日数/g) ?? [];
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

      <Alert severity="info">
        FarmProの使い方や設定を案内します。実データの検索・自動保存はしません。
      </Alert>

      <Card variant="outlined">
        <CardContent>
          <Box component="form" onSubmit={handleSubmit}>
            <Stack spacing={1.5}>
              <TextField
                label="分からないことを入力"
                placeholder="例：最初に何を設定すればいい？"
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                fullWidth
                autoComplete="off"
              />
              <Button type="submit" variant="contained" size="large" disabled={!question.trim()}>
                AIに聞く
              </Button>
            </Stack>
          </Box>
        </CardContent>
      </Card>

      <Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          よくある質問
        </Typography>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          {primaryExampleQuestions.map((example) => (
            <Chip
              key={example}
              label={example}
              onClick={() => ask(example)}
              variant="outlined"
              clickable
            />
          ))}
        </Stack>

        <Button
          size="small"
          onClick={() => setShowMoreExamples((prev) => !prev)}
          sx={{ mt: 1, px: 0.5, fontWeight: 700 }}
        >
          {showMoreExamples ? '質問例を閉じる' : 'ほかの質問例を見る'}
        </Button>

        <Collapse in={showMoreExamples}>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>
            {otherExampleQuestions.map((example) => (
              <Chip
                key={example}
                label={example}
                onClick={() => ask(example)}
                variant="outlined"
                clickable
              />
            ))}
          </Stack>
        </Collapse>
      </Box>

      {searched && guide && (
        <Card>
          <CardContent>
            <Stack spacing={2}>
              <Box>
                <Typography variant="body2" color="text.secondary">質問</Typography>
                <Typography fontWeight={800} sx={{ mt: 0.5 }}>{submittedQuestion}</Typography>
              </Box>

              <Box>
                <Typography variant="h6" fontWeight={900}>{guide.title}</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  操作手順
                </Typography>
              </Box>

              <Stack spacing={1.25}>
                {answerSteps.map((step, index) => (
                  <Stack key={`${step}-${index}`} direction="row" spacing={1.25} alignItems="flex-start">
                    <Box
                      sx={{
                        width: 28,
                        height: 28,
                        borderRadius: '50%',
                        bgcolor: 'primary.main',
                        color: 'primary.contrastText',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 900,
                        flexShrink: 0,
                        mt: 0.15,
                      }}
                    >
                      {index + 1}
                    </Box>
                    <Typography sx={{ lineHeight: 1.8, pt: 0.1 }}>{step}</Typography>
                  </Stack>
                ))}
              </Stack>

              {notes.length > 0 && (
                <Box>
                  <Typography variant="body2" fontWeight={800} sx={{ mb: 0.75 }}>
                    注意
                  </Typography>
                  <Stack spacing={1}>
                    {notes.map((note) => (
                      <Alert key={note} severity="info">{note}</Alert>
                    ))}
                  </Stack>
                </Box>
              )}

              {guide.id === 'feed-cost-accuracy' ? (
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                  <Button component={RouterLink} to="/feed-inventory" variant="contained" size="large" fullWidth>
                    飼料在庫管理を開く
                  </Button>
                  <Button component={RouterLink} to="/feedings" variant="contained" size="large" fullWidth>
                    飼料給与管理を開く
                  </Button>
                </Stack>
              ) : guide.id === 'production-cost-accuracy' ? (
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
                  <Button component={RouterLink} to="/settings" variant="contained" size="large" fullWidth>
                    農場設定を開く
                  </Button>
                  <Button component={RouterLink} to="/feed-inventory" variant="contained" size="large" fullWidth>
                    飼料在庫管理を開く
                  </Button>
                  <Button component={RouterLink} to="/feedings" variant="contained" size="large" fullWidth>
                    飼料給与管理を開く
                  </Button>
                </Stack>
              ) : (
                <Button component={RouterLink} to={guide.route} variant="contained" size="large">
                  {routeLabel}を開く
                </Button>
              )}

              <Box
                component="form"
                onSubmit={handleFollowUpSubmit}
                sx={{
                  pt: 1.5,
                  borderTop: 1,
                  borderColor: 'divider',
                }}
              >
                <Stack spacing={1}>
                  <Typography fontWeight={800}>続けて質問できます</Typography>
                  <Stack
                    direction={{ xs: 'column', sm: 'row' }}
                    spacing={1}
                    alignItems={{ xs: 'stretch', sm: 'center' }}
                  >
                    <TextField
                      size="small"
                      placeholder="例：マスター登録は必要？"
                      value={followUpQuestion}
                      onChange={(event) => setFollowUpQuestion(event.target.value)}
                      fullWidth
                      autoComplete="off"
                    />
                    <Button
                      type="submit"
                      variant="outlined"
                      disabled={!followUpQuestion.trim()}
                      sx={{
                        minWidth: { xs: '100%', sm: 112 },
                        minHeight: 40,
                        flexShrink: 0,
                      }}
                    >
                      聞く
                    </Button>
                  </Stack>
                </Stack>
              </Box>
            </Stack>
          </CardContent>
        </Card>
      )}

      {searched && !guide && (
        <Alert severity="warning">
          まだこの質問の案内は登録されていません。現在は「設定・牛の登録・発情・人工授精・ET予定・妊娠鑑定・分娩・生産費・飼料費」の使い方をご案内できます。
        </Alert>
      )}
    </Stack>
  );
}

export default AiHelpPage;
