import { Router } from 'express';
import { createVaccine, deleteVaccine, findVaccine, listVaccines, updateVaccine } from '../vaccineStore';
import { deleteSyncedVaccine, findSyncedVaccine, listSyncedVaccines, syncVaccine } from '../vaccineSyncStore';

export const vaccinesRouter = Router();

vaccinesRouter.get('/record-sync', async (_req, res) => {
  try {
    res.json(await listSyncedVaccines());
  } catch {
    res.status(500).json({ message: 'ワクチン記録の同期データを確認できませんでした' });
  }
});

vaccinesRouter.get('/record-sync/:id', async (req, res) => {
  const id = String(req.params.id || '').trim();
  if (!id) {
    res.status(400).json({ message: '同期IDが不正です' });
    return;
  }
  try {
    const record = await findSyncedVaccine(id);
    if (!record) {
      res.status(404).json({ message: 'ワクチン記録の同期データが見つかりません' });
      return;
    }
    res.json(record);
  } catch {
    res.status(500).json({ message: 'ワクチン記録の同期データを確認できませんでした' });
  }
});

vaccinesRouter.put('/record-sync/:id', async (req, res) => {
  const id = String(req.params.id || '').trim();
  if (!id || !req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    res.status(400).json({ message: '同期データが不正です' });
    return;
  }

  try {
    res.json(await syncVaccine(id, { ...req.body, id }, {
      ifMatch: req.get('If-Match'), ifNoneMatch: req.get('If-None-Match'),
    }));
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (code === 'VACCINE_SYNC_PRECONDITION_FAILED') {
      res.status(412).json({ message: 'ワクチン記録の確認条件が一致しないため、保存していません。最新の記録を確認してください' });
      return;
    }
    if (code === 'VACCINE_RECORD_DELETED') {
      res.status(409).json({ message: 'このワクチン記録は削除済みのため、保存していません。最新の記録を確認してください' });
      return;
    }
    res.status(400).json({ message: 'ワクチン記録の同期に失敗しました' });
  }
});

vaccinesRouter.delete('/record-sync/:id', async (req, res) => {
  const id = String(req.params.id || '').trim();
  if (!id) {
    res.status(400).json({ message: '同期データが不正です' });
    return;
  }

  try {
    res.json(await deleteSyncedVaccine(id, {
      ifMatch: req.get('If-Match'), ifNoneMatch: req.get('If-None-Match'),
    }));
  } catch (error) {
    if (error instanceof Error && error.message === 'VACCINE_SYNC_PRECONDITION_FAILED') {
      res.status(412).json({ message: 'ワクチン記録が変更されているため、削除していません。最新の記録を確認してください' });
      return;
    }
    res.status(400).json({ message: 'ワクチン記録の削除同期に失敗しました' });
  }
});

vaccinesRouter.get('/', async (_req, res) => {
  res.json(await listVaccines());
});

vaccinesRouter.get('/:id', async (req, res) => {
  const item = await findVaccine(Number(req.params.id));
  if (!item) {
    res.status(404).json({ message: 'ワクチン記録が見つかりません' });
    return;
  }
  res.json(item);
});

vaccinesRouter.post('/', async (req, res) => {
  const { targetType, targetNumber, targetName, vaccineName } = req.body;
  if (!targetType || !targetNumber || !targetName || !vaccineName) {
    res.status(400).json({ message: '必須項目を入力してください' });
    return;
  }
  try {
    res.status(201).json(await createVaccine(req.body));
  } catch {
    res.status(400).json({ message: '登録に失敗しました' });
  }
});

vaccinesRouter.put('/:id', async (req, res) => {
  const item = await updateVaccine(Number(req.params.id), req.body);
  if (!item) {
    res.status(404).json({ message: 'ワクチン記録が見つかりません' });
    return;
  }
  res.json(item);
});

vaccinesRouter.delete('/:id', async (req, res) => {
  const deleted = await deleteVaccine(Number(req.params.id));
  if (!deleted) {
    res.status(404).json({ message: 'ワクチン記録が見つかりません' });
    return;
  }
  res.status(204).send();
});
