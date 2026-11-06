import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAuthToken } from './authClient';
import { prepareDocumentAiInput } from './documentAiInput';
import { readFeedDocument } from './feedDocumentReader';
import { emptyFeedDocumentCandidate, emptyFeedDocumentLine } from '../utils/feedDocumentImport';

vi.mock('./authClient', () => ({ getAuthToken: vi.fn() }));
vi.mock('./documentAiInput', () => ({ prepareDocumentAiInput: vi.fn() }));

const candidate = {
  ...emptyFeedDocumentCandidate, documentType: 'invoice', documentNumber: 'TEST-DOC-01',
  supplier: '検証用仕入先', deliveryDate: '2026-10-01',
  lines: [{ ...emptyFeedDocumentLine, kind: 'feed', feedName: '検証用配合飼料',
    quantity: '2', unit: '袋', bagWeightKg: '20', grossYen: '2200', netYen: '2000', taxYen: '200', taxRate: '10' }],
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

describe('feed document reader', () => {
  it('only posts a read request using shared preparation and the current session', async () => {
    const file = photo();
    const onProgress = vi.fn();
    expect(await readFeedDocument(file, { onProgress })).toEqual(candidate);
    expect(prepareDocumentAiInput).toHaveBeenCalledWith(file, { onProgress });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith('/api/feed-document-ai', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-session' },
      body: JSON.stringify(prepared),
    });
    expect(onProgress).toHaveBeenLastCalledWith({ status: '読み取り候補を作成しました。内容を確認してください。', progress: 100 });
  });

  it('keeps readable but conflicting tax values available for user correction', async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ source: 'ai', candidate: { ...candidate,
      lines: [{ ...candidate.lines[0], taxYen: '999' }] } }));
    expect((await readFeedDocument(photo())).lines[0].taxYen).toBe('999');
  });

  it.each([
    ['example.pdf', 'application/pdf'], ['PHOTO.PNG', 'image/png'], ['photo.webp', 'image/webp'],
    ['photo.HEIC', ''], ['photo.heif', 'image/heif'],
  ])('accepts a supported photo or PDF for preparation: %s', async (name, type) => {
    const file = new File(['fixture'], name, { type });
    await readFeedDocument(file);
    expect(prepareDocumentAiInput).toHaveBeenCalledWith(file, undefined);
  });

  it.each([
    ['data.csv', 'text/csv'], ['drawing.svg', 'image/svg+xml'], ['bad.pdf', 'image/jpeg'], ['unknown', ''],
  ])('does not transmit unsupported or contradictory file types: %s', async (name, type) => {
    await expect(readFeedDocument(new File(['fixture'], name, { type }))).rejects.toThrow(/画像またはPDF/);
    expect(prepareDocumentAiInput).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not prepare empty or oversized files', async () => {
    await expect(readFeedDocument(new File([], 'empty.pdf', { type: 'application/pdf' }))).rejects.toThrow(/ファイルが空/);
    const large = photo();
    Object.defineProperty(large, 'size', { value: 10 * 1024 * 1024 + 1 });
    await expect(readFeedDocument(large)).rejects.toThrow(/10MB/);
    expect(prepareDocumentAiInput).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not send expanded prepared images beyond the request limit', async () => {
    vi.mocked(prepareDocumentAiInput).mockResolvedValue({ ...prepared, base64: 'x'.repeat(18 * 1024 * 1024) });
    await expect(readFeedDocument(photo())).rejects.toThrow(/読み取り用画像が大きすぎ/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not prepare or send a document without a session', async () => {
    vi.mocked(getAuthToken).mockReturnValue(null);
    await expect(readFeedDocument(photo())).rejects.toThrow(/ログイン状態/);
    expect(prepareDocumentAiInput).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('stops if the session changes while the preparation module is loading', async () => {
    vi.mocked(getAuthToken).mockReturnValueOnce('test-session').mockReturnValue('another-session');
    await expect(readFeedDocument(photo())).rejects.toThrow(/ログイン状態/);
    expect(prepareDocumentAiInput).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('stops if the session changes while the image is being prepared', async () => {
    vi.mocked(prepareDocumentAiInput).mockImplementation(async () => {
      vi.mocked(getAuthToken).mockReturnValue('another-session');
      return prepared;
    });
    await expect(readFeedDocument(photo())).rejects.toThrow(/ログイン状態/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not deliver a previous-session response after a login change', async () => {
    vi.mocked(fetch).mockImplementation(async () => {
      vi.mocked(getAuthToken).mockReturnValue('another-session');
      return Response.json({ candidate, source: 'ai' });
    });
    await expect(readFeedDocument(photo())).rejects.toThrow(/ログイン状態/);
  });

  it('also checks ownership after the response body finishes arriving', async () => {
    const response = Response.json({ candidate, source: 'ai' });
    vi.spyOn(response, 'json').mockImplementation(async () => {
      vi.mocked(getAuthToken).mockReturnValue('another-session');
      return { candidate, source: 'ai' };
    });
    vi.mocked(fetch).mockResolvedValue(response);
    await expect(readFeedDocument(photo())).rejects.toThrow(/ログイン状態/);
  });

  it.each([422, 502, 503])('reports a reading failure without returning a partial candidate: %s', async (status) => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ message: 'この書類の内容を確認してください。' }, { status }));
    await expect(readFeedDocument(photo())).rejects.toThrow('この書類の内容を確認してください。');
  });

  it('handles session, network, and non-JSON response failures', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({}, { status: 401 }))
      .mockRejectedValueOnce(new TypeError('network lost')).mockResolvedValueOnce(new Response('not-json'));
    await expect(readFeedDocument(photo())).rejects.toThrow(/ログイン状態/);
    await expect(readFeedDocument(photo())).rejects.toThrow(/通信を確認/);
    await expect(readFeedDocument(photo())).rejects.toThrow(/候補が返りません/);
  });

  it.each([
    {}, { source: 'ai' }, { source: 'local', candidate },
    { source: 'ai', candidate: { ...candidate, lines: [] } },
    { source: 'ai', candidate: { ...candidate, lines: [{ ...candidate.lines[0], quantity: 2 }] } },
    { source: 'ai', candidate: { ...candidate, notes: undefined } },
  ])('rejects malformed results instead of substituting defaults: %j', async (payload) => {
    vi.mocked(fetch).mockResolvedValue(Response.json(payload));
    await expect(readFeedDocument(photo())).rejects.toThrow(/候補が返りません|形式が不正/);
  });
});
