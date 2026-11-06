import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { prepareDocumentAiInput } from './documentAiInput';
import { aiCattleDocumentReader, emptyCattleImportCandidate } from './cattleDocumentReader';

vi.mock('./documentAiInput', () => ({
  prepareDocumentAiInput: vi.fn(), imageFileToCanvas: vi.fn(), pdfFileToCanvas: vi.fn(),
}));
vi.mock('../utils/documentTextReader', () => ({ extractPdfText: vi.fn(), isUsefulPdfText: vi.fn() }));
vi.mock('tesseract.js', () => ({ createWorker: vi.fn() }));

beforeEach(() => vi.resetAllMocks());
afterEach(() => vi.unstubAllGlobals());

it('keeps the cattle reading request and result when document preparation is shared', async () => {
  const file = new File(['fixture'], 'cattle-example.pdf', { type: 'application/pdf' });
  const prepared = { fileName: file.name, mimeType: 'application/pdf', base64: 'cGRm', previewImageBase64: 'cHJldmlldw==' };
  vi.mocked(prepareDocumentAiInput).mockResolvedValue(prepared);
  const candidate = { ...emptyCattleImportCandidate, name: '見本牛', sex: '雌' };
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ candidate, notes: ['確認用'], model: 'fixture-model' })));
  const onProgress = vi.fn();
  const result = await aiCattleDocumentReader.read(file, { onProgress });
  expect(prepareDocumentAiInput).toHaveBeenCalledWith(file, { onProgress });
  expect(fetch).toHaveBeenCalledWith('/api/cattle-document-ai', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(prepared),
  });
  expect(result).toMatchObject({ candidate, source: 'ai', notes: ['確認用'], model: 'fixture-model' });
});

it('does not send a cattle document when image preparation fails', async () => {
  vi.mocked(prepareDocumentAiInput).mockRejectedValue(new Error('画像を処理できませんでした。'));
  vi.stubGlobal('fetch', vi.fn());
  await expect(aiCattleDocumentReader.read(new File(['fixture'], 'cattle-example.jpg'))).rejects.toThrow('画像を処理できませんでした。');
  expect(fetch).not.toHaveBeenCalled();
});
