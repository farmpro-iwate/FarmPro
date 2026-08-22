import * as pdfjs from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { createWorker } from 'tesseract.js';
import { extractPdfText, isUsefulPdfText } from '../utils/documentTextReader';

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export type OffspringCandidate = {
  parity: string;
  name: string;
  birthday: string;
  sex: '' | '雌' | '雄' | '去勢';
  sire: string;
  calvingIntervalDays: string;
  salePrice: string;
};
export type CattleImportCandidate = {
  identificationNumber: string;
  sourceReferenceNumber?: string;
  registrationNumber: string;
  name: string;
  birthday: string;
  sex: '' | '雌' | '雄' | '去勢';
  sire: string;
  dam: string;
  maternalSire: string;
  maternalGrandSire: string;
  offspring: OffspringCandidate[];
};

export type CattleDocumentReadResult = {
  candidate: CattleImportCandidate;
  rawText: string;
  source: 'pdf-text' | 'local-ocr' | 'ai';
  notes?: string[];
  model?: string;
};

export type CattleDocumentReadProgress = {
  status: string;
  progress?: number;
};

export type CattleDocumentReader = {
  id: 'local' | 'ai';
  label: string;
  read(file: File, options?: { onProgress?: (progress: CattleDocumentReadProgress) => void }): Promise<CattleDocumentReadResult>;
};

export const emptyCattleImportCandidate: CattleImportCandidate = {
  identificationNumber: '',
  sourceReferenceNumber: '',
  registrationNumber: '',
  name: '',
  birthday: '',
  sex: '',
  sire: '',
  dam: '',
  maternalSire: '',
  maternalGrandSire: '',
  offspring: [],
};

function normalizeEraDate(raw: string) {
  const normalized = raw.trim().replace(/令和/g, 'R').replace(/平成/g, 'H').replace(/昭和/g, 'S').replace(/[年.\/]/g, '-').replace(/月/g, '-').replace(/日/g, '').replace(/--+/g, '-');
  const eraMatch = normalized.match(/^([RHS])\s*(\d{1,2})-(\d{1,2})-(\d{1,2})$/i);
  if (eraMatch) {
    const era = eraMatch[1].toUpperCase();
    const year = Number(eraMatch[2]);
    const month = Number(eraMatch[3]);
    const day = Number(eraMatch[4]);
    const baseYear = era === 'R' ? 2018 : era === 'H' ? 1988 : 1925;
    return `${baseYear + year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  const westernMatch = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (westernMatch) return `${westernMatch[1]}-${String(Number(westernMatch[2])).padStart(2, '0')}-${String(Number(westernMatch[3])).padStart(2, '0')}`;
  return raw.trim();
}

function looksLikeDate(value: string) {
  return /^(?:[RHS]\s*)?\d{1,4}[.年\/-]\d{1,2}(?:[.月\/-]\d{1,2}日?)?$/i.test(value.trim());
}

function normalizeSex(text: string): '' | '雌' | '雄' | '去勢' {
  const normalized = text.replace(/\s+/g, '');
  if (/(去勢|castrat)/i.test(normalized)) return '去勢';
  if (/(雌|メス|♀|female)/i.test(normalized)) return '雌';
  if (/(雄|オス|♂|male)/i.test(normalized)) return '雄';
  return '';
}

function tokenizeLine(line: string) {
  return line.replace(/[｜|]/g, ' ').replace(/[：:]/g, ' ').split(/\s+/).map((value) => value.trim()).filter(Boolean);
}

export function parseCattleCandidate(text: string): CattleImportCandidate {
  const lines = text.split(/\r?\n/).map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const sourceReferenceNumber = text.match(/\b\d{4}[-－]\d{4}[-－]\d\b/)?.[0]?.replace(/－/g, '-') || '';
  const registrationNumber = text.match(/\b\d{3}[-－]\d{7}\b/)?.[0]?.replace(/－/g, '-') || '';
  const sex = normalizeSex(lines.find((line) => /(性別|雌|雄|去勢|メス|オス|♀|♂)/.test(line)) || '');
  let name = '';
  let birthday = '';
  let sire = '';
  let dam = '';
  let maternalSire = '';
  let maternalGrandSire = '';

  if (sourceReferenceNumber) {
    const detailLine = lines.find((line) => line.replace(/－/g, '-').includes(sourceReferenceNumber));
    if (detailLine) {
      const tokens = tokenizeLine(detailLine).map((token) => token.replace(/－/g, '-'));
      const idIndex = tokens.findIndex((token) => token === sourceReferenceNumber);
      if (idIndex >= 0) {
        let cursor = idIndex + 1;
        if (tokens[cursor] === registrationNumber) cursor += 1;
        name = tokens[cursor] || '';
        cursor += 1;
        if (looksLikeDate(tokens[cursor] || '')) {
          birthday = normalizeEraDate(tokens[cursor]);
          cursor += 1;
        }
        sire = tokens[cursor] || '';
        dam = tokens[cursor + 1] || '';
        maternalSire = tokens[cursor + 2] || '';
        maternalGrandSire = tokens[cursor + 3] || '';
      }
    }
  }

  const offspring: OffspringCandidate[] = [];
  for (const line of lines) {
    const tokens = tokenizeLine(line);
    if (!/^\d{1,2}$/.test(tokens[0] || '')) continue;
    const dateIndex = tokens.findIndex((token, index) => index > 0 && looksLikeDate(token));
    if (dateIndex < 2) continue;
    const parity = tokens[0];
    if (offspring.some((row) => row.parity === parity)) continue;
    const rowName = tokens[1] || '';
    const rowBirthday = normalizeEraDate(tokens[dateIndex]);
    const rowSex = normalizeSex(tokens.find((token) => /(雌|雄|去勢|メス|オス|♀|♂)/.test(token)) || '');
    const rowSire = tokens[dateIndex + 1] || '';
    if (rowBirthday && rowName && rowName !== name) offspring.push({ parity, name: rowName, birthday: rowBirthday, sex: rowSex, sire: rowSire, calvingIntervalDays: '', salePrice: '' });
  }

  return { identificationNumber: '', sourceReferenceNumber, registrationNumber, name, birthday, sex, sire, dam, maternalSire, maternalGrandSire, offspring };
}

async function imageFileToCanvas(file: File, maxLongEdge = 3600) {
  const imageUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = imageUrl;
    await image.decode();
    const longEdge = Math.max(image.naturalWidth, image.naturalHeight);
    const scale = Math.min(1, maxLongEdge / longEdge);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('画像を処理できませんでした。');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

function createEnhancedDocumentCanvas(source: HTMLCanvasElement) {
  const canvas = document.createElement('canvas');
  canvas.width = source.width;
  canvas.height = source.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('読み取り用画像を作成できませんでした。');
  context.save();
  context.filter = 'grayscale(100%) contrast(145%) brightness(108%)';
  context.drawImage(source, 0, 0);
  context.restore();
  return canvas;
}

function createCrop(source: HTMLCanvasElement, x0: number, y0: number, x1: number, y1: number) {
  const sx = Math.max(0, Math.floor(source.width * x0));
  const sy = Math.max(0, Math.floor(source.height * y0));
  const ex = Math.min(source.width, Math.ceil(source.width * x1));
  const ey = Math.min(source.height, Math.ceil(source.height * y1));
  const sw = Math.max(1, ex - sx);
  const sh = Math.max(1, ey - sy);
  const canvas = document.createElement('canvas');
  canvas.width = sw;
  canvas.height = sh;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('拡大確認用画像を作成できませんでした。');
  context.drawImage(source, sx, sy, sw, sh, 0, 0, sw, sh);
  return canvas;
}

function createOrientationIndependentCrops(source: HTMLCanvasElement) {
  return [
    createCrop(source, 0, 0, 0.62, 0.62),
    createCrop(source, 0.38, 0, 1, 0.62),
    createCrop(source, 0, 0.38, 0.62, 1),
    createCrop(source, 0.38, 0.38, 1, 1),
  ];
}

function autoCropDocument(source: HTMLCanvasElement) {
  const analysisMaxEdge = 900;
  const scale = Math.min(1, analysisMaxEdge / Math.max(source.width, source.height));
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));
  const analysis = document.createElement('canvas');
  analysis.width = width;
  analysis.height = height;
  const context = analysis.getContext('2d', { willReadFrequently: true });
  if (!context) return source;
  context.drawImage(source, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height).data;

  const rowHits = new Uint32Array(height);
  const colHits = new Uint32Array(width);
  let brightPixels = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const r = pixels[index];
      const g = pixels[index + 1];
      const b = pixels[index + 2];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const brightness = (r + g + b) / 3;
      const saturation = max - min;
      const looksLikePaper = brightness >= 168 && saturation <= 72;
      if (!looksLikePaper) continue;
      rowHits[y] += 1;
      colHits[x] += 1;
      brightPixels += 1;
    }
  }

  if (brightPixels < width * height * 0.12) return source;

  const rowThreshold = Math.max(6, Math.floor(width * 0.24));
  const colThreshold = Math.max(6, Math.floor(height * 0.24));
  let top = 0;
  while (top < height && rowHits[top] < rowThreshold) top += 1;
  let bottom = height - 1;
  while (bottom > top && rowHits[bottom] < rowThreshold) bottom -= 1;
  let left = 0;
  while (left < width && colHits[left] < colThreshold) left += 1;
  let right = width - 1;
  while (right > left && colHits[right] < colThreshold) right -= 1;

  if (right <= left || bottom <= top) return source;

  const detectedWidth = right - left + 1;
  const detectedHeight = bottom - top + 1;
  const detectedAreaRatio = (detectedWidth * detectedHeight) / (width * height);
  if (detectedAreaRatio < 0.22) return source;

  const paddingX = Math.round(detectedWidth * 0.035);
  const paddingY = Math.round(detectedHeight * 0.035);
  left = Math.max(0, left - paddingX);
  right = Math.min(width - 1, right + paddingX);
  top = Math.max(0, top - paddingY);
  bottom = Math.min(height - 1, bottom + paddingY);

  const sourceLeft = Math.floor(left / scale);
  const sourceTop = Math.floor(top / scale);
  const sourceRight = Math.ceil((right + 1) / scale);
  const sourceBottom = Math.ceil((bottom + 1) / scale);
  const cropWidth = Math.min(source.width - sourceLeft, Math.max(1, sourceRight - sourceLeft));
  const cropHeight = Math.min(source.height - sourceTop, Math.max(1, sourceBottom - sourceTop));

  const originalArea = source.width * source.height;
  const cropArea = cropWidth * cropHeight;
  if (cropArea / originalArea > 0.95) return source;

  const cropped = document.createElement('canvas');
  cropped.width = cropWidth;
  cropped.height = cropHeight;
  const croppedContext = cropped.getContext('2d');
  if (!croppedContext) return source;
  croppedContext.drawImage(source, sourceLeft, sourceTop, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
  return cropped;
}

async function pdfFileToCanvas(file: File, scale = 2) {
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data }).promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('PDFを画像へ変換できませんでした。');
  await page.render({ canvasContext: context, viewport }).promise;
  return canvas;
}

function canvasToJpegBase64(canvas: HTMLCanvasElement, quality = 0.92) {
  const dataUrl = canvas.toDataURL('image/jpeg', quality);
  const separator = dataUrl.indexOf(',');
  if (separator < 0) throw new Error('読み取り用画像を作成できませんでした。');
  return dataUrl.slice(separator + 1);
}

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('帳票ファイルをAI送信用に変換できませんでした。'));
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      const separator = dataUrl.indexOf(',');
      if (separator < 0) {
        reject(new Error('帳票ファイルをAI送信用に変換できませんでした。'));
        return;
      }
      resolve(dataUrl.slice(separator + 1));
    };
    reader.readAsDataURL(file);
  });
}

const ocrBase = `${import.meta.env.BASE_URL}ocr`;

export const localCattleDocumentReader: CattleDocumentReader = {
  id: 'local',
  label: '端末内読み取り',
  async read(file, options) {
    const onProgress = options?.onProgress;
    const lowerName = file.name.toLowerCase();
    const isPdf = file.type === 'application/pdf' || lowerName.endsWith('.pdf');

    if (isPdf) {
      onProgress?.({ status: 'PDF内の文字データを確認しています…' });
      const embeddedText = await extractPdfText(file);
      if (isUsefulPdfText(embeddedText)) {
        onProgress?.({ status: 'PDF内の文字データから候補を作成しました。', progress: 100 });
        return { candidate: parseCattleCandidate(embeddedText), rawText: embeddedText, source: 'pdf-text' };
      }
    }

    onProgress?.({ status: '画像OCRの準備をしています…' });
    const canvas = isPdf ? await pdfFileToCanvas(file) : await imageFileToCanvas(file, 2400);
    let worker: Awaited<ReturnType<typeof createWorker>> | null = null;
    try {
      worker = await createWorker('jpn', undefined, {
        workerPath: `${ocrBase}/worker.min.js`, corePath: `${ocrBase}/core`, langPath: `${ocrBase}/lang`,
        logger: (message) => onProgress?.({ status: message.status ? `読み取り中：${message.status}` : '読み取り中…', progress: typeof message.progress === 'number' ? Math.round(message.progress * 100) : undefined }),
        errorHandler: (workerError) => console.error('Tesseract worker error', workerError),
      });
      const result = await worker.recognize(canvas);
      const text = String(result?.data?.text || '').trim();
      if (!text) throw new Error('文字を読み取れませんでした。画像のピント・明るさ・帳票全体が写っているか確認してください。');
      onProgress?.({ status: '画像OCRから候補を作成しました。', progress: 100 });
      return { candidate: parseCattleCandidate(text), rawText: text, source: 'local-ocr' };
    } finally {
      if (worker) await worker.terminate().catch(() => undefined);
    }
  },
};

export const aiCattleDocumentReader: CattleDocumentReader = {
  id: 'ai',
  label: 'AI画像解析',
  async read(file, options) {
    const onProgress = options?.onProgress;
    const lowerName = file.name.toLowerCase();
    const isPdf = file.type === 'application/pdf' || lowerName.endsWith('.pdf');
    onProgress?.({ status: 'AI画像解析の送信準備をしています…', progress: 10 });

    let base64: string;
    let mimeType: string;
    let previewImageBase64: string | undefined;
    let detailImageBase64s: string[] | undefined;

    if (isPdf) {
      base64 = await fileToBase64(file);
      mimeType = 'application/pdf';
      onProgress?.({ status: '小さい文字を確認する高解像度画像を作成しています…', progress: 20 });
      previewImageBase64 = canvasToJpegBase64(await pdfFileToCanvas(file, 3.2));
    } else {
      onProgress?.({ status: 'スマホ写真の向きと解像度を整えています…', progress: 18 });
      const photoCanvas = await imageFileToCanvas(file, 3400);
      onProgress?.({ status: '帳票部分を自動で切り出しています…', progress: 22 });
      const documentCanvas = autoCropDocument(photoCanvas);
      base64 = canvasToJpegBase64(documentCanvas, 0.92);
      mimeType = 'image/jpeg';
      onProgress?.({ status: '細い文字・罫線を確認する文字強調画像を作成しています…', progress: 26 });
      previewImageBase64 = canvasToJpegBase64(createEnhancedDocumentCanvas(documentCanvas), 0.9);
      onProgress?.({ status: '縦横に依存しない拡大確認画像を作成しています…', progress: 32 });
      detailImageBase64s = createOrientationIndependentCrops(documentCanvas).map((crop) => canvasToJpegBase64(crop, 0.9));
    }

    onProgress?.({ status: 'AIが帳票の意味と表構造を解析しています…', progress: 40 });
    const response = await fetch('/api/cattle-document-ai', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName: file.name, mimeType, base64, previewImageBase64, detailImageBase64s }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof payload?.message === 'string' ? payload.message : 'AI画像解析に失敗しました。');
    if (!payload?.candidate) throw new Error('AIからFarmPro取り込み候補が返りませんでした。');
    onProgress?.({ status: 'AIの読み取り候補をFarmPro項目へ反映しています…', progress: 90 });
    const notes = Array.isArray(payload.notes) ? payload.notes.map((value: unknown) => String(value)) : [];
    const model = typeof payload.model === 'string' ? payload.model : undefined;
    const rawText = JSON.stringify({ candidate: payload.candidate, notes, model }, null, 2);
    const candidateSex = ['雌', '雄', '去勢'].includes(payload.candidate.sex) ? payload.candidate.sex as '雌' | '雄' | '去勢' : '';
    return {
      candidate: {
        ...emptyCattleImportCandidate,
        ...payload.candidate,
        sex: candidateSex,
        offspring: Array.isArray(payload.candidate.offspring)
          ? payload.candidate.offspring.map((row: Partial<OffspringCandidate>) => ({
              parity: String(row.parity || ''),
              name: String(row.name || ''),
              birthday: String(row.birthday || ''),
              sex: ['雌', '雄', '去勢'].includes(String(row.sex || '')) ? String(row.sex) as '雌' | '雄' | '去勢' : '',
              sire: String(row.sire || ''),
              calvingIntervalDays: String(row.calvingIntervalDays || ''),
              salePrice: String(row.salePrice || ''),
            }))
          : [],
      },
      rawText, source: 'ai', notes, model,
    };
  },
};

export function getCattleDocumentReader(mode: 'local' | 'ai' = 'ai'): CattleDocumentReader {
  return mode === 'local' ? localCattleDocumentReader : aiCattleDocumentReader;
}
