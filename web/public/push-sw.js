// Web Push handlers (SPEC 5). Loaded into the generated service worker through workbox importScripts.
self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification(data.title || "life-life-life", { body: data.body || "", data: { url: data.url || "./" } }),
  );
});

// No close() here: tapping a notification should open the app and leave it in Notification Center until dismissed.
self.addEventListener("notificationclick", (event) => {
  event.waitUntil(self.clients.openWindow(event.notification.data?.url || "./"));
});
