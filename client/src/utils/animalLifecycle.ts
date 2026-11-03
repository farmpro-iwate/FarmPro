import type { AnimalLifecycle, AnimalLifecycleChange, AnimalLifecycleIdentity } from '../types/animalLifecycle';

const object = (value: unknown): Record<string, unknown> | undefined => value && typeof value === 'object' && !Array.isArray(value)
  ? value as Record<string, unknown> : undefined;
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';

export function animalLifecycleToday(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function animalLifecycleDate(value: unknown): string {
  const date = text(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return '';
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date ? date : '';
}

/** These flags describe recorded lifecycle decisions only. Sales still decide
 * actual shipment; a culling decision alone never means the animal left. */
export function getAnimalLifecycleState(animal: unknown, asOf = animalLifecycleToday()) {
  const row = object(animal);
  const raw = object(row?.lifecycle);
  const lifecycle = raw?.version === 1 ? raw : undefined;
  const deathDate = animalLifecycleDate(object(lifecycle?.death)?.date);
  const culling = object(lifecycle?.culling);
  const cullingDate = animalLifecycleDate(culling?.date);
  const cutoff = animalLifecycleDate(asOf);
  const legacyDeceased = !deathDate && row?.managementStatus === '死亡・その他';
  return {
    deceased: legacyDeceased || Boolean(cutoff && deathDate && deathDate <= cutoff),
    culled: Boolean(cutoff && cullingDate && cullingDate <= cutoff),
    legacyDeceased,
    deathDate,
    cullingDate,
    route: culling?.route === 'fattening' || culling?.route === 'sale' ? culling.route : undefined,
  };
}

export function isAnimalDeceased(animal: unknown, asOf?: string): boolean {
  return getAnimalLifecycleState(animal, asOf).deceased;
}

export function isAnimalBreedingInactive(animal: unknown, asOf?: string): boolean {
  const state = getAnimalLifecycleState(animal, asOf);
  return state.deceased || state.culled;
}

export function getAnimalLifecycleLabel(animal: unknown, asOf?: string): string {
  const state = getAnimalLifecycleState(animal, asOf);
  if (state.deceased) return state.legacyDeceased ? '死亡・その他' : '死亡';
  if (state.culled) return state.route === 'fattening' ? '廃用・肥育中' : state.route === 'sale' ? '廃用・出荷待ち' : '廃用';
  return '';
}

function assertDate(date: string, birthday: unknown, today: string): void {
  if (!animalLifecycleDate(date)) throw new Error('有効な死亡日・廃用決定日を入力してください。');
  if (!animalLifecycleDate(today) || date > today) throw new Error('死亡日・廃用決定日に未来の日付は登録できません。');
  const birth = animalLifecycleDate(birthday);
  if (birth && date < birth) throw new Error('生年月日より前の死亡日・廃用決定日は登録できません。');
}

export function validateAnimalLifecycle(value: unknown, options: { birthday?: string; today?: string } = {}): asserts value is AnimalLifecycle {
  const lifecycle = object(value);
  if (!lifecycle || lifecycle.version !== 1) throw new Error('死亡・廃用の記録形式を確認できません。元の記録を保持しています。');
  const today = options.today ?? animalLifecycleToday();
  for (const key of ['death', 'culling'] as const) {
    if (lifecycle[key] === undefined) continue;
    const entry = object(lifecycle[key]);
    if (!entry || typeof entry.date !== 'string' || typeof entry.reason !== 'string' || !entry.reason.trim() ||
        typeof entry.note !== 'string' || typeof entry.recordedAt !== 'string' || !Number.isFinite(Date.parse(entry.recordedAt))) {
      throw new Error('死亡・廃用の記録内容を確認できません。元の記録を保持しています。');
    }
    assertDate(entry.date, options.birthday, today);
    if (key === 'culling' && entry.route !== 'fattening' && entry.route !== 'sale') throw new Error('廃用後の扱いを選択してください。');
  }
  const death = object(lifecycle.death); const culling = object(lifecycle.culling);
  if (death && culling && String(culling.date) > String(death.date)) throw new Error('死亡日より後の廃用決定日は登録できません。');
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  const row = object(value);
  return row ? Object.fromEntries(Object.entries(row).filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stable(item)])) : value;
}

/** Omitted expectedLifecycle explicitly means that no lifecycle was displayed.
 * An exact retry is allowed, but a changed decision is never overwritten. */
export function applyAnimalLifecycleChange(
  animal: { lifecycle?: AnimalLifecycle; birthday?: string; managementStatus?: string },
  change: AnimalLifecycleChange,
  expectedLifecycle?: AnimalLifecycle,
  now = new Date(),
): AnimalLifecycle {
  if (change.type !== 'death' && change.type !== 'culling') throw new Error('死亡または廃用を選択してください。');
  const today = animalLifecycleToday(now);
  const date = text(change.date); const reason = text(change.reason);
  assertDate(date, animal.birthday, today);
  if (!reason) throw new Error('理由を入力してください。');
  if (typeof change.note !== 'string') throw new Error('メモの内容を確認してください。');
  if (change.type === 'culling' && change.route !== 'fattening' && change.route !== 'sale') throw new Error('廃用後の扱いを選択してください。');
  const current = animal.lifecycle;
  if (current !== undefined) validateAnimalLifecycle(current, { birthday: animal.birthday, today });
  const previous = current?.[change.type];
  if (previous && previous.date === date && previous.reason === reason && previous.note === change.note &&
      (change.type === 'death' || previous.route === change.route)) return current!;
  if (JSON.stringify(stable(current)) !== JSON.stringify(stable(expectedLifecycle))) {
    throw new Error('死亡・廃用の記録が変更されています。最新の内容を確認してから保存してください。');
  }
  if (change.type === 'culling' && !current?.culling && isAnimalDeceased(animal, today)) throw new Error('死亡した牛に廃用の決定は登録できません。');
  const event = { ...previous, date, reason, note: change.note, recordedAt: previous?.recordedAt ?? now.toISOString(),
    ...(change.type === 'culling' ? { route: change.route! } : {}) };
  const result = { ...current, version: 1 as const, [change.type]: event } as AnimalLifecycle;
  validateAnimalLifecycle(result, { birthday: animal.birthday, today });
  return result;
}

export function assertAnimalLifecycleIdentity(current: AnimalLifecycleIdentity, expected?: AnimalLifecycleIdentity): void {
  if (!expected) return;
  const keys = ['id', 'syncId', 'syncRecordId', 'identificationNumber', 'earTag', 'calfNumber', 'birthday'] as const;
  if (keys.some(key => String(current[key] ?? '').trim() !== String(expected[key] ?? '').trim())) {
    throw new Error('選択した牛の識別情報が変更されています。対象の牛を選び直してください。');
  }
}
