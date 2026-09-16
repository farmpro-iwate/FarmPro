import { Router } from 'express';
import OpenAI from 'openai';

export const fieldRecordAiRouter = Router();

const candidateSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    activityType: {
      type: 'string',
      enum: ['', '発情', '種付', '受精卵移植', '妊娠鑑定', '分娩', '治療', '哺育・離乳', '飼料給与', 'その他'],
    },
    animalNumber: { type: 'string' },
    animalName: { type: 'string' },
    eventDate: { type: 'string' },
    eventTime: { type: 'string' },
    summary: { type: 'string' },
    details: { type: 'array', items: { type: 'string' } },
    missingFields: { type: 'array', items: { type: 'string' } },
    notes: { type: 'array', items: { type: 'string' } },
  },
  required: [
    'activityType',
    'animalNumber',
    'animalName',
    'eventDate',
    'eventTime',
    'summary',
    'details',
    'missingFields',
    'notes',
  ],
} as const;

type RequestBody = {
  text?: string;
};

fieldRecordAiRouter.post('/candidate', async (req, res) => {
  const text = String((req.body as RequestBody | undefined)?.text || '').trim();
  if (!text) {
    res.status(400).json({ message: '現場記録の内容を入力してください。' });
    return;
  }

  if (text.length > 2000) {
    res.status(400).json({ message: '一度に解析できる現場記録は2000文字までです。' });
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    res.status(503).json({ message: 'AI解析はまだ設定されていません。OPENAI_API_KEYを設定してください。' });
    return;
  }

  try {
    const client = new OpenAI({ apiKey });
    const model = process.env.FARMPRO_AI_FIELD_MODEL?.trim() || 'gpt-5-mini';
    const today = new Date().toISOString().slice(0, 10);

    const response = await client.responses.create({
      model,
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: [
                'あなたは繁殖和牛農家向けアプリFarmProの現場記録補助です。',
                '農家が話した、または入力した短い日本語から、正式保存前の登録候補だけを作ってください。',
                `今日の日付は ${today} です。`,
                'activityTypeは内容に最も近いものを1つだけ選んでください。判断できなければ空文字にしてください。',
                'animalNumberは耳標番号など、発話中に明示された個体番号だけを入れてください。推測しないでください。',
                'animalNameも明示された場合だけ入れてください。',
                '「今日」「昨日」など相対日付は、今日の日付を基準にYYYY-MM-DDへ変換してください。日付が無ければ空文字にしてください。',
                'eventTimeは時刻が明示された場合だけHH:MM形式で入れてください。',
                'summaryは農家が確認しやすい短い日本語にしてください。',
                'detailsには、症状、薬剤、授精方法、種雄牛、鑑定結果、分娩結果、哺育・離乳内容、給与内容など、発話に含まれる具体情報だけを並べてください。',
                'missingFieldsには、正式登録に進む前に確認が必要そうな不足項目を短い日本語で入れてください。ただしFarmProの画面仕様を推測して必須項目を作らないでください。',
                'notesには曖昧な表現や解釈に注意が必要な点だけを入れてください。',
                'FarmProへ保存したり、保存済みと表現したりしないでください。必ず人が内容を確認してから保存する前提です。',
                '',
                `現場記録: ${text}`,
              ].join('\n'),
            },
          ],
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'farmpro_field_record_candidate',
          strict: true,
          schema: candidateSchema,
        },
      },
    });

    const outputText = response.output_text?.trim();
    if (!outputText) {
      res.status(502).json({ message: 'AIから登録候補が返りませんでした。' });
      return;
    }

    const parsed = JSON.parse(outputText);
    res.json({
      candidate: {
        activityType: parsed.activityType || '',
        animalNumber: parsed.animalNumber || '',
        animalName: parsed.animalName || '',
        eventDate: parsed.eventDate || '',
        eventTime: parsed.eventTime || '',
        summary: parsed.summary || '',
        details: Array.isArray(parsed.details) ? parsed.details : [],
        missingFields: Array.isArray(parsed.missingFields) ? parsed.missingFields : [],
        notes: Array.isArray(parsed.notes) ? parsed.notes : [],
      },
      source: 'ai',
      model,
    });
  } catch (caught) {
    console.error('AI field record analysis failed', caught);
    const message = caught instanceof Error ? caught.message : 'AI解析に失敗しました。';
    res.status(502).json({ message });
  }
});
