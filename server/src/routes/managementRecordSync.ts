import { Router, type Response } from 'express';
import { deleteSyncedManagementRecord, findSyncedManagementRecord, listSyncedManagementRecords,
  syncManagementRecord, type ManagementSyncResource } from '../managementRecordSyncStore';

const labels: Record<ManagementSyncResource, string> = {
  feedingAlertActions: '給与アラート対応記録', fatteningTransitions: '肥育移行記録',
  activityRecords: '活動記録',
};
export function managementRecordSyncRouter(resource: ManagementSyncResource): Router {
  const router = Router();
  const label = labels[resource];
  router.use((_req, res, next) => {
    const user = res.locals.authUser;
    if (!user) { res.status(401).json({ message: 'ログインが必要です。' }); return; }
    if (user.plan !== 'standard' && user.plan !== 'pro') {
      res.status(403).json({ message: `${label}のクラウド同期はStandard / Proプランで利用できます。` }); return;
    }
    next();
  });
  const mutationError = (error: unknown, res: Response) => {
    const code = error instanceof Error ? error.message : '';
    if (code === 'MANAGEMENT_SYNC_PRECONDITION_REQUIRED') {
      res.status(428).json({ message: `${label}の確認条件が必要です。最新の記録を確認してください。` });
    } else if (code === 'MANAGEMENT_SYNC_PRECONDITION_FAILED') {
      res.status(412).json({ message: `${label}の確認条件が一致しないため、変更していません。最新の記録を確認してください。` });
    } else if (code === 'MANAGEMENT_RECORD_DELETED') {
      res.status(409).json({ message: `この${label}は削除済みのため、保存していません。` });
    } else if (code === 'FATTENING_ACTIVE_DUPLICATE') {
      res.status(409).json({ message: '同じ耳標番号の未出荷の肥育移行記録があります。別の記録は統合せず、保存を保留しました。最新の内容を確認してください。' });
    } else if (['INVALID_MANAGEMENT_SYNC_ID', 'INVALID_MANAGEMENT_SYNC_INPUT', 'INVALID_MANAGEMENT_SYNC_CONDITION'].includes(code)) {
      res.status(400).json({ message: `${label}の同期データまたは確認条件が不正です。` });
    } else res.status(500).json({ message: `${label}の同期に失敗しました。` });
  };
  router.get('/', async (_req, res) => {
    try { res.json(await listSyncedManagementRecords(resource)); }
    catch { res.status(500).json({ message: `${label}の同期データを取得できませんでした。` }); }
  });
  router.get('/:id', async (req, res) => {
    try {
      const record = await findSyncedManagementRecord(resource, req.params.id);
      if (!record) { res.status(404).json({ message: `${label}の同期データが見つかりません。` }); return; }
      res.json(record);
    } catch { res.status(500).json({ message: `${label}の同期データを取得できませんでした。` }); }
  });
  router.put('/:id', async (req, res) => {
    try { res.json(await syncManagementRecord(resource, req.params.id, req.body,
      { ifMatch: req.get('If-Match'), ifNoneMatch: req.get('If-None-Match') })); }
    catch (error) { mutationError(error, res); }
  });
  router.delete('/:id', async (req, res) => {
    try { res.json(await deleteSyncedManagementRecord(resource, req.params.id,
      { ifMatch: req.get('If-Match'), ifNoneMatch: req.get('If-None-Match') })); }
    catch (error) { mutationError(error, res); }
  });
  return router;
}
