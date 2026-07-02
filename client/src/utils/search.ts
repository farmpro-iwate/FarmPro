export function includesText(value: unknown, keyword: string) {
  if (!keyword.trim()) return true;
  return String(value ?? '').toLowerCase().includes(keyword.trim().toLowerCase());
}

export function matchesAnyText(values: unknown[], keyword: string) {
  if (!keyword.trim()) return true;
  return values.some((value) => includesText(value, keyword));
}

export function matchesSelect(value: string, selected: string) {
  if (!selected || selected === 'すべて') return true;
  return value === selected;
}
