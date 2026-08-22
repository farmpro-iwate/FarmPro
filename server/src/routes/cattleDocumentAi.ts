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
    sex: { type: 'string', enum: ['', '雌', '雄', '去勢'] },
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
          sex: { type: 'string', enum: ['', '雌', '雄', '去勢', '♀', '♂'] },
          sire: { type: 'string' },
          calvingIntervalDays: { type: 'string' },
          salePrice: { type: 'string' },
        },
        required: ['parity', 'name', 'birthday', 'sex', 'sire', 'calvingIntervalDays', 'salePrice'],
      },
    },
    notes: { type: 'array', items: { type: 'string' } },
  },
  required: [
    'identificationNumber',
    'sourceReferenceNumber',
    'registrationNumber',
    'name',
    'birthday',
    'sex',
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
  previewImageBase64?: string;
  detailImageBase64s?: string[];
};

function normalizeOffspringSex(value: unknown): '' | '雌' | '雄' | '去勢' {
  const sex = String(value || '').trim();
  if (sex === '♀' || sex === '雌') return '雌';
  if (sex === '♂' || sex === '雄') return '雄';
  if (sex === '去勢') return '去勢';
  return '';
}

cattleDocumentAiRouter.post('/', async (req, res) => {
  const { fileName, mimeType, base64, previewImageBase64, detailImageBase64s } = (req.body || {}) as RequestBody;

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
      ? { type: 'input_file' as const, filename: fileName, file_data: `data:application/pdf;base64,${base64}` }
      : { type: 'input_image' as const, image_url: `data:${mimeType};base64,${base64}`, detail: 'high' as const };

    const content: any[] = [
      {
        type: 'input_text',
        text: [
          'この牛関連帳票をFarmPro取り込み候補として読み取ってください。',
          '帳票の種類、縦横、項目の配置、固定座標を決め打ちせず、見出し・表構造・項目の意味から判断してください。',
          'スマホ写真では、帳票全体、文字強調版、重なり付きの複数拡大画像が送られることがあります。すべて同じ帳票として照合してください。',
          '拡大画像の順番や位置から項目を推測しないでください。各画像内の見出し、ラベル、表の列名、行関係を読んで項目を特定してください。',
          '個体識別番号、帳票上の管理番号、登録番号、名号、生年月日、性別、父牛、母牛、母の父、祖母の父、産歴・子牛情報を抽出してください。',
          '重要: 10桁の個体識別番号は10桁すべて確認できた場合だけ identificationNumber に入れてください。罫線・影・折れ・反射に重なっている数字は、全体画像・文字強調画像・拡大画像を照合してください。',
          '9桁しか確認できない場合や一部が不鮮明な場合は推測で補わず空文字にし、notesへ「個体識別番号要確認」と残してください。',
          '登録番号と個体識別番号を混同しないでください。',
          '名号・父牛・母牛・母の父・祖母の父は、帳票上の見出しと血統関係を確認して対応付けてください。配置だけで判断しないでください。',
          '母牛本人の性別は帳票に明記されている場合だけ sex に入れ、雌・雄・去勢へ正規化してください。',
          '産歴・子牛情報では、産次、子牛名号、生年月日、産子の性別、父牛、分娩間隔、販売価格を同じ行・同じ記録として対応付けてください。',
          '♀は雌、♂は雄です。親牛の性別と産子の性別を混同しないでください。',
          'calvingIntervalDays は日数だけを文字列で返してください。',
          'salePrice は円単位の金額だけを文字列で返してください。桁区切り記号や円記号は付けないでください。',
          '販売価格が複数ある場合は、子牛の実際の販売・落札・取引価格に相当する欄を優先してください。判断できなければ空文字にしてください。',
          '和暦の日付は可能ならYYYY-MM-DDへ変換してください。',
          '名号・血統名・数値は推測で補完しないでください。読み取れない項目は空文字にしてください。',
          '縦向き写真でも横向き写真でも、文字の向きと帳票の構造を見て正しく解釈してください。',
          '正式保存はFarmPro側で人が確認してから行うため、ここでは候補だけを返してください。',
        ].join('\n'),
      },
      documentInput,
    ];

    if (previewImageBase64) {
      content.push({ type: 'input_image', image_url: `data:image/jpeg;base64,${previewImageBase64}`, detail: 'high' });
    }

    if (Array.isArray(detailImageBase64s)) {
      for (const imageBase64 of detailImageBase64s.slice(0, 4)) {
        if (!imageBase64) continue;
        content.push({ type: 'input_image', image_url: `data:image/jpeg;base64,${imageBase64}`, detail: 'high' });
      }
    }

    const response = await client.responses.create({
      model,
      input: [{ role: 'user', content }],
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
        sex: ['雌', '雄', '去勢'].includes(parsed.sex) ? parsed.sex : '',
        sire: parsed.sire || '',
        dam: parsed.dam || '',
        maternalSire: parsed.maternalSire || '',
        maternalGrandSire: parsed.maternalGrandSire || '',
        offspring: Array.isArray(parsed.offspring)
          ? parsed.offspring.map((row: any) => ({
              ...row,
              sex: normalizeOffspringSex(row?.sex),
            }))
          : [],
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
