import { useEffect, useState } from 'react';
import { Alert, Button, Card, CardContent, Stack, Table, TableBody, TableCell, TableRow, Typography } from '@mui/material';
import { getStoredAuthUser, hasAuthToken } from '../services/authClient';
import { FARM_PRO_PLANS } from '../plans/policy';
import { getCurrentFarmProPlanId } from '../plans/current-plan';
import { createFarmProBackup } from '../storage/backup';
import { uploadCloudSnapshot } from '../services/cloudClient';
import {
  getDeviceSyncPreview,
  isDeviceSyncInitialized,
  pullCloudToLocal,
  pushLocalToCloud,
 