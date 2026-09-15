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

function normalize(text: string) {
  return text
    .toLowerCase()
    .replace(/[\s　。、・「」『』（）()？?]/g, '')
    .replace(/種付け/g, '種付')
    .replace(/妊鑑/g, '妊娠鑑定');
}

function findGuide(question: string): FarmProAiHelpGuide | null {
  const normalizedQuestion = normalize(question);
  if (!normalizedQuestion) return null;

  let best: { guide: FarmProAiHelpGuide; score: number } | null = null;

  for (const guide of farmProAiHelpGuides) {
    let score = 0;
    for (const intent of guide.intents) {
      const normalizedIntent = normalize(intent);
      if (normalizedQuestion === normalizedIntent) score = Math.max(score, 100);
      else if (normalizedQuestion.includes(normalizedIntent) || normalizedIntent.includes(normalizedQuestion)) score = Math.max(score, 70);
      else {
        const keywords = normalizedIntent.match(/農場名|代表者|担当者|電話|住所|設定|発情周期|周期|経費|配分|通知|アラート|アカウント|メール|プラン|牛|登録|発情|人工授精|授精|種付|et|受精卵移植|移植|妊娠鑑定|分娩|子牛/g) ?? [];
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
  const [submittedQuestion, setSubmittedQuestion] = useState('');
  const [guide, setGuide] = useState<FarmProAiHelpGuide | null>(null);
  const [searched, setSearched] = useState(false);
  const [showMoreExamples, setShowMoreExamples] = useState(false);

  const notes = useMemo(() => guide?.notes ?? [], [guide]);

  const ask = (nextQuestion: string) => {
    const trimmed = nextQuestion.trim();
    setQuestion(trimmed);
    setSubmittedQuestion(trimmed);
    setGuide(findGuide(trimmed));
    setSearched(Boolean(trimmed));
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    ask(question);
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
        現在はFarmProの設定と基本操作をご案内する試作版です。牛の実データを検索したり、記録を自動保存したりはしません。
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
            <Stack spacing={1.5}>
              <Typography variant="body2" color="text.secondary">質問</Typography>
              <Typography fontWeight={800}>{submittedQuestion}</Typography>

              <Typography variant="body2" color="text.secondary">FarmPro案内</Typography>
              <Typography sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.8 }}>{guide.answer}</Typography>

              {notes.map((note) => (
                <Alert key={note} severity="info">{note}</Alert>
              ))}

              <Button component={RouterLink} to={guide.route} variant="contained" size="large">
                この画面を開く
              </Button>
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
