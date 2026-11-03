/** Business metadata retained on the source animal by every animal API. */
export type AnimalLifecycle = {
  version: 1;
  death?: { date: string; reason: string; note: string; recordedAt: string; [key: string]: unknown };
  culling?: { date: string; reason: string; note: string; recordedAt: string; route: 'fattening' | 'sale'; [key: string]: unknown };
  [key: string]: unknown;
};
