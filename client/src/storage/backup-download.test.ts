/* @vitest-environment jsdom */

import 'fake-indexeddb/auto';

Object.defineProperty(globalThis, 'window', {
  value: globalThis,
  writable: true,
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createFarmProBackup,
  downloadFarmProBackup,
} from './backup';
import { clearStore } from './repository';

describe('FarmPro backup download', () => {
  beforeEach(async () => {
    await clearStore('metadata');
    document.body.innerHTML = '';
  });

  it('JSONバックアップをダウンロードする', async () => {
    const backup = await createFarmProBackup('1.6.0');
    const click = vi.fn();
    const remove = vi.fn();
    const appendChild = vi
      .spyOn(document.body, 'appendChild')
      .mockImplementation((node) => node);
    const createElement = vi
      .spyOn(document, 'createElement')
      .mockReturnValue({
        href: '',
        download: '',
        click,
        remove,
      } as unknown as HTMLAnchorElement);
    const createObjectURL = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValue('blob:farmpro-backup');
    const revokeObjectURL = vi
      .spyOn(URL, 'revokeObjectURL')
      .mockImplementation(() => undefined);

    downloadFarmProBackup(backup);

    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(createElement).toHaveBeenCalledWith('a');
    expect(appendChild).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:farmpro-backup');

    createElement.mockRestore();
    appendChild.mockRestore();
    createObjectURL.mockRestore();
    revokeObjectURL.mockRestore();
  });
});

