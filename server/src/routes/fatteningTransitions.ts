import { Router } from 'express';
import { managementRecordSyncRouter } from './managementRecordSync';

export const fatteningTransitionsRouter = Router();
fatteningTransitionsRouter.use('/record-sync', managementRecordSyncRouter('fatteningTransitions'));
