import { getAuthToken } from './authClient';
import type { DocumentAiReadProgress } from './documentAiInput';
import { normalizeFeedDocumentCandidate, type FeedDocumentCandidate } from '../utils/feedDocumentImport';

const maxFileBytes = 10 * 1024 * 1024;
const maxRequestBytes = 18 * 1024 * 1024;
const imageMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);
const imageExtension = /\.(?:jpe?g|png|webp|heic|heif)$/i;
const loginError = () => new Error('ログイン状態を確認してから、納品書・請求書を読み取ってください。');

function checkFile(file: File) {
  const type = file.type.toLowerCase();
  const untyped = !type || type === 'application/octet-stream';
  const pdf = type === 'application/pdf' || (untyped && /\.pdf$/i.test(file.name));
  const image = imageMimeTypes.has(type) || (untyped && imageExtension.test(file.name));
  if ((!pdf && !image) || (image && /\.pdf$/i.test(file.name))) {
    throw new Error('納品書・請求書の画像またはPDFファイルを選んでください。');
  }
  if (!file.size) throw new Error('ファイルが空です。納品書・請求書の画像またはPDFを選び直してください。');
  if (file.size > maxFileBytes) throw new Error('納品書・請求書のファイルは10MB以下にしてください。');
}

export async function readFeedDocument(
  file: File,
  options?: { onProgress?: (progress: DocumentAiReadProgress) => void },
): Promise<FeedDocumentCandidate> {
  checkFile(file);
  const token = getAuthToken();
  if (!token) throw loginError();
  const { prepareDocumentAiInput } = await import('./documentAiInput');
  if (getAuthToken() !== token) throw loginError();
  const input = await prepareDocumentAiInput(file, options);
  if (getAuthToken() !== token) throw loginError();
  const body = JSON.stringify(input);
  if (new Blob([body]).size > maxRequestBytes) {
    throw new Error('読み取り用画像が大きすぎます。納品書・請求書を1枚ずつ撮影するか、ファイルを小さくしてください。');
  }
  options?.onProgress?.({ status: '納品書・請求書の内容を読み取っています…', progress: 40 });
  let response: Response;
  try {
    response = await fetch('/api/feed-document-ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body,
    });
  } catch {
    throw new Error('納品書・請求書を読み取れませんでした。通信を確認して、もう一度お試しください。');
  }
  if (getAuthToken() !== token) throw loginError();
  const payload = await response.json().catch(() => null);
  if (getAuthToken() !== token) throw loginError();
  if (!response.ok) {
    if (response.status === 401) throw loginError();
    throw new Error(typeof payload?.message === 'string' ? payload.message : '納品書・請求書の読み取りに失敗しました。');
  }
  if (!payload || payload.source !== 'ai' || !payload.candidate) {
    throw new Error('納品書・請求書の読み取り候補が返りませんでした。もう一度読み取ってください。');
  }
  const candidate = normalizeFeedDocumentCandidate(payload.candidate);
  options?.onProgress?.({ status: '読み取り候補を作成しました。内容を確認してください。', progress: 100 });
  return candidate;
}
