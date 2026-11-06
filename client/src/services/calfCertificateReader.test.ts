import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAuthToken } from './authClient';
import { prepareDocumentAiInput } from './documentAiInput';
import { readCalfCertificate } from './calfCertificateReader';
import { emptyCalfCertificateCandidate } from '../utils/calfCertificateImport';

vi.mock('./authClient', () => ({ getAuthToken: vi.fn() }));
vi.mock('./documentAiInput', () => ({ prepareDocumentAiInput: vi.fn() }));

const candidate = { ...emptyCalfCertificateCandidate, documentType: 'calf-registration-certificate',
  identificationNumber: '0000012345', name: '確認用子牛', birthday: '2026-07-01', sex: '雄' };
const payload = { candidate, source: 'ai', documentKind: 'calf-certificate' };
const prepared = { fileName: 'test-certificate.jpg', mimeType: 'image/jpeg', base64: 'ZmFrZQ==',
  previewImageBase64: 'cHJldmlldw==', detailImageBase64s: ['ZGV0YWls'] };
const photo = () => new File(['anonymous fixture'], 'test-certificate.jpg', { type: 'image/jpeg' });

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getAuthToken).mockReturnValue('test-session');
  vi.mocked(prepareDocumentAiInput).mockResolvedValue(prepared);
  vi.stubGlobal('fetch', vi.fn(async () => Response.json(payload)));
});
afterEach(() => vi.unstubAllGlobals());

describe('子牛登録証明書reader', () => {
  it('共通の画像準備と既存endpointを使い、用途指定・認証付きで読み取りだけを要求する', async () => {
    const file = photo();
    const onProgress = vi.fn();
    expect(await readCalfCertificate(file, { onProgress })).toEqual(candidate);
    expect(prepareDocumentAiInput).toHaveBeenCalledWith(file, { onProgress });
    expect(fetch).toHaveBeenCalledExactlyOnceWith('/api/cattle-document-ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-session' },
      body: JSON.stringify({ ...prepared, documentKind: 'calf-certificate' }),
    });
    expect(onProgress).toHaveBeenLastCalledWith({ status: '読み取り候補を作成しました。内容を確認してください。', progress: 100 });
  });

  it('未知の性別や読めなかった値を埋めず、確認画面へ返す', async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ ...payload, candidate: {
      ...candidate, identificationNumber: '００００-０１２３-４５', sex: '', sire: '', dam: '', earTag: '',
    } }));
    expect(await readCalfCertificate(photo())).toMatchObject({
      identificationNumber: '0000012345', sex: '', sire: '', dam: '', earTag: '',
    });
  });

  it.each([
    ['test.pdf', 'application/pdf'], ['test.HEIC', ''], ['test.png', 'image/png'],
  ])('対応する画像/PDFを共有準備へ渡す: %s', async (name, type) => {
    const file = new File(['anonymous fixture'], name, { type });
    await readCalfCertificate(file);
    expect(prepareDocumentAiInput).toHaveBeenCalledWith(file, undefined);
  });

  it('非対応形式・空ファイル・大きすぎる原本を送信しない', async () => {
    for (const [name, type] of [['test.csv', 'text/csv'], ['test.svg', 'image/svg+xml'], ['bad.pdf', 'image/jpeg']]) {
      await expect(readCalfCertificate(new File(['fixture'], name, { type }))).rejects.toThrow(/画像またはPDF/);
    }
    await expect(readCalfCertificate(new File([], 'test.pdf', { type: 'application/pdf' }))).rejects.toThrow(/ファイルが空/);
    const large = photo();
    Object.defineProperty(large, 'size', { value: 10 * 1024 * 1024 + 1 });
    await expect(readCalfCertificate(large)).rejects.toThrow(/10MB/);
    expect(prepareDocumentAiInput).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('画像展開後の送信容量超過も止める', async () => {
    vi.mocked(prepareDocumentAiInput).mockResolvedValue({ ...prepared, base64: 'x'.repeat(18 * 1024 * 1024) });
    await expect(readCalfCertificate(photo())).rejects.toThrow(/読み取り用画像が大きすぎ/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('ログインなし・モジュール読み込み中の認証切替では画像を準備しない', async () => {
    vi.mocked(getAuthToken).mockReturnValue(null);
    await expect(readCalfCertificate(photo())).rejects.toThrow(/ログイン状態/);
    vi.mocked(getAuthToken).mockReturnValueOnce('test-session').mockReturnValue('changed-session');
    await expect(readCalfCertificate(photo())).rejects.toThrow(/ログイン状態/);
    expect(prepareDocumentAiInput).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('画像準備中の認証切替では元の書類を送信しない', async () => {
    vi.mocked(prepareDocumentAiInput).mockImplementation(async () => {
      vi.mocked(getAuthToken).mockReturnValue('changed-session');
      return prepared;
    });
    await expect(readCalfCertificate(photo())).rejects.toThrow(/ログイン状態/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(['response', 'body'] as const)('応答待ち中の認証切替で候補を返さない: %s', async (at) => {
    const response = Response.json(payload);
    if (at === 'response') {
      vi.mocked(fetch).mockImplementation(async () => {
        vi.mocked(getAuthToken).mockReturnValue('changed-session');
        return response;
      });
    } else {
      vi.spyOn(response, 'json').mockImplementation(async () => {
        vi.mocked(getAuthToken).mockReturnValue('changed-session');
        return payload;
      });
      vi.mocked(fetch).mockResolvedValue(response);
    }
    await expect(readCalfCertificate(photo())).rejects.toThrow(/ログイン状態/);
  });

  it('別用途の候補・形式不正・未完の候補を正常な読取結果にしない', async () => {
    for (const wrong of [
      { candidate, source: 'ai' }, { ...payload, documentKind: 'cattle' },
      { ...payload, source: 'local' }, { ...payload, candidate: null },
      { ...payload, candidate: { ...candidate, offspring: [] } },
      { ...payload, candidate: { ...candidate, identificationNumber: 12345 } },
    ]) {
      vi.mocked(fetch).mockResolvedValue(Response.json(wrong));
      await expect(readCalfCertificate(photo())).rejects.toThrow(/候補が返りません|形式が不正/);
    }
  });

  it('認証・通信・サーバー・非JSONの失敗を伝え、部分的な候補を返さない', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(Response.json({ message: '認証が必要です。' }, { status: 401 }))
      .mockRejectedValueOnce(new TypeError('network lost'))
      .mockResolvedValueOnce(Response.json({ message: '1頭分の証明書を選んでください。' }, { status: 422 }))
      .mockResolvedValueOnce(new Response('not-json'));
    await expect(readCalfCertificate(photo())).rejects.toThrow(/ログイン状態/);
    await expect(readCalfCertificate(photo())).rejects.toThrow(/通信を確認/);
    await expect(readCalfCertificate(photo())).rejects.toThrow('1頭分の証明書を選んでください。');
    await expect(readCalfCertificate(photo())).rejects.toThrow(/候補が返りません/);
  });

  it('画像準備の失敗後は送信を始めない', async () => {
    vi.mocked(prepareDocumentAiInput).mockRejectedValue(new Error('画像を準備できませんでした。'));
    await expect(readCalfCertificate(photo())).rejects.toThrow('画像を準備できませんでした。');
    expect(fetch).not.toHaveBeenCalled();
  });
});
