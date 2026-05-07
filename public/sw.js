// Tetra Ops service worker — push notifications only.
// No offline caching here; PWA install + push are the goals.

self.addEventListener("install", (event) => {
	self.skipWaiting();
});

self.addEventListener("activate", (event) => {
	event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
	if (!event.data) return;

	let payload = {};
	try {
		payload = event.data.json();
	} catch (_e) {
		payload = { title: "Tetra Ops", body: event.data.text() };
	}

	const title = payload.title || "Tetra Ops";
	const options = {
		body: payload.body || "",
		icon: "/pwa-icons/icon-192.png",
		badge: "/pwa-icons/icon-192.png",
		tag: payload.tag || undefined,
		renotify: !!payload.tag,
		data: {
			url: payload.url || "/notifications",
			notification_id: payload.notification_id || null,
		},
		requireInteraction: payload.severity === "alert",
	};

	event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
	event.notification.close();

	const targetUrl = (event.notification.data && event.notification.data.url) || "/notifications";

	event.waitUntil(
		(async () => {
			const allClients = await self.clients.matchAll({
				type: "window",
				includeUncontrolled: true,
			});

			// If there's already a Tetra Ops window open, focus + navigate it
			for (const client of allClients) {
				if (client.url.includes(self.location.origin) && "focus" in client) {
					client.focus();
					if ("navigate" in client) {
						try {
							await client.navigate(targetUrl);
						} catch (_e) {
							// some browsers throw if cross-origin or restricted
						}
					}
					return;
				}
			}

			// Otherwise open new window
			if (self.clients.openWindow) {
				await self.clients.openWindow(targetUrl);
			}
		})(),
	);
});
