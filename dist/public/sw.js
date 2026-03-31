// Service Worker for SF Pulse push notifications
// iOS 16.4+ supports web push via service workers

self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || "SF Pulse Update";
  const options = {
    body: data.body || "New restaurants or events have been added.",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: "sf-pulse-update",
    renotify: true,
    data: { url: data.url || "/" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(clients.openWindow(url));
});
