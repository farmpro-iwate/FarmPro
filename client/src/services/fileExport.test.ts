import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  native: vi.fn(), writeFile: vi.fn(), deleteFile: vi.fn(), rmdir: vi.fn(), share: vi.fn(),
}));
vi.mock('../nativeRuntime', () => ({ isNativeApp: mocks.native }));
vi.mock('@capacitor/filesystem', () => ({
  Directory: { Cache: 'CACHE' }, Encoding: { UTF8: 'utf8' },
  Filesystem: { writeFile: mocks.writeFile, deleteFile: mocks.deleteFile, rmdir: mocks.rmdir },
}));
vi.mock('@capacitor/share', () => ({ Share: { share: mocks.share } }));

import { exportTextFile } from './fileExport';

describe('file export', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.native.mockReturnValue(true);
    mocks.writeFile.mockResolvedValue({ uri: 'file:///cache/backup.json' });
    mocks.deleteFile.mockResolvedValue(undefined);
    mocks.rmdir.mockResolvedValue(undefined);
    mocks.share.mockResolvedValue({ activityType: 'com.apple.DocumentManagerUICore.SaveToFiles' });
  });
  afterEach(() => vi.restoreAllMocks());

  it('keeps the browser Blob, filename and download behavior without native calls', async () => {
    mocks.native.mockReturnValue(false);
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:export');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    let anchor: HTMLAnchorElement | undefined;
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { anchor = this; });
    await exportTextFile('farm:backup?.json', '{"name":"架空農場"}', 'application/json;charset=utf-8');
    expect(create).toHaveBeenCalledWith(expect.any(Blob));
    expect((create.mock.calls[0][0] as Blob).type).toBe('application/json;charset=utf-8');
    expect(anchor?.download).toBe('farm_backup_.json');
    expect(anchor?.href).toBe('blob:export');
    expect(anchor?.isConnected).toBe(false);
    expect(revoke).toHaveBeenCalledWith('blob:export');
    expect(mocks.writeFile).not.toHaveBeenCalled();
    expect(mocks.share).not.toHaveBeenCalled();
  });

  it('keeps exact Japanese/BOM text and waits for share completion before cleanup or success', async () => {
    let finish!: (result: { activityType: string }) => void;
    mocks.share.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    let completed = false;
    const exportPromise = exportTextFile('審査用.csv', '\uFEFF"名号"\r\n"架空さくら"', 'text/csv;charset=utf-8;')
      .then(() => { completed = true; });
    await vi.waitFor(() => expect(mocks.share).toHaveBeenCalledOnce());
    expect(completed).toBe(false);
    expect(mocks.deleteFile).not.toHaveBeenCalled();
    expect(mocks.writeFile).toHaveBeenCalledWith({
      path: expect.stringMatching(/^farmpro-exports\/[^/]+\/審査用\.csv$/),
      directory: 'CACHE', encoding: 'utf8', recursive: true, data: '\uFEFF"名号"\r\n"架空さくら"',
    });
    expect(mocks.share.mock.calls[0][0].files).toEqual(['file:///cache/backup.json']);
    finish({ activityType: 'SaveToFiles' });
    await exportPromise;
    expect(completed).toBe(true);
    const path = mocks.writeFile.mock.calls[0][0].path;
    expect(mocks.deleteFile).toHaveBeenCalledWith({ path, directory: 'CACHE' });
    expect(mocks.rmdir).toHaveBeenCalledWith({ path: path.slice(0, path.lastIndexOf('/')), directory: 'CACHE' });
  });

  it('rejects a cancelled share and cleans only the temporary export', async () => {
    mocks.share.mockRejectedValue(new Error('Share canceled'));
    await expect(exportTextFile('backup.json', '{}', 'application/json')).rejects.toThrow('キャンセル');
    expect(mocks.deleteFile).toHaveBeenCalledOnce();
    expect(mocks.rmdir).toHaveBeenCalledOnce();
  });

  it('does not open the share sheet if writing fails and removes any partial export directory', async () => {
    mocks.writeFile.mockRejectedValue(new Error('Disk full'));
    await expect(exportTextFile('backup.json', '{}', 'application/json')).rejects.toThrow('保存・共有できません');
    expect(mocks.share).not.toHaveBeenCalled();
    expect(mocks.rmdir).toHaveBeenCalledWith({ path: expect.stringMatching(/^farmpro-exports\/[^/]+$/), directory: 'CACHE', recursive: true });
  });

  it('refuses caller-supplied paths before touching native storage', async () => {
    for (const name of ['../backup.json', '/tmp/backup.json', 'nested\\backup.json', '..', '', 'backup\u0000.json']) {
      await expect(exportTextFile(name, '{}', 'application/json')).rejects.toThrow('ファイル名');
    }
    expect(mocks.writeFile).not.toHaveBeenCalled();
    expect(mocks.share).not.toHaveBeenCalled();
  });

  it('uses separate temporary paths for overlapping exports of the same filename', async () => {
    await Promise.all([
      exportTextFile('backup.json', '{"version":1}', 'application/json'),
      exportTextFile('backup.json', '{"version":2}', 'application/json'),
    ]);
    const paths = mocks.writeFile.mock.calls.map(([options]) => options.path);
    expect(new Set(paths).size).toBe(2);
    expect(mocks.deleteFile.mock.calls.map(([options]) => options.path)).toEqual(paths);
  });

  it('reports cleanup failure distinctly after a completed share', async () => {
    mocks.deleteFile.mockRejectedValue(new Error('Cannot remove file'));
    await expect(exportTextFile('backup.json', '{}', 'application/json')).rejects.toThrow('共有は完了しましたが、一時ファイル');
  });
});
