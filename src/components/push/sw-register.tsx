"use client";

import { useEffect } from "react";

export function ServiceWorkerRegister() {
	useEffect(() => {
		if (typeof window === "undefined") return;
		if (!("serviceWorker" in navigator)) return;

		const onLoad = () => {
			navigator.serviceWorker
				.register("/sw.js", { scope: "/" })
				.catch((err) => {
					if (process.env.NODE_ENV !== "production") {
						console.warn("SW register failed:", err);
					}
				});
		};

		if (document.readyState === "complete") {
			onLoad();
		} else {
			window.addEventListener("load", onLoad);
			return () => window.removeEventListener("load", onLoad);
		}
	}, []);

	return null;
}
