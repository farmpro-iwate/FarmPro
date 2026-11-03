export type AnimalCullingRoute = 'fattening' | 'sale';

export type AnimalLifecycleEvent = {
  date: string;
  reason: string;
  note: string;
  recordedAt: string;
  [key: string]: unknown;
};

export type AnimalLifecycle = {
  version: 1;
  death?: AnimalLifecycleEvent;
  culling?: AnimalLifecycleEvent & { route: AnimalCullingRoute };
  [key: string]: unknown;
};

export type AnimalLifecycleChange = {
  type: 'death' | 'culling';
  date: string;
  reason: string;
  note: string;
  route?: AnimalCullingRoute;
};

/** Values captured when the farmer selects an animal, before any async work. */
export type AnimalLifecycleIdentity = {
  id?: string | number;
  syncId?: string;
  syncRecordId?: string;
  identificationNumber?: string;
  earTag?: string;
  calfNumber?: string;
  birthday?: string;
};
