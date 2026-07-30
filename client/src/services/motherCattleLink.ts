import { createCattle, getCattleList } from './api';
import { updateCalving, type CalvingRecord } from './calvingsApi';

type LinkedCalvingRecord = CalvingRecord & {
  cattleId?: string;
};

export async function ensureCalvingMotherCattle(
  record: LinkedCalvingRecord,
): Promise<LinkedCalvingRecord> {
  if (!record.id || record.cattleId) return record;

  const earTag = String(record.cowId || '').trim();
  const cowName = String(record.cowName || '').trim();
  if (!earTag || !cowName) return record;

  const cattle = await getCattleList();
  let mother = cattle.find((item) => String(item.earTag || '').trim() === earTag);

  if (!mother) {
    mother = await createCattle({
      earTag,
      identificationNumber: '',
      name: cowName,
      birthday: '',
      sex: '雌',
      sire: '',
      dam: '',
      parity: 0,
      blvStatus: '未確認',
      stage: '繁殖牛',
      note: '分娩記録から自動作成',
    });
  }

  return updateCalving(record.id, {
    ...record,
    cattleId: String(mother.id),
  }) as Promise<LinkedCalvingRecord>;
}
