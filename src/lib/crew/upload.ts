"use client";

import { createClient } from "@/lib/supabase/client";

/**
 * Resilient Drive upload for crew on flaky mobile networks.
 *
 * Crew leave the rekap form open for hours during an event, often on a near-dead
 * cellular link (we've seen 0.02 KB/s). Three failure modes were hurting them:
 *
 *  1. **"Harus refresh app dulu baru bisa upload."** The access-token cookie
 *     expires while the page sits idle; the next POST hits the API with a stale
 *     token → 401. A full page reload was the only thing refreshing it. We now
 *     refresh the session client-side *before* every upload (and again on a 401),
 *     so the cookie sent with the request is always fresh — no reload needed.
 *  2. **Hangs forever.** A single `fetch` with no timeout spins indefinitely on a
 *     dropped connection. We bound each attempt with an AbortController.
 *  3. **One hiccup = permanent fail.** No retry meant a momentary drop killed the
 *     upload. We retry transient failures (network error, timeout, 5xx, 401) with
 *     backoff; permanent ones (bad file type, too large) fail fast.
 */

export type DriveUploadResult =
	| { ok: true; url: string; name: string; id?: string }
	| { ok: false; error: string; status?: number; sessionExpired?: boolean };

// Generous: a 600 KB JPEG can take 30s+ on a weak signal. Past this it's almost
// certainly stuck — abort so we can retry instead of spinning forever.
const UPLOAD_TIMEOUT_MS = 90_000;
const MAX_ATTEMPTS = 3;

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Touch the browser session so @supabase/ssr refreshes the access token (and
 * rewrites the cookie) if it's expired or near expiry. Non-fatal: if it throws
 * the upload still runs and surfaces a real auth error if the session is dead.
 */
async function ensureFreshSession(): Promise<void> {
	try {
		await createClient().auth.getSession();
	} catch {
		// ignore — upload will report the auth failure if the session is truly gone
	}
}

export async function uploadToDrive(
	projectId: string,
	file: File,
	fields: Record<string, string>,
): Promise<DriveUploadResult> {
	await ensureFreshSession();

	let lastError = "Upload gagal";
	let lastStatus: number | undefined;

	for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
		const fd = new FormData();
		fd.set("file", file);
		for (const [k, v] of Object.entries(fields)) fd.set(k, v);

		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
		try {
			const res = await fetch(`/api/drive/upload/${projectId}`, {
				method: "POST",
				body: fd,
				signal: controller.signal,
			});
			clearTimeout(timer);

			// Session expired mid-session → refresh the cookie and retry once more.
			if (res.status === 401) {
				lastStatus = 401;
				await ensureFreshSession();
				if (attempt < MAX_ATTEMPTS) {
					await sleep(400);
					continue;
				}
				return {
					ok: false,
					error:
						"Sesi berakhir. Tutup & buka lagi halaman ini, lalu coba upload.",
					status: 401,
					sessionExpired: true,
				};
			}

			let data: {
				ok?: boolean;
				url?: string;
				name?: string;
				id?: string;
				error?: string;
			} = {};
			try {
				data = await res.json();
			} catch {
				// non-JSON (e.g. gateway HTML) — fall through to status handling
			}

			if (res.ok && data.ok && data.url) {
				return {
					ok: true,
					url: data.url,
					name: data.name ?? file.name,
					id: data.id,
				};
			}

			lastStatus = res.status;
			lastError = data.error ?? `Upload gagal (HTTP ${res.status})`;

			// Retry transient server/gateway errors; 4xx (bad file, too big) is
			// permanent — surface it immediately so crew can fix the input.
			if (res.status >= 500 && attempt < MAX_ATTEMPTS) {
				await sleep(attempt * 800);
				continue;
			}
			return { ok: false, error: lastError, status: res.status };
		} catch (e) {
			clearTimeout(timer);
			const aborted = e instanceof DOMException && e.name === "AbortError";
			lastError = aborted
				? "Upload kelamaan — koneksi lemah. Coba lagi."
				: "Koneksi terputus saat upload. Coba lagi.";
			if (attempt < MAX_ATTEMPTS) {
				await sleep(attempt * 800);
				continue;
			}
			return { ok: false, error: lastError, status: lastStatus };
		}
	}

	return { ok: false, error: lastError, status: lastStatus };
}
