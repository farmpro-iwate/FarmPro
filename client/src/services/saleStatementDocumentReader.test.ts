import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAuthToken } from './authClient';
import { prepareDocumentAiInput } from './documentAiInput';
import { readSaleStatementDocument } from './saleStatementDocumentReader';
import { emptySaleStatementCandidate } from '../utils/saleStatementImport';

vi.mock('./authClient', () => ({ getAuthToken: vi.fn() }));
vi.mock('./documentAiInput', () => ({ prepareDocumentAiInput: vi.fn() }));

const candidate = {
  ...emptySaleStatementCandidate,
  documentType: 'sale-settlement', animalCount: '1', grossYen: '110000',
  netYen: '105000', deductionTotalYen: '5000',
  deductions: [{ label: '市場手数料', amountYen: '5000' }],
};
const prepared = { fileName: 'example.jpeg', mimeType: 'image/jpeg', base64: 'ZmFrZQ==',
  previewImageBase64: 'cHJldmlldw==', detailImageBase64s: ['ZGV0YWls'] };
const photo = () => new File(['fixture'], 'example.jpeg', { type: 'image/jpeg' });

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getAuthToken).mockReturnValue('test-session');
  vi.mocked(prepareDocumentAiInput).mockResolvedValue(prepared);
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ candidate, source: 'ai' })));
});
afterEach(() => vi.unstubAllGlobals());

describe('sale statement document reader', () => {
  it('reuses document preparation and sends only a reading request with the current session', async () => {
    const file = photo();
    const onProgress = vi.fn();
    expect(await readSaleStatementDocument(file, { onProgress })).toEqual(candidate);
    expect(prepareDocumentAiInput).toHaveBeenCalledWith(file, { onProgress });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith('/api/sale-statement-document-ai', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-session' },
      body: JSON.stringify(prepared),
    });
    expect(onProgress).toHaveBeenLastCalledWith({ status: '読み取り候補を作成しました。内容を確認してください。', progress: 100 });
  });

  it('returns readable but unbalanced candidates for correction instead of fixing their amounts', async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ candidate: { ...candidate, netYen: '105001' }, source: 'ai' }));
    expect((await readSaleStatementDocument(photo())).netYen).toBe('105001');
  });

  it.each([
    ['example.pdf', 'application/pdf'], ['PHOTO.PNG', 'image/png'], ['photo.HEIC', ''],
  ])('accepts a supported file for shared preparation: %s', async (name, type) => {
    const file = new File(['fixture'], name, { type });
    await readSaleStatementDocument(file);
    expect(prepareDocumentAiInput).toHaveBeenCalledWith(file, undefined);
  });

  it.each([
    ['data.csv', 'text/csv'], ['drawing.svg', 'image/svg+xml'], ['bad.pdf', 'image/jpeg'], ['unknown', ''],
  ])('does not send unsupported or contradictory file types: %s', async (name, type) => {
    await expect(readSaleStatementDocument(new File(['fixture'], name, { type }))).rejects.toThrow(/画像またはPDF/);
    expect(prepareDocumentAiInput).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not prepare an empty or oversized file', async () => {
    await expect(readSaleStatementDocument(new File([], 'empty.pdf', { type: 'application/pdf' }))).rejects.toThrow(/ファイルが空/);
    const large = photo();
    Object.defineProperty(large, 'size', { value: 10 * 1024 * 1024 + 1 });
    await expect(readSaleStatementDocument(large)).rejects.toThrow(/10MB/);
    expect(prepareDocumentAiInput).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not post an expanded request above the server request budget', async () => {
    vi.mocked(prepareDocumentAiInput).mockResolvedValue({ ...prepared, base64: 'x'.repeat(18 * 1024 * 1024) });
    await expect(readSaleStatementDocument(photo())).rejects.toThrow(/読み取り用画像が大きすぎ/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not prepare or send a document while logged out', async () => {
    vi.mocked(getAuthToken).mockReturnValue(null);
    await expect(readSaleStatementDocument(photo())).rejects.toThrow(/ログイン状態/);
    expect(prepareDocumentAiInput).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('stops if the session changes while the image is being prepared', async () => {
    vi.mocked(getAuthToken).mockReturnValueOnce('test-session').mockReturnValue('other-session');
    await expect(readSaleStatementDocument(photo())).rejects.toThrow(/ログイン状態/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not return a previous-session response after an account change', async () => {
    vi.mocked(fetch).mockImplementation(async () => {
      vi.mocked(getAuthToken).mockReturnValue('other-session');
      return Response.json({ candidate, source: 'ai' });
    });
    await expect(readSaleStatementDocument(photo())).rejects.toThrow(/ログイン状態/);
  });

  it('also checks the session after the response body has finished arriving', async () => {
    const response = Response.json({ candidate, source: 'ai' });
    vi.spyOn(response, 'json').mockImplementation(async () => {
      vi.mocked(getAuthToken).mockReturnValue('other-session');
      return { candidate, source: 'ai' };
    });
    vi.mocked(fetch).mockResolvedValue(response);
    await expect(readSaleStatementDocument(photo())).rejects.toThrow(/ログイン状態/);
  });

  it.each([422, 502, 503])('reports the reading error without returning a candidate: %s', async (status) => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ message: 'この書類の内容を確認してください。' }, { status }));
    await expect(readSaleStatementDocument(photo())).rejects.toThrow('この書類の内容を確認してください。');
  });

  it('shows a session error on 401 and a readable communication error on a network failure', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({}, { status: 401 })).mockRejectedValueOnce(new TypeError('network lost'));
    await expect(readSaleStatementDocument(photo())).rejects.toThrow(/ログイン状態/);
    await expect(readSaleStatementDocument(photo())).rejects.toThrow(/通信を確認/);
  });

  it.each([
    {}, { source: 'ai' }, { source: 'local', candidate },
    { source: 'ai', candidate: { ...candidate, grossYen: 110000 } },
    { source: 'ai', candidate: { ...candidate, deductions: undefined } },
  ])('rejects malformed provider output: %j', async (payload) => {
    vi.mocked(fetch).mockResolvedValue(Response.json(payload));
    await expect(readSaleStatementDocument(photo())).rejects.toThrow(/候補が返りません|形式が不正/);
  });

  it('handles a non-JSON success response as a reading failure', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('not-json'));
    await expect(readSaleStatementDocument(photo())).rejects.toThrow(/候補が返りません/);
  });
});
