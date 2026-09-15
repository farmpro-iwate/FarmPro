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

function isContextOnlyQuestion(question: string) {
  return [
    'それはどこ',
    'それどこ',
    'そこはどこ',
    'どこにある',
    'それはどうやる',
    'それどうやる',
    'どうやる',
    'それはどうする',
    'どうする',
    'それは何',
    'それなに',
  ].includes(question);
}

function findGuide(question: string, previousGuide: FarmProAiHelpGuide | null = null): FarmProAiHelpGuide | null {
  const normalizedQuestion = normalize(question);
  if (!normalizedQuestion) return null;

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
        const keywords = normalizedIntent.match(/農場名|代表者|担当者|電話|住所|設定|発情周期|周期|経費|配分|通知|アラート|アカウント|メール|プラン|牛|登録|発情|人工授精|授精|種付|et|受精卵移植|移植|妊娠鑑定|分娩|子牛|マスター|バックアップ/g) ?? [];
        const matched = keywords.filter((keyword) => normalizedQuestion.includes(keyword)).length;
        score = Math.max(score, matched * 10);
      }
    }

    if (!best || score > best.score) best = { guide, score };
  }

  if (best && best.score >= 20) return best.guide;
  if (previousGuide && isContextOnlyQuestion(normalizedQuestion)) return previousGuide;
  return null;
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
    const nextGuide = findGuide(trimmed, guide);
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

              <Button component={RouterLink} to={guide.route} variant="contained" size="large">
                {routeLabel}を開く
              </Button>

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
                      placeholder="例：バックアップはどうやる？"
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
          まだこの質問の案内は登録されていません。現在は「設定・牛の登録・発情・人工授精・ET予定・妊娠鑑定・分娩」の使い方をご案内できます。
        </Alert>
      )}
    </Stack>
  );
}

export default AiHelpPage;
