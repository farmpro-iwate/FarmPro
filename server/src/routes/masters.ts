import { Router } from 'express';
import {
  checkDuplicate,
  createMaster,
  deleteMaster,
  findMaster,
  listMasters,
  MasterCategory,
  updateMaster
} from '../masterStore';
import {
  listSyncedMasterRecords,
  syncMasterRecord,
  tombstoneMasterRecord,
} from '../masterRecordSyncStore';

export const mastersRouter = Router();

mastersRouter.get('/', async (req, res) => {
  const category = req.query.category as MasterCategory | undefined;
  const masters = await listMasters(category);
  res.json(masters);
});

mastersRouter.get('/record-sync', async (_req, res) => {
  res.json(await listSyncedMasterRecords());
});

mastersRouter.put('/record-sync/:id', async (req, res) => {
  const id = String(req.params.id || '').trim();
  const { category, name } = req.body;

  if (!id || !category || !String(name || '').trim()) {
    res.status(400).json({ message: 'マスター同期データが不正です' });
    return;
  }

  try {
    res.json(await syncMasterRecord(id, req.body));
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (code === 'DUPLICATED_MASTER') {
      res.status(409).json({ message: '同じカテゴリー・名称のマスターがすでに登録されています' });
      return;
    }
    res.status(400).json({ message: 'マスターのレコード同期に失敗しました' });
  }
});

mastersRouter.delete('/record-sync/:id', async (req, res) => {
  const id = String(req.params.id || '').trim();
  if (!id) {
    res.status(400).json({ message: '同期IDが不正です' });
    return;
  }

  try {
    res.json(await tombstoneMasterRecord(id));
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (code === 'MASTER_RECORD_NOT_FOUND') {
      res.status(404).json({ message: 'マスター同期データが見つかりません' });
      return;
    }
    res.status(400).json({ message: 'マスターの削除同期に失敗しました' });
  }
});

mastersRouter.get('/:id', async (req, res) => {
  const master = await findMaster(Number(req.params.id));
  if (!master) {
    res.status(404).json({ message: 'マスターが見つかりません' });
    return;
  }
  res.json(master);
});

mastersRouter.post('/', async (req, res) => {
  const { category, name } = req.body;
  if (!category || !name) {
    res.status(400).json({ message: '必須項目を入力してください' });
    return;
  }

  const validCategories: MasterCategory[] = [
    'sire',
    'feed',
    'medicine',
    'partner',
    'veterinarian',
    'inseminator',
    'expenseCategory',
    'disease',
    'treatmentProcedure'
  ];
  if (!validCategories.includes(category)) {
    res.status(400).json({ message: '無効なカテゴリーです' });
    return;
  }

  try {
    const master = await createMaster(req.body);
    res.status(201).json(master);
  } catch (error) {
    if (error instanceof Error) {
      res.status(400).json({ message: error.message });
    } else {
      res.status(400).json({ message: '登録に失敗しました' });
    }
  }
});

mastersRouter.post('/check-duplicate', async (req, res) => {
  const { category, name } = req.body;
  if (!category || !name) {
    res.status(400).json({ message: '必須項目を入力してください' });
    return;
  }

  try {
    const isDuplicate = await checkDuplicate(category, name);
    res.json({ isDuplicate });
  } catch (error) {
    res.status(400).json({ message: '重複確認に失敗しました' });
  }
});

mastersRouter.put('/:id', async (req, res) => {
  const { category, name } = req.body;
  if (!category || !name) {
    res.status(400).json({ message: '必須項目を入力してください' });
    return;
  }

  try {
    const master = await updateMaster(Number(req.params.id), req.body);
    if (!master) {
      res.status(404).json({ message: 'マスターが見つかりません' });
      return;
    }
    res.json(master);
  } catch (error) {
    if (error instanceof Error) {
      res.status(400).json({ message: error.message });
    } else {
      res.status(400).json({ message: '更新に失敗しました' });
    }
  }
});

mastersRouter.delete('/:id', async (req, res) => {
  const deleted = await deleteMaster(Number(req.params.id));
  if (!deleted) {
    res.status(404).json({ message: 'マスターが見つかりません' });
    return;
  }
  res.status(204).send();
});
