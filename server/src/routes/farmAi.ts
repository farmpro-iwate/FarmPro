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
  const asksInsemination = normalized.includes('授精') || normalized.includes('種付');
  const asksPrevious = normalized.includes('前回') || normalized.includes('最後') || normalized.includes('直近');
  return asksInsemination && asksPrevious;
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

  if (!isPreviousInseminationQuestion(question)) {
    res.json({ handled: false });
    return;
  }

  const earTag = extractEarTag(question);
  if (!earTag) {
    res.json({
      handled: true,
      answer: '耳標番号が分かるように質問してください。例：「123番の前回授精はいつ？」',
    });
    return;
  }

  const records = (await listBreedings())
    .filter((item) => String(item.cowEarTag || '').trim() === earTag && Boolean(item.inseminationDate))
    .sort((a, b) => String(b.inseminationDate || '').localeCompare(String(a.inseminationDate || '')));

  const latest = records[0];
  if (!latest) {
    res.json({
      handled: true,
      answer: `${earTag}番の授精記録は見つかりませんでした。`,
      source: { earTag, recordType: 'breeding' },
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
      `耳標番号: ${earTag}`,
      `牛名: ${latest.cowName || '未登録'}`,
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
            '質問に直接答え、その後に必要なら種雄牛や受胎確認を1文だけ補足してください。',
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
        earTag,
        breedingId: latest.id,
        inseminationDate: latest.inseminationDate,
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
