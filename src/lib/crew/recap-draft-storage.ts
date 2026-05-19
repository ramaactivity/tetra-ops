/**
 * localStorage-backed draft persistence for crew rekap form.
 *
 * Stores form values keyed by eventId. If crew closes the browser tab
 * mid-submission, reopening the page restores the last typed values.
 * Drafts expire after 7 days to prevent stale state pollution.
 *
 * Only stores plain key/value form state — uploaded file URLs are kept
 * separately because they're truth-of-record on Drive already.
 */
const KEY_PREFIX = "tetra-rekap-draft:";
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

type DraftEnvelope = {
	savedAt: number;
	values: Record<string, string>;
};

function safeStorage(): Storage | null {
	if (typeof window === "undefined") return null;
	try {
		const test = "__tetra_test__";
		window.localStorage.setItem(test, "1");
		window.localStorage.removeItem(test);
		return window.localStorage;
	} catch {
		return null;
	}
}

export function loadDraft(eventId: string): Record<string, string> | null {
	const storage = safeStorage();
	if (!storage) return null;
	const raw = storage.getItem(KEY_PREFIX + eventId);
	if (!raw) return null;
	try {
		const env = JSON.parse(raw) as DraftEnvelope;
		if (
			!env ||
			typeof env.savedAt !== "number" ||
			!env.values ||
			typeof env.values !== "object"
		) {
			storage.removeItem(KEY_PREFIX + eventId);
			return null;
		}
		if (Date.now() - env.savedAt > TTL_MS) {
			storage.removeItem(KEY_PREFIX + eventId);
			return null;
		}
		return env.values;
	} catch {
		storage.removeItem(KEY_PREFIX + eventId);
		return null;
	}
}

export function saveDraft(
	eventId: string,
	values: Record<string, string>,
): void {
	const storage = safeStorage();
	if (!storage) return;
	const env: DraftEnvelope = { savedAt: Date.now(), values };
	try {
		storage.setItem(KEY_PREFIX + eventId, JSON.stringify(env));
	} catch {
		// Quota exceeded or other write failure — best effort, ignore.
	}
}

export function clearDraft(eventId: string): void {
	const storage = safeStorage();
	if (!storage) return;
	try {
		storage.removeItem(KEY_PREFIX + eventId);
	} catch {
		// ignore
	}
}

export function draftAgeMs(eventId: string): number | null {
	const storage = safeStorage();
	if (!storage) return null;
	const raw = storage.getItem(KEY_PREFIX + eventId);
	if (!raw) return null;
	try {
		const env = JSON.parse(raw) as DraftEnvelope;
		if (!env || typeof env.savedAt !== "number") return null;
		return Date.now() - env.savedAt;
	} catch {
		return null;
	}
}
