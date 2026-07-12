import { ChangeEvent, useState } from 'react';
import { Alert, Button, Card, CardContent, Divider, Stack, Typography } from '@mui/material';
import { downloadBackup, importBackupJson } from '../services/backupApi';

type BackupJson = {
  app?: string;
  version?: string;
  exportedAt?: string;
  data?: Record<string, unknown>;
};

type PreviewCounts = {
  cattle: number;
  calves: number;
  breedings: number;
  vaccines