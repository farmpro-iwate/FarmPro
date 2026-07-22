const eras = [
  { name: '令和', short: 'R', start: '2019-05-01', startYear: 2019 },
  { name: '平成', short: 'H', start: '1989-01-08', startYear: 1989 },
  { name: '昭和', short: 'S', start: '1926-12-25', startYear: 1926 },
  { name: '大正', short: 'T', start: '1912-07-30', startYear: 1912 },
  { name: '明治', short: 'M', start: '1868-01-25', startYear: 1868 },
] as const;

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function isValidDate(year: number, month: number, day: number) {
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

export function formatJapaneseEra(isoDate: string) {
  if (!isoDate) return '';
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return '';

  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const comparable = `${yearText}-${monthText}-${dayText}`;
  const era = eras.find((item) => comparable >= item.start);
  if (!era || !isValidDate(year, month, day)) return '';

  const eraYear = year - era.startYear + 1;
  return `${era.name}${eraYear === 1 ? '元' : eraYear}年${month}月${day}日`;
}

export function parseJapaneseEra(input: string) {
  const normalized = input.trim().replace(/\s+/g, '').replace(/[．.]/g, '/');
  if (!normalized) return '';

  const match = /^(令和|平成|昭和|大正|明治|R|H|S|T|M)(元|\d{1,2})[年\/-](\d{1,2})[月\/-](\d{1,2})日?$/i.exec(normalized);
  if (!match) return null;

  const [, eraToken, eraYearText, monthText, dayText] = match;
  const era = eras.find((item) => item.name === eraToken || item.short === eraToken.toUpperCase());
  if (!era) return null;

  const eraYear = eraYearText === '元' ? 1 : Number(eraYearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (eraYear < 1) return null;

  const year = era.startYear + eraYear - 1;
  if (!isValidDate(year, month, day)) return null;

  const isoDate = `${year}-${pad(month)}-${pad(day)}`;
  const resolvedEra = eras.find((item) => isoDate >= item.start);
  if (resolvedEra?.name !== era.name) return null;

  return isoDate;
}
