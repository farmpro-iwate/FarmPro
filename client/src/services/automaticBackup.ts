import { hasAuthToken } from './authClient';
import { runAutomaticBackup } from './cloudFeatures';
import { getCurrentFarmProPlanId } from '../plans/current-plan';
import { FARM_PRO_PLANS } from '../plans/policy';

const DATA_CHANGED_EVENT = 'farmpro:data-changed';
const DEBOUNCE_MS = 5000;

let timer: number | null = null;
let running = false;
let pending = false;

function canRunAutomaticBackup(): boolean {
  const plan = FARM_PRO_PLANS[getCurrentFarmProPlanId()];
  return plan.automaticBackup && hasAuthToken();
}

async function executeAutomaticBackup() {
  if (!canRunAutomaticBackup()) {
    pending = false;
    return;
  }

  if (running) {
    pending = true;
    return;
  }

  running = true;
  pending = false;

  try {
    await runAutomaticBackup();
  } catch (error) {
    console.warn('自動バックアップに失敗しました。', error);
  } finally {
    running = false;

    if (pending && canRunAutomaticBackup()) {
      pending = false;
      void executeAutomaticBackup();
    }
  }
}

function scheduleAutomaticBackup() {
  if (!canRunAutomaticBackup()) return;

  if (running) {
    pending = true;
    return;
  }

  if (timer !== null) {
    window.clearTimeout(timer);
  }

  timer = window.setTimeout(() => {
    timer = null;
    void executeAutomaticBackup();
  }, DEBOUNCE_MS);
}

export function startAutomaticBackup(): () => void {
  window.addEventListener(DATA_CHANGED_EVENT, scheduleAutomaticBackup);

  return () => {
    window.removeEventListener(DATA_CHANGED_EVENT, scheduleAutomaticBackup);
    if (timer !== null) {
      window.clearTimeout(timer);
      timer = null;
    }
    pending = false;
  };
}
