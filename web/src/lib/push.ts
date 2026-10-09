// Browser side of notifications (SPEC 5): permission, this device's push subscription, and its registration.
// Permission is requested first in turnOn, so it runs inside the tap that called it (iOS needs that gesture).
import { VAPID_PUBLIC_KEY } from "./config";
import { isDeviceRegistered, registerDevice, unregisterDevice } from "./remindersData";

export function needsHomeScreen(): boolean {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const standalone = (navigator as { standalone?: boolean }).standalone === true || matchMedia("(display-mode: standalone)").matches;
  return ios && !standalone;
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  return (await navigator.serviceWorker.getRegistration()) ?? null;
}

// The subscription on this device, or null. Null also when the service worker is not installed (for example in dev).
export async function currentSubscription(): Promise<PushSubscription | null> {
  return (await (await registration())?.pushManager.getSubscription()) ?? null;
}

// On for this device only when the browser has a subscription and the server has it registered.
export async function deviceStatus(): Promise<boolean> {
  const sub = await currentSubscription();
  return sub !== null && (await isDeviceRegistered(sub.endpoint));
}

export async function turnOn(): Promise<void> {
  if (!("PushManager" in window)) throw new Error("This browser does not support notifications.");
  if (VAPID_PUBLIC_KEY.startsWith("REPLACE_")) throw new Error("The push public key is not set in web/src/lib/config.ts.");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Notifications are not allowed for this app.");
  const reg = await registration();
  if (!reg) throw new Error("The app's service worker is not installed. Notifications work in the built app, not in dev.");
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: VAPID_PUBLIC_KEY });
  const json = sub.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) throw new Error("The browser returned an incomplete subscription.");
  await registerDevice(json.endpoint, { p256dh: json.keys.p256dh, auth: json.keys.auth }, Intl.DateTimeFormat().resolvedOptions().timeZone);
}

// Unregisters on the server first, so the Edge Function stops sending to this device, then unsubscribes the browser.
export async function turnOff(): Promise<void> {
  const sub = await currentSubscription();
  if (!sub) return;
  await unregisterDevice(sub.endpoint);
  await sub.unsubscribe();
}
