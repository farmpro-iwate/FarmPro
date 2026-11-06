import type { CalfInput } from '../types/calf';
import { normalizeCalfCertificateIdentifier } from './calfCertificateImport';

type AnimalRow = {
  id: string | number;
  identificationNumber?: string;
  calfNumber?: string;
  earTag?: string;
  name?: string;
  birthday?: string;
  deletedAt?: string;
};
export type CalfCertificateDuplicate = { id: string; kind: 'calf' | 'cattle'; label: string; url: string };

function identifier(value?: string) {
  return normalizeCalfCertificateIdentifier(String(value || ''));
}
function earTag(value?: string) {
  const text = String(value || '').normalize('NFKC').trim();
  return text.startsWith('TEMP-') ? '' : normalizeCalfCertificateIdentifier(text);
}
function label(row: AnimalRow) {
  const tag = earTag(row.calfNumber || row.earTag);
  return [row.name && row.name !== '耳標未装着' ? row.name : '名号未登録',
    tag ? `耳標 ${tag}` : '耳標未装着', row.birthday ? `${row.birthday}生` : ''].filter(Boolean).join(' ／ ');
}

/** Read-only comparison. Formal saves still use the existing calf service. */
export function findCalfCertificateDuplicates(
  input: Pick<CalfInput, 'identificationNumber' | 'calfNumber'>,
  calves: AnimalRow[], cattle: AnimalRow[],
  editing?: { id: string; identificationNumber?: string },
): CalfCertificateDuplicate[] {
  const fullId = identifier(input.identificationNumber);
  const tag = earTag(input.calfNumber);
  const result: CalfCertificateDuplicate[] = [];
  for (const row of calves) {
    if (row.deletedAt || String(row.id) === editing?.id) continue;
    if ((/^\d{10}$/.test(fullId) && identifier(row.identificationNumber) === fullId) ||
        (tag && earTag(row.calfNumber) === tag)) {
      result.push({ id: String(row.id), kind: 'calf', label: label(row), url: `/calves/${encodeURIComponent(row.id)}/edit?source=calf-certificate` });
    }
  }
  // An existing calf can also have a retained cattle record after promotion.
  // Keeping its already assigned identity is an edit of that calf, not a new animal.
  if (editing && identifier(editing.identificationNumber) === fullId) return result;
  if (!/^\d{10}$/.test(fullId)) return result;
  for (const row of cattle) {
    if (!row.deletedAt && identifier(row.identificationNumber) === fullId) {
      result.push({ id: String(row.id), kind: 'cattle', label: label(row), url: `/cattle/${encodeURIComponent(row.id)}` });
    }
  }
  return result;
}
