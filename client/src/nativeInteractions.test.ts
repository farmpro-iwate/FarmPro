import { Browser } from '@capacitor/browser';
import { expect, it, vi } from 'vitest';
import { installNativeInteractions } from './nativeInteractions';

vi.mock('@capacitor/browser', () => ({ Browser: { open: vi.fn(async () => undefined) } }));
vi.mock('@capacitor/core', () => ({ registerPlugin: vi.fn(() => ({ print: vi.fn() })) }));
vi.mock('./nativeRuntime', () => ({ isNativeApp: () => true }));

it('親要素のリンクガードを尊重し、許可された外部リンクだけを一度開く', () => {
  const originalPrint = window.print;
  const root = document.createElement('div');
  const blocked = document.createElement('a');
  blocked.href = 'https://billing.stripe.com/p/session/expired-example';
  const allowed = document.createElement('a');
  allowed.href = 'https://example.com/help';
  root.append(blocked, allowed);
  document.body.append(root);

  // React dispatches its link handlers while the click bubbles through its root,
  // before a bubbling document listener can open the native browser.
  const guard = vi.fn((event: MouseEvent) => {
    if (event.target === blocked) event.preventDefault();
  });
  root.addEventListener('click', guard);

  try {
    installNativeInteractions();
    blocked.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    expect(guard).toHaveBeenCalledOnce();
    expect(Browser.open).not.toHaveBeenCalled();

    allowed.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    expect(Browser.open).toHaveBeenCalledExactlyOnceWith({ url: 'https://example.com/help' });
  } finally {
    root.remove();
    window.print = originalPrint;
  }
});
