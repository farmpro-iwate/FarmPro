const ENABLED_KEY = 'farmpro-device-notifications-enabled';
const LAST_NOTICE_KEY = 'farmpro-last-device-alert';

export function deviceNotificationsSupported() {
  return typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator;
}

export function deviceNotificationsEnabled() {
  return deviceNotificationsSupported() && localStorage.getItem(ENABLED_KEY) === 'true' && Notification.permission === 'granted';
}

export function deviceNotificationPermission(): NotificationPermission | 'unsupported' {
  return deviceNotificationsSupported() ? Notification.permission : 'unsupported';
}

export async function enableDeviceNotifications() {
  if (!deviceNotificationsSupported()) return 'unsupported' as const;
  const permission = await Notification.requestPermission();
  if (permission === 'granted') localStorage.setItem(ENABLED_KEY, 'true');
  return permission;
}

export function disableDeviceNotifications() {
  localStorage.removeItem(ENABLED_KEY);
  localStorage.removeItem(LAST_NOTICE_KEY);
}

export async function showAppOpenAlertNotification(urgentCount: number, checkCount: number) {
  if (!deviceNotificationsEnabled() || urgentCount + checkCount === 0) return;

  const today = new Date().toLocaleDateString('sv-SE');
  const noticeKey = `${today}:${urgentCount}:${checkCount}`;
  if (localStorage.getItem(LAST_NOTICE_KEY) === noticeKey) return;

  const parts = [];
  if (urgentCount > 0) parts.push(`要対応 ${urgentCount}件`);
  if (checkCount > 0) parts.push(`確認 ${checkCount}件`);

  const registration = await navigator.serviceWorker.ready;
  await registration.showNotification('FarmPro アラート', {
    body: parts.join('・'),
    icon: '/farmpro-apple-touch-icon.png',
    badge: '/farmpro-icon-v2.svg',
    tag: 'farmpro-app-open-alert',
    data: { url: '/alerts' },
  });
  localStorage.setItem(LAST_NOTICE_KEY, noticeKey);
}
