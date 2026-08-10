import { Router } from 'express';
import OpenAI from 'openai';

export const cattleDocumentAiRouter = Router();

const candidateSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    identificationNumber: { type: 'string' },
    sourceReferenceNumber: { type: 'string' },
    registrationNumber: { type: 'string' },
    name: { type: 'string' },
    birthday: { type: 'string' },
    sire: { type: 'string' },
    dam: { type: 'string' },
    maternalSire: { type: 'string' },
    maternalGrandSire: { type: 'string' },
    offspring: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          parity: { type: 'string' },
          name: { type: 'string' },
          birthday: { type: 'string' },
          sire: { type: 'string' },
        },
        required: ['parity', 'name', 'birthday', 'sire'],
      },
    },
    notes: {
      type: 'array',
      items: { type: 'string' },
    },
  },
  required: [
    'identificationNumber',
    'sourceReferenceNumber',
    'registrationNumber',
    'name',
    'birthday',
    'sire',
    'dam',
    'maternalSire',
    'maternalGrandSire',
    'offspring',
    'notes',
  ],
} as const;

type RequestBody = {
  fileName?: string;
  mimeType?: string;
  base64?: string;
};

cattleDocumentAiRouter.post('/', async (req, res) => {
  const { fileName, mimeType, base64 } = (req.body || {}) as RequestBody;

  if (!fileName || !mimeType || !base64) {
    res.status(400).json({ message: '帳票ファイルが不足しています。' });
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    res.status(503).json({ message: 'AI画像解析はまだ設定されていません。OPENAI_API_KEYを設定してください。' });
    return;
  }

  try {
    const client = new OpenAI({ apiKey });
    const model = process.env.FARMPRO_AI_DOCUMENT_MODEL?.trim() || 'gpt-5';
    const isPdf = mimeType === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf');

    const documentInput = isPdf
      ? {
          type: 'input_file' as const,
          filename: fileName,
          file_data: `data:application/pdf;base64,${base64}`,
        }
      : {
          type: 'input_image' as const,
          image_url: `data:${mimeType};base64,${base64}`,
          detail: 'high' as const,
        };

    const response = await client.responses.create({
      model,
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: [
                'この牛関連帳票をFarmPro取り込み候補として読み取ってください。',
                '帳票名や固定座標ではなく、項目の意味を判断してください。',
                '個体識別番号、帳票上の管理番号、登録番号、名号、生年月日、父牛、母牛、母の父、祖母の父、産歴・子牛情報を抽出してください。',
                '公的な10桁の個体識別番号だと確認できる値だけ identificationNumber に入れてください。',
                '「個体識別明細番号」「母牛No.」「管理番号」など、帳票固有の参照番号は sourceReferenceNumber に入れ、identificationNumber へ流用しないでください。',
                '判読できない値は推測せず空文字にしてください。',
                '和暦の日付は可能ならYYYY-MM-DDへ変換してください。',
                '産歴は表の行関係を見て、産次・子牛名号・生年月日・父牛を対応付けてください。',
                '確信が持てない点はnotesへ日本語で記録してください。',
                '正式保存はFarmPro側で人が確認してから行うため、ここでは候補だけを返してください。',
              ].join('\n'),
            },
            documentInput,
          ],
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'farmpro_cattle_document_candidate',
          strict: true,
          schema: candidateSchema,
        },
      },
    });

    const outputText = response.output_text?.trim();
    if (!outputText) {
      res.status(502).json({ message: 'AIから読み取り候補が返りませんでした。' });
      return;
    }

    const parsed = JSON.parse(outputText);
    res.json({
      candidate: {
        identificationNumber: parsed.identificationNumber || '',
        sourceReferenceNumber: parsed.sourceReferenceNumber || '',
        registrationNumber: parsed.registrationNumber || '',
        name: parsed.name || '',
        birthday: parsed.birthday || '',
        sire: parsed.sire || '',
        dam: parsed.dam || '',
        maternalSire: parsed.maternalSire || '',
        maternalGrandSire: parsed.maternalGrandSire || '',
        offspring: Array.isArray(parsed.offspring) ? parsed.offspring : [],
      },
      notes: Array.isArray(parsed.notes) ? parsed.notes : [],
      source: 'ai',
      model,
    });
  } catch (caught) {
    console.error('AI cattle document analysis failed', caught);
    const message = caught instanceof Error ? caught.message : 'AI画像解析に失敗しました。';
    res.status(502).json({ message });
  }
});
