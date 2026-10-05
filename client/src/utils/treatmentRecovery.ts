type TreatmentRow = {
  id?: string | number;
  syncRecordId?: string;
  treatmentCourseId?: string;
  recordType?: string;
  targetNumber?: string;
  cowEarTag?: string;
  targetName?: string;
  cowName?: string;
  treatmentDate?: string;
  createdAt?: string;
  progress?: string;
};

const text = (value: unknown) => String(value ?? '').trim();
const number = (row: TreatmentRow) => text(row.targetNumber || row.cowEarTag);
const name = (row: TreatmentRow) => text(row.targetName || row.cowName);

export function treatmentCourseKey(row: TreatmentRow): string {
  return row.treatmentCourseId || row.syncRecordId || `treatment:${row.id}`;
}

function sameAnimal(a: TreatmentRow, b: TreatmentRow, rows: TreatmentRow[]) {
  const aNumber = number(a);
  const bNumber = number(b);
  if (aNumber && bNumber) return aNumber === bNumber;
  const targetName = name(a);
  if (!targetName || targetName !== name(b)) return false;
  // A name without an ear tag is usable only when the records do not identify multiple animals.
  const numbers = new Set(rows.filter((row) => name(row) === targetName).map(number).filter(Boolean));
  return numbers.size <= 1;
}

function follows(recovery: TreatmentRow, row: TreatmentRow) {
  const recoveryDate = text(recovery.treatmentDate).slice(0, 10);
  const rowDate = text(row.treatmentDate).slice(0, 10);
  if (!recoveryDate || !rowDate || recoveryDate < rowDate) return false;
  if (recoveryDate > rowDate) return true;
  if (recovery.createdAt && row.createdAt && recovery.createdAt !== row.createdAt) {
    return recovery.createdAt > row.createdAt;
  }
  const recoveryId = Number(recovery.id);
  const rowId = Number(row.id);
  return Number.isFinite(recoveryId) && Number.isFinite(rowId) && recoveryId > rowId;
}

/** Derive completion from recovery records; never rewrite or delete historical treatments. */
export function isTreatmentRecovered(row: TreatmentRow, rows: TreatmentRow[]): boolean {
  if (row.progress === '回復') return true;
  return rows.some((recovery) => {
    if (recovery.progress !== '回復' || !follows(recovery, row)) return false;
    if ((recovery.recordType || '治療') !== (row.recordType || '治療')) return false;
    if (row.treatmentCourseId && recovery.treatmentCourseId) {
      return row.treatmentCourseId === recovery.treatmentCourseId;
    }
    if (recovery.treatmentCourseId === treatmentCourseKey(row)) return true;
    if (sameAnimal(row, recovery, rows)) return true;
    // Follow the original course across an ear-tag change, using its stable sync identity.
    const source = recovery.treatmentCourseId
      ? rows.find((item) => treatmentCourseKey(item) === recovery.treatmentCourseId)
      : undefined;
    return Boolean(source && sameAnimal(row, source, rows));
  });
}
