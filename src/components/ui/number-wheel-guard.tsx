"use client";

import { useEffect } from "react";

/**
 * Chrome mengubah nilai <input type="number"> yang sedang fokus saat roda
 * mouse diputar di atasnya — nominal uang bisa berubah diam-diam ketika owner
 * men-scroll halaman. Lepas fokusnya dulu supaya yang bergerak halamannya,
 * bukan angkanya.
 */
export function NumberWheelGuard() {
	useEffect(() => {
		const onWheel = (e: WheelEvent) => {
			const el = e.target;
			if (
				el instanceof HTMLInputElement &&
				el.type === "number" &&
				el === document.activeElement
			)
				el.blur();
		};
		document.addEventListener("wheel", onWheel, { passive: true });
		return () => document.removeEventListener("wheel", onWheel);
	}, []);
	return null;
}
