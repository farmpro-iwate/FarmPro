export type FarmProDeviceNotificationStatus = 'unsupported' | NotificationPermission;

const NOTIFIED_KEY_PREFIX = 'farmpro-device-notified:';

export function getDeviceNotificationStatus(): FarmProDeviceNotificationStatus {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

export async function requestDeviceNotificationPermission(): Promise<FarmProDeviceNotificationStatus> {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission;

  await showDeviceNotification('FarmProの通知を許可しました', {
    body: '重要なアラートを端末通知で確認できます。',
    url: '/alerts',
    tag: 'farmpro-notification-enabled',
  });

  return permission;
}

export async function showDeviceNotification(
  title: string,
  options: { body: string; url?: string; tag?: string },
) {
  if (typeof window === 'undefined' || !('Notification' in window)) return false;
  if (Notification.permission !== 'granted') return false;

  if ('serviceWorker' in navigator) {
    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification(title, {
      body: options.body,
      icon: '/farmpro-apple-touch-icon.png',
      badge: '/farmpro-apple-touch-icon.png',
      tag: options.tag,
      data: { url: options.url || '/alerts' },
    });
    return true;
  }

  new Notification(title, { body: options.body });
  return true;
}

export async function notifyFarmAlertOncePerDay(input: {
  id: string;
  title: string;
  body: string;
  url?: string;
}) {
  if (getDeviceNotificationStatus() !== 'granted') return false;

  const today = new Date().toISOString().slice(0, 10);
  const key = `${NOTIFIED_KEY_PREFIX}${today}:${input.id}`;
  if (localStorage.getItem(key)) return false;

  const shown = await showDeviceNotification(input.title, {
    body: input.body,
    url: input.url || '/alerts',
    tag: `farmpro-alert-${input.id}`,
  });

  if (shown) localStorage.setItem(key, '1');
  return shown;
}
