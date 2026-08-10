import { Cattle, CattleInput } from '../types/cattle';
import { deleteRecord, getAllRecords, getRecordById, saveRecord } from '../storage/repository';
import type { StoredRecord } from '../storage/types';


type StoredCattle = Cattle & StoredRecord;
type ImportedCalvingRecord = StoredRecord & {
  id: string;
  cattleId?: string;
  cowId?: string;
  cowName?: string;
  actualCalvingDate?: string;
  calfName?: string;
  calfSex?: string;
  calvingResult?: string;
  memo?: string;
  registeredToCalfLedger?: boolean;
  importSourceType?: string;
  importedParity?: string;
};

function normalizeInput(input: CattleInput): CattleInput {
  return {
    ...input,
    earTag: input.earTag.trim(),
    identificationNumber: input.identificationNumber.trim(),
    name: input.name.trim(),
  };
}

function isLegacyIdentificationDetailNumber(cattle: StoredCattle) {
  const identificationNumber = String(cattle.identificationNumber || '').trim();
  const sourceReferenceNumber = String(cattle.sourceReferenceNumber || '').trim();
  return cattle.importSourceType === 'ai-document' &&
    !identificationNumber &&
    /^\d{4}-\d{4}-\d$/.test(sourceReferenceNumber);
}

async function migrateLegacyImportedIdentification(cattle: StoredCattle) {
  if (!isLegacyIdentificationDetailNumber(cattle)) return cattle;
  const migrated: StoredCattle = {
    ...cattle,
    identificationNumber: String(cattle.sourceReferenceNumber || '').trim(),
    sourceReferenceNumber: '',
    updatedAt: new Date().toISOString(),
  };
  await saveRecord<StoredCattle>('cattle', migrated);
  return migrated;
}

async function validateCattleUniqueness(input: CattleInput, currentId?: number) {
  const cattle = await getAllRecords<StoredCattle>('cattle');
  const duplicateEarTag = cattle.find(
    (item) => item.id !== currentId && item.earTag.trim() === input.earTag,
  );
  if (duplicateEarTag) {
    throw new Error(`耳標番号「${input.earTag}」はすでに登録されています。`);
  }

  if (input.identificationNumber) {
    const duplicateIdentificationNumber = cattle.find(
      (item) =>
        item.id !== currentId &&
        (item.identificationNumber ?? '').trim() === input.identificationNumber,
    );
    if (duplicateIdentificationNumber) {
      throw new Error(`個体識別番号「${input.identificationNumber}」はすでに登録されています。`);
    }
  }
}

async function syncImportedCalvingHistory(cattle: StoredCattle) {
  const importedHistory = cattle.importedOffspringHistory || [];
  if (importedHistory.length === 0) return;

  const existing = await getAllRecords<ImportedCalvingRecord>('calvings');
  const cattleId = String(cattle.id);
  const earTag = String(cattle.earTag || '').trim();
  const cowName = String(cattle.name || '').trim();

  for (const row of importedHistory) {
    const actualCalvingDate = String(row.birthday || '').slice(0, 10);
    if (!actualCalvingDate) continue;

    const alreadyExists = existing.some((record) => {
      const sameCow = String(record.cattleId || '') === cattleId ||
        (earTag && String(record.cowId || '').trim() === earTag) ||
        (cowName && String(record.cowName || '').trim() === cowName);
      return sameCow && String(record.actualCalvingDate || '').slice(0, 10) === actualCalvingDate;
    });
    if (alreadyExists) continue;

    const importedParity = String(row.parity || '').trim();
    const id = `imported_calving_${cattle.id}_${importedParity || actualCalvingDate.replace(/-/g, '')}`;
    const now = new Date().toISOString();
    await saveRecord<ImportedCalvingRecord>('calvings', {
      id,
      cattleId,
      cowId: earTag,
      cowName,
      actualCalvingDate,
      calfName: String(row.name || '').trim(),
      calfSex: '不明',
      calvingResult: '帳票取込',
      memo: [
        'AI帳票から取り込んだ過去の産歴',
        importedParity ? `産次: ${importedParity}` : '',
        row.sire ? `父牛: ${row.sire}` : '',
        cattle.importSourceFileName ? `元帳票: ${cattle.importSourceFileName}` : '',
      ].filter(Boolean).join(' / '),
      registeredToCalfLedger: true,
      importSourceType: 'ai-document',
      importedParity,
      createdAt: now,
      updatedAt: now,
    });
    existing.push({
      id,
      cattleId,
      cowId: earTag,
      cowName,
      actualCalvingDate,
      calfName: String(row.name || '').trim(),
      calfSex: '不明',
      calvingResult: '帳票取込',
      registeredToCalfLedger: true,
      importSourceType: 'ai-document',
      importedParity,
      createdAt: now,
      updatedAt: now,
    });
  }
}

export async function getCattleList() {
  const cattle = await getAllRecords<StoredCattle>('cattle');
  return Promise.all(cattle.map((row) => migrateLegacyImportedIdentification(row)));
}

export async function getCattle(id: string) {
  const stored = await getRecordById<StoredCattle>('cattle', Number(id));
  if (!stored) throw new Error('指定された牛が見つかりません。');
  const cattle = await migrateLegacyImportedIdentification(stored);
  await syncImportedCalvingHistory(cattle);
  return cattle;
}

export async function createCattle(input: CattleInput) {
  const normalized = normalizeInput(input);
  await validateCattleUniqueness(normalized);

  const cattle = await getAllRecords<StoredCattle>('cattle');
  const nextId = cattle.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1;
  return saveRecord<StoredCattle>('cattle', { id: nextId, ...normalized });
}

export async function updateCattle(id: string, input: CattleInput) {
  const numericId = Number(id);
  const existing = await getRecordById<StoredCattle>('cattle', numericId);
  if (!existing) throw new Error('更新対象の牛が見つかりません。');

  const normalized = normalizeInput(input);
  await validateCattleUniqueness(normalized, numericId);
  return saveRecord<StoredCattle>('cattle', { ...existing, ...normalized, id: numericId });
}

export async function deleteCattle(id: number) {
  await deleteRecord('cattle', id);
}
