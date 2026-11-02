import { Router, type Response } from 'express';
import { createTreatment, deleteTreatment, findTreatment, listTreatments, updateTreatment } from '../treatmentStore';
import { deleteSyncedTreatment, findSyncedTreatment, listSyncedTreatments, syncTreatment } from '../treatmentSyncStore';

export const treatmentsRouter = Router();

function mutationError(error: unknown, res: Response, deleting = false): void {
  const code = error instanceof Error ? error.message : '';
  if (code === 'TREATMENT_SYNC_PRECONDITION_FAILED') {
    res.status(412).json({ message: deleting
      ? '治療記録が変更されているため、削除していません。最新の記録を確認してください'
      : '治療記録の確認条件が一致しないため、保存していません。最新の記録を確認してください' });
  } else if (code === 'TREATMENT_RECORD_DELETED') {
    res.status(409).json({ message: 'この治療記録は削除済みのため、保存していません。最新の記録を確認してください' });
  } else {
    res.status(400).json({ message: deleting ? '治療・投薬記録の削除同期に失敗しました' : '治療・投薬記録の同期に失敗しました' });
  }
}

treatmentsRouter.get('/', async (_req, res) => {
  res.json(await listTreatments());
});

treatmentsRouter.get('/record-sync', async (_req, res) => {
  try {
    res.json(await listSyncedTreatments());
  } catch {
    res.status(500).json({ message: '治療・投薬記録の同期データ取得に失敗しました' });
  }
});

treatmentsRouter.get('/record-sync/:id', async (req, res) => {
  try {
    const record = await findSyncedTreatment(req.params.id);
    if (!record) {
      res.status(404).json({ message: '治療・投薬記録の同期データが見つかりません' });
      return;
    }
    res.json(record);
  } catch {
    res.status(500).json({ message: '治療・投薬記録の同期データ取得に失敗しました' });
  }
});

treatmentsRouter.put('/record-sync/:id', async (req, res) => {
  const id = req.params.id;
  if (!id.trim() || !req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    res.status(400).json({ message: '同期データが不正です' });
    return;
  }

  try {
    res.json(await syncTreatment(id, req.body, {
      ifMatch: req.get('If-Match'), ifNoneMatch: req.get('If-None-Match'),
    }));
  } catch (error) {
    mutationError(error, res);
  }
});

treatmentsRouter.delete('/record-sync/:id', async (req, res) => {
  const id = req.params.id;
  if (!id.trim()) {
    res.status(400).json({ message: '同期データが不正です' });
    return;
  }

  try {
    res.json(await deleteSyncedTreatment(id, {
      ifMatch: req.get('If-Match'), ifNoneMatch: req.get('If-None-Match'),
    }));
  } catch (error) {
    mutationError(error, res, true);
  }
});

treatmentsRouter.get('/:id', async (req, res) => {
  const treatment = await findTreatment(Number(req.params.id));
  if (!treatment) {
    res.status(404).json({ message: '治療記録が見つかりません' });
    return;
  }
  res.json(treatment);
});

treatmentsRouter.post('/', async (req, res) => {
  const { targetNumber, targetName, symptom, treatmentDate, recordType } = req.body;
  if (!targetNumber || !targetName || !treatmentDate) {
    res.status(400).json({ message: '対象番号、対象名、治療日は必須です' });
    return;
  }
  if ((recordType ?? '治療') === '治療' && !symptom) {
    res.status(400).json({ message: '治療記録では症状が必須です' });
    return;
  }
  res.status(201).json(await createTreatment(req.body));
});

treatmentsRouter.put('/:id', async (req, res) => {
  const { targetNumber, targetName, symptom, treatmentDate, recordType } = req.body;
  if (!targetNumber || !targetName || !treatmentDate) {
    res.status(400).json({ message: '対象番号、対象名、治療日は必須です' });
    return;
  }
  if ((recordType ?? '治療') === '治療' && !symptom) {
    res.status(400).json({ message: '治療記録では症状が必須です' });
    return;
  }
  const treatment = await updateTreatment(Number(req.params.id), req.body);
  if (!treatment) {
    res.status(404).json({ message: '治療記録が見つかりません' });
    return;
  }
  res.json(treatment);
});

treatmentsRouter.delete('/:id', async (req, res) => {
  const deleted = await deleteTreatment(Number(req.params.id));
  if (!deleted) {
    res.status(404).json({ message: '治療記録が見つかりません' });
    return;
  }
  res.status(204).send();
});
