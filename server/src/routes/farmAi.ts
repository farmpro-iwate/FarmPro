import { Router } from 'express';
import OpenAI from 'openai';
import { listBreedings } from '../breedingStore';

export const farmAiRouter = Router();

type RequestBody = {
  question?: string;
};

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

  if (!previousInseminationQuestion && !breedingStageQuestion) {
    res.json({ handled: false });
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
