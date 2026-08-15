import fs from 'node:fs/promises';
import path from 'node:path';
import { currentFarmId } from './farmContext';

const GLOBAL_FILES = new Set([
  'users.json',
  'stripeSubscriptions.json',
  'stripeWebhookEvents.json',
]);
const DEFAULT_FARM_ID = 'farm-demo';

function runtimeDataDir() {
  const configuredDir = process.env.FARMPRO_DATA_DIR?.trim();
  return configuredDir
   