import * as pdfjs from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { createWorker } from 'tesseract.js';
import { extractPdfText, isUsefulPdfText } from '../utils/documentTextReader';

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export type OffspringCandidate = {
  parity: string;
  name: string;
  birthday: string;
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

function tokenizeLine(line: string) {
  return line.replace(/[｜|]/g, ' ').replace(/[：:]/g, ' ').split(/\s+/).map((value) => value.trim()).filter(Boolean);
}

export function parseCattleCandidate(text: string): CattleImportCandidate {
  const lines = text.split(/\r?\n/).map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const sourceReferenceNumber = text.match(/\b\d{4}[-－]\d{4}[-－]\d\b/)?.[0]?.replace(/－/g, '-') || '';
  const registrationNumber = text.match(/\b\d{3}[-－]\d{7}\b/)?.[0]?.replace(/－/g, '-') || '';
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
    const rowSire = tokens[dateIndex + 1] || '';
    if (rowBirthday && rowName && rowName !== name) offspring.push({ parity, name: rowName, birthday: rowBirthday, sire: rowSire, calvingIntervalDays: '', salePrice: '' });
  }

  return { identificationNumber: '', sourceReferenceNumber, registrationNumber, name, birthday, sire, dam, maternalSire, maternalGrandSire, offspring };
}

async function imageFileToCanvas(file: File) {
  const imageUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = imageUrl;
    await image.decode();
    const maxWidth = 2400;
    const scale = Math.min(1, maxWidth / image.naturalWidth);
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

function canvasToJpegBase64(canvas: HTMLCanvasElement) {
  const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
  const separator = dataUrl.indexOf(',');
  if (separator < 0) throw new Error('PDFプレビュー画像を作成できませんでした。');
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
    const canvas = isPdf ? await pdfFileToCanvas(file) : await imageFileToCanvas(file);
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
    const base64 = await fileToBase64(file);
    let previewImageBase64: string | undefined;
    if (isPdf) {
      onProgress?.({ status: '小さい文字を確認する高解像度画像を作成しています…', progress: 20 });
      previewImageBase64 = canvasToJpegBase64(await pdfFileToCanvas(file, 3.2));
    }
    onProgress?.({ status: 'AIが帳票の意味と表構造を解析しています…', progress: 35 });
    const response = await fetch('/api/cattle-document-ai', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName: file.name, mimeType: file.type || (isPdf ? 'application/pdf' : 'image/jpeg'), base64, previewImageBase64 }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof payload?.message === 'string' ? payload.message : 'AI画像解析に失敗しました。');
    if (!payload?.candidate) throw new Error('AIからFarmPro取り込み候補が返りませんでした。');
    onProgress?.({ status: 'AIの読み取り候補をFarmPro項目へ反映しています…', progress: 90 });
    const notes = Array.isArray(payload.notes) ? payload.notes.map((value: unknown) => String(value)) : [];
    const model = typeof payload.model === 'string' ? payload.model : undefined;
    const rawText = JSON.stringify({ candidate: payload.candidate, notes, model }, null, 2);
    return {
      candidate: {
        ...emptyCattleImportCandidate,
        ...payload.candidate,
        offspring: Array.isArray(payload.candidate.offspring)
          ? payload.candidate.offspring.map((row: Partial<OffspringCandidate>) => ({ parity: String(row.parity || ''), name: String(row.name || ''), birthday: String(row.birthday || ''), sire: String(row.sire || ''), calvingIntervalDays: String(row.calvingIntervalDays || ''), salePrice: String(row.salePrice || '') }))
          : [],
      },
      rawText, source: 'ai', notes, model,
    };
  },
};

export function getCattleDocumentReader(mode: 'local' | 'ai' = 'ai'): CattleDocumentReader {
  return mode === 'local' ? localCattleDocumentReader : aiCattleDocumentReader;
}
