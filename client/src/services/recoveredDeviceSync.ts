import { getStoredAuthUser } from './authClient';
import { isRecoveredDeviceSyncEnabled, runRecoveredDeviceSync } from './deviceSync';
import { isCloudRecoveryPaused } from './syncRecoveryGuard';

export const RECOVERED_DEVICE_SYNC_STATUS_EVENT = 'farmpro:recovered-device-sync-status';
const DATA_CHANGED_EVENT = 'farmpro:data-changed';
const DEBOUNCE_MS = 5000;
const POLL_MS = 60000;

export type RecoveredDeviceSyncNotice = { farmId: string; userId: string; message: string };
let notice: RecoveredDeviceSyncNotice | null = null;
let inFlight: Promise<void> | null = null;
let active: { references: number; stop: () => void } | null = null;

export function getRecoveredDeviceSyncNotice(): RecoveredDeviceSyncNotice | null {
  const user = getStoredAuthUser();
  return notice && user?.farmId === notice.farmId && user.id === notice.userId && isRecoveredDeviceSyncEnabled()
    ? notice : null;
}

function report(next: RecoveredDeviceSyncNotice | null): void {
  if (notice?.farmId === next?.farmId && notice?.userId === next?.userId && notice?.message === next?.message) return;
  notice = next;
  window.dispatchEvent(new Event(RECOVERED_DEVICE_SYNC_STATUS_EVENT));
}

/** Only devices that completed reviewed recovery can enter this scheduler. */
export function startRecoveredDeviceSync(): () => void {
  if (active) {
    active.references++;
    return releaseReference(active);
  }

  let disposed = false;
  let changeTimer: number | null = null;
  let rerun = false;
  let waitingForFlight = false;

  const ready = () => !disposed && navigator.onLine !== false && document.visibilityState !== 'hidden' &&
    !isCloudRecoveryPaused() && isRecoveredDeviceSyncEnabled();

  const execute = async (): Promise<void> => {
    if (!ready()) return;
    if (inFlight) {
      rerun = true;
      if (!waitingForFlight) {
        waitingForFlight = true;
        // Also covers a previous scheduler being disposed during its request.
        void inFlight.finally(() => {
          waitingForFlight = false;
          if (!disposed && rerun) { rerun = false; void execute(); }
        });
      }
      return;
    }

    rerun = false;
    const identity = getStoredAuthUser();
    const canReport = () => {
      const current = getStoredAuthUser();
      return !disposed && !isCloudRecoveryPaused() && isRecoveredDeviceSyncEnabled() &&
        current?.id === identity?.id && current?.farmId === identity?.farmId;
    };
    const work = (async () => {
      try {
        const result = await runRecoveredDeviceSync();
        if (!canReport()) return;
        if (result === 'needs-review' && identity) {
          report({ farmId: identity.farmId, userId: identity.id, message: '同期を確認してください。' });
        } else if (result === 'same' || result === 'pushed' || result === 'pulled') {
          report(null);
        }
      } catch {
        if (canReport() && identity) {
          report({ farmId: identity.farmId, userId: identity.id, message: '同期を確認してください。' });
        }
      }
    })();
    inFlight = work;
    await work;
    if (inFlight === work) inFlight = null;
  };

  const poll = () => { void execute(); };
  const scheduleChange = () => {
    if (disposed || !isRecoveredDeviceSyncEnabled()) return;
    if (changeTimer !== null) window.clearTimeout(changeTimer);
    changeTimer = window.setTimeout(() => {
      changeTimer = null;
      poll();
    }, DEBOUNCE_MS);
  };
  const onVisibilityChange = () => {
    if (document.visibilityState !== 'hidden') poll();
  };

  window.addEventListener(DATA_CHANGED_EVENT, scheduleChange);
  window.addEventListener('online', poll);
  window.addEventListener('focus', poll);
  document.addEventListener('visibilitychange', onVisibilityChange);
  const interval = window.setInterval(poll, POLL_MS);
  const controller = {
    references: 1,
    stop() {
      disposed = true;
      rerun = false;
      window.removeEventListener(DATA_CHANGED_EVENT, scheduleChange);
      window.removeEventListener('online', poll);
      window.removeEventListener('focus', poll);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.clearInterval(interval);
      if (changeTimer !== null) window.clearTimeout(changeTimer);
      changeTimer = null;
    },
  };
  active = controller;
  poll();
  return releaseReference(controller);
}

function releaseReference(controller: NonNullable<typeof active>): () => void {
  let released = false;
  return () => {
    if (released) return;
    released = true;
    controller.references--;
    if (controller.references === 0) {
      controller.stop();
      if (active === controller) active = null;
    }
  };
}
