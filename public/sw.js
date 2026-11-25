/* Floor Notify service worker: shows push notifications even when the app is closed. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));

self.addEventListener("push", event => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch { d = { title: "Floor Notify", body: event.data ? event.data.text() : "" }; }
  event.waitUntil((async () => {
    await self.registration.showNotification(d.title || "Floor Notify", {
      body: d.body || "",
      tag: d.tag || d.id || "floor-notify",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { id: d.id || "", url: "/station.html" + (d.id && d.id !== "test" ? "?open=" + encodeURIComponent(d.id) : "") }
    });
    try {
      if (self.navigator.setAppBadge) {
        const shown = await self.registration.getNotifications();
        await self.navigator.setAppBadge(shown.length || 1);
      }
    } catch {}
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    wins.forEach(c => c.postMessage({ type: "push", id: d.id }));
  })());
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const data = event.notification.data || {};
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of wins) {
      if (c.url.includes("/station.html")) {
        try { await c.focus(); } catch {}
        c.postMessage({ type: "open", id: data.id });
        return;
      }
    }
    await self.clients.openWindow(data.url || "/station.html");
  })());
});
