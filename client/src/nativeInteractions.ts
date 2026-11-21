import { Browser } from '@capacitor/browser';
import { registerPlugin } from '@capacitor/core';
import { isNativeApp } from './nativeRuntime';

type PrintResult = { completed: boolean };
const nativePrinter = registerPlugin<{
  print(options: { html?: string }): Promise<PrintResult>;
}>('FarmProPrint');
let installed = false;

export function printHtmlDocument(html: string): void {
  if (isNativeApp()) {
    void nativePrinter.print({ html }).catch(() => {
      window.alert('印刷画面を開けませんでした。もう一度お試しください。');
    });
    return;
  }
  const popup = window.open('', '_blank');
  if (!popup) {
    window.alert('印刷画面を開けませんでした。ポップアップがブロックされている可能性があります。');
    return;
  }
  popup.document.open();
  popup.document.write(html);
  popup.document.close();
}

export function installNativeInteractions(): void {
  if (installed || !isNativeApp()) return;
  installed = true;
  window.print = () => {
    void nativePrinter.print({}).catch(() => {
      window.alert('印刷画面を開けませんでした。もう一度お試しください。');
    });
  };
  document.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
    if (!(anchor instanceof HTMLAnchorElement) || anchor.hasAttribute('download')) return;
    const url = new URL(anchor.href, window.location.href);
    const appUrl = new URL(window.location.href);
    const internal = url.protocol === appUrl.protocol && url.host === appUrl.host;
    if (internal) {
      // Legal/help pages with target=_blank must stay reachable inside the app.
      if (anchor.target === '_blank') anchor.target = '_self';
      return;
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return;
    event.preventDefault();
    void Browser.open({ url: url.href }).catch(() => {
      window.alert('リンクを開けませんでした。もう一度お試しください。');
    });
  });
}
