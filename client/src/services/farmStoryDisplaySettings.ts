export const FARM_STORY_CATEGORIES = [
  { id: 'cattle', label: '牛の登録', group: '牛・繁殖', defaultEnabled: true },
  { id: 'calf', label: '子牛の登録', group: '牛・繁殖', defaultEnabled: true },
  { id: 'breeding', label: '繁殖', group: '牛・繁殖', defaultEnabled: true },
  { id: 'calving', label: '分娩', group: '牛・繁殖', defaultEnabled: true },
  { id: 'treatment', label: '治療・投薬', group: '健康', defaultEnabled: true },
  { id: 'vaccine', label: 'ワクチン', group: '健康', defaultEnabled: true },
  { id: 'sale', label: '出荷・販売', group: '販売・経費', defaultEnabled: true },
  { id: 'medicineInventory', label: '医薬品の入出庫', group: '在庫', defaultEnabled: false },
  { id: 'embryoInventory', label: '受精卵の入出庫', group: '在庫', defaultEnabled: false },
  { id: 'feedInventory', label: '飼料の入出庫', group: '在庫', defaultEnabled: false },
  { id: 'feeding', label: '飼料給与', group: '飼養', defaultEnabled: false },
  { id: 'expense', label: '経費', group: '販売・経費', defaultEnabled: false },
  { id: 'blv', label: 'BLV検査', group: '健康', defaultEnabled: false },
  { id: 'feedingAction', label: '給与アラート対応', group: '飼養', defaultEnabled: false },
  { id: 'fattening', label: '肥育移行', group: '飼養', defaultEnabled: false },
  { id: 'farmWork', label: '農場作業', group: '活動', defaultEnabled: false },
  { id: 'animalRecord', label: '個体の記録', group: '活動', defaultEnabled: false },
] as const;

export type FarmStoryCategoryId = typeof FARM_STORY_CATEGORIES[number]['id'];
export type FarmStoryPreferenceScope = { farmId: string; userId: string };
type OptionalScope = FarmStoryPreferenceScope | null | undefined;

export const DEFAULT_FARM_STORY_CATEGORIES: readonly FarmStoryCategoryId[] = Object.freeze(
  FARM_STORY_CATEGORIES.filter(category => category.defaultEnabled).map(category => category.id),
);

function normalizedCategories(categories: readonly unknown[]): FarmStoryCategoryId[] {
  const selected = new Set(categories);
  return FARM_STORY_CATEGORIES.filter(category => selected.has(category.id)).map(category => category.id);
}

/** No anonymous/shared key: one browser preference belongs to one user and farm. */
export function farmStoryPreferenceKey(scope: OptionalScope): string | null {
  if (!scope || typeof scope.farmId !== 'string' || !scope.farmId.trim() ||
      typeof scope.userId !== 'string' || !scope.userId.trim()) return null;
  try {
    // Encode both identities separately; colons inside an ID cannot become delimiters.
    return `farmpro.farmStoryCategories.v1:${encodeURIComponent(scope.farmId)}:${encodeURIComponent(scope.userId)}`;
  } catch { return null; }
}

export function readFarmStoryCategories(scope: OptionalScope): FarmStoryCategoryId[] {
  const defaults = () => [...DEFAULT_FARM_STORY_CATEGORIES];
  const key = farmStoryPreferenceKey(scope);
  if (!key) return defaults();
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return defaults();
    const saved: unknown = JSON.parse(raw);
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return defaults();
    const preference = saved as { version?: unknown; categories?: unknown };
    if (preference.version !== 1 || !Array.isArray(preference.categories)) return defaults();
    // Empty is an intentional all-off selection. Unknown future IDs are ignored.
    return normalizedCategories(preference.categories);
  } catch { return defaults(); }
}

export function saveFarmStoryCategories(scope: OptionalScope, categories: readonly FarmStoryCategoryId[]): void {
  const key = farmStoryPreferenceKey(scope);
  if (!key) throw new Error('農場または利用者の情報を確認できないため、表示設定を保存できません。');
  if (!Array.isArray(categories)) throw new Error('保存する表示項目を確認できません。もう一度選択してください。');
  const serialized = JSON.stringify({ version: 1, categories: normalizedCategories(categories) });
  try {
    const storage = window.localStorage;
    storage.setItem(key, serialized);
    if (storage.getItem(key) !== serialized) throw new Error('Preference was not persisted');
  } catch {
    throw new Error('表示設定を保存できませんでした。この端末の保存領域を確認して、もう一度お試しください。');
  }
}
