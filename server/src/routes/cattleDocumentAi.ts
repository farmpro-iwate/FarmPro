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
};

function normalizeOffspringSex(value: unknown): '' | '雌' | '雄' | '去勢' {
  const sex = String(value || '').trim();
  if (sex === '♀' || sex === '雌') return '雌';
  if (sex === '♂' || sex === '雄') return '雄';
  if (sex === '去勢') return '去勢';
  return '';
}

cattleDocumentAiRouter.post('/', async (req, res) => {
  const { fileName, mimeType, base64, previewImageBase64 } = (req.body || {}) as RequestBody;

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
          '帳票名や固定座標ではなく、項目の意味と表構造を判断してください。',
          '個体識別番号、帳票上の管理番号、登録番号、名号、生年月日、性別、父牛、母牛、母の父、祖母の父、産歴・子牛情報を抽出してください。',
          'スマホ撮影画像の場合、元画像と文字強調画像の2枚が送られることがあります。同一帳票として両方を照合し、片方だけで判断しないでください。',
          '重要: 罫線・影・折れ・反射に文字や数字が重なっている場合、文字強調画像でも再確認してください。特に10桁の個体識別番号は先頭桁と末尾桁を省略せず、10桁すべて確認してください。',
          '個体識別番号らしい数字列が9桁しか見えない場合、見えない1桁を推測して補わず、元画像と文字強調画像を再確認してください。それでも10桁を確認できない場合は identificationNumber を空文字にし、notesへ「個体識別番号要確認」と残してください。',
          '名号・血統名・登録番号・産歴の数字も、罫線に重なっている場合は2画像を照合してください。',
          '母牛本人の性別は帳票に明記されている場合だけ sex に入れ、雌・雄・去勢のいずれかへ正規化してください。判別できない場合は空文字にしてください。',
          '産歴・子牛情報では、産次・子牛名号・生年月日・産子の性別・父牛に加えて、その行に分娩間隔と販売価格があれば抽出してください。',
          '重要: 産子の性別欄は文字ではなく記号で印刷されていることがあります。♀ は雌、♂ は雄を意味します。各産次の行にある ♀ / ♂ を必ず確認してください。',
          '産子の sex は、原稿に ♀ があれば「♀」、♂ があれば「♂」をそのまま返してください。文字で雌・雄・去勢と記載されている場合はその文字を返して構いません。親牛の性別と混同しないでください。',
          '性別欄が判別できない場合だけ空文字にしてください。産子名や父牛名などから性別を推測しないでください。',
          'PDFに高解像度プレビュー画像がある場合、産歴表の各行を拡大して、特に小さい ♀ / ♂ 記号を再確認してください。',
          'calvingIntervalDays は日数だけを文字列で返してください。例: 365。読み取れない場合は空文字にしてください。',
          'salePrice は円単位の金額だけを文字列で返してください。桁区切り記号や円記号は付けず、例: 650000。読み取れない場合は空文字にしてください。',
          '販売価格に複数の価格欄がある場合は、子牛の実際の販売価格・落札価格・取引価格に相当するものを優先してください。判断できなければ空文字にしてください。',
          '公的な10桁の個体識別番号だと確認できる値だけ identificationNumber に入れてください。',
          'sourceReferenceNumber には帳票固有の主参照番号だけを入れてください。',
          '名号・血統名・数値は推測で補完しないでください。',
          'PDFに加えて高解像度プレビュー画像がある場合、小さい文字・和牛名号・血統名・性別・産歴の数値欄を画像でも再確認してください。',
          '再確認しても不鮮明な項目は空文字にし、notesへ要確認として残してください。',
          '和暦の日付は可能ならYYYY-MM-DDへ変換してください。',
          '産歴は表の行関係を見て各項目を正しい産次へ対応付けてください。',
          '正式保存はFarmPro側で人が確認してから行うため、ここでは候補だけを返してください。',
        ].join('\n'),
      },
      documentInput,
    ];

    if (previewImageBase64) {
      content.push({ type: 'input_image', image_url: `data:image/jpeg;base64,${previewImageBase64}`, detail: 'high' });
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
