import { Router } from 'express';
import { createCalf, deleteCalf, findCalf, listCalves, markCalfPromoted, updateCalf } from '../calfStore';
import { createCattle } from '../dataStore';

export const calvesRouter = Router();

calvesRouter.get('/', async (_req, res) => {
  res.json(await listCalves());
});

calvesRouter.get('/:id', async (req, res) => {
  const item = await findCalf(Number(req.params.id));
  if (!item) {
    res.status(404).json({ message: '子牛データが見つかりません' });
    return;
  }
  res.json(item);
});

calvesRouter.post('/', async (req, res) => {
  const { calfNumber, name, birthday } = req.body;
  if (!calfNumber || !name || !birthday) {
    res.status(400).json({ message: '必須項目を入力してください' });
    return;
  }
  try {
    res.status(201).json(await createCalf(req.body));
  } catch {
    res.status(400).json({ message: '登録に失敗しました' });
  }
});

calvesRouter.post('/:id/promote', async (req, res) => {
  const calf = await findCalf(Number(req.params.id));
  if (!calf) {
    res.status(404).json({ message: '子牛データが見つかりません' });
    return;
  }
  if (calf.sex !== '雌') {
    res.status(400).json({ message: '牛台帳へ移行できるのは雌の子牛です' });
    return;
  }
  if (calf.managementStatus === '牛台帳へ移行済み' && calf.promotedCattleId) {
    res.status(400).json({ message: 'この子牛はすでに牛台帳へ移行済みです' });
    return;
  }
  try {
    const cattle = await createCattle({
      earTag: calf.calfNumber,
      identificationNumber: calf.identificationNumber,
      name: calf.name,
      birthday: calf.birthday,
      dam: calf.motherName,
      parity: 0,
      blvStatus: '未検査',
      stage: '育成牛',
      note: [calf.note, '子牛管理から牛台帳へ移行'].filter(Boolean).join(' / '),
    });
    await markCalfPromoted(calf.id, cattle.id);
    res.status(201).json(cattle);
  } catch (error) {
    const message = error instanceof Error && error.message === 'DUPLICATED_EAR_TAG'
      ? '同じ耳標番号の牛がすでに牛台帳へ登録されています'
      : '牛台帳への移行に失敗しました';
    res.status(400).json({ message });
  }
});

calvesRouter.put('/:id', async (req, res) => {
  const item = await updateCalf(Number(req.params.id), req.body);
  if (!item) {
    res.status(404).json({ message: '子牛データが見つかりません' });
    return;
  }
  res.json(item);
});

calvesRouter.delete('/:id', async (req, res) => {
  const deleted = await deleteCalf(Number(req.params.id));
  if (!deleted) {
    res.status(404).json({ message: '子牛データが見つかりません' });
    return;
  }
  res.status(204).send();
});