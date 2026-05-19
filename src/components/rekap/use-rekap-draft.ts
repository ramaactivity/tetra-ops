"use client";

import { useEffect, useRef, useState } from "react";
import {
	clearDraft,
	draftAgeMs,
	loadDraft,
	saveDraft,
} from "@/lib/crew/recap-draft-storage";

/**
 * Manage rekap form draft persistence + beforeunload warning.
 *
 * - On mount: load draft from localStorage (returned as `restoredValues`).
 * - On every `values` change: debounce-save to localStorage (1.2s).
 * - Beforeunload: warn if form has unsaved changes vs initial load.
 * - On successful submit: caller invokes `clear()` to drop the draft.
 */
export function useRekapDraft(
	eventId: string,
	values: Record<string, string>,
	enabled: boolean,
): {
	restoredValues: Record<string, string> | null;
	restoredAgeMs: number | null;
	clear: () => void;
} {
	const [restoredValues, setRestoredValues] = useState<Record<
		string,
		string
	> | null>(null);
	const [restoredAgeMs, setRestoredAgeMs] = useState<number | null>(null);
	const dirtyRef = useRef(false);
	const initialSnapshotRef = useRef<string>("");

	// Load draft on mount (client only).
	useEffect(() => {
		if (!enabled) return;
		const draft = loadDraft(eventId);
		if (draft) {
			setRestoredValues(draft);
			setRestoredAgeMs(draftAgeMs(eventId));
		}
		initialSnapshotRef.current = JSON.stringify(values);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [eventId, enabled]);

	// Debounced save on values change.
	useEffect(() => {
		if (!enabled) return;
		const snapshot = JSON.stringify(values);
		if (snapshot === initialSnapshotRef.current) {
			dirtyRef.current = false;
			return;
		}
		dirtyRef.current = true;
		const id = window.setTimeout(() => {
			saveDraft(eventId, values);
		}, 1200);
		return () => window.clearTimeout(id);
	}, [eventId, enabled, values]);

	// Warn on browser tab close if there are unsaved edits.
	useEffect(() => {
		if (!enabled) return;
		function handler(e: BeforeUnloadEvent) {
			if (!dirtyRef.current) return;
			e.preventDefault();
			e.returnValue = "";
		}
		window.addEventListener("beforeunload", handler);
		return () => window.removeEventListener("beforeunload", handler);
	}, [enabled]);

	return {
		restoredValues,
		restoredAgeMs,
		clear: () => {
			clearDraft(eventId);
			dirtyRef.current = false;
		},
	};
}
