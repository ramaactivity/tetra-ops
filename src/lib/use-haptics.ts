"use client";

import { useCallback } from "react";

/**
 * useHaptics — light tactile feedback on tap.
 *
 * Vibration API is Android-only (iOS Safari has no web-haptics as of 2026), so
 * this is a progressive enhancement: feature-detected, silent where absent. On
 * iOS the tactile cue is carried by the CSS `.press` spring (scale on :active)
 * instead. Keep patterns short — long buzzes feel cheap.
 */
type HapticPattern = "tap" | "select" | "success" | "warning" | "error";

const PATTERNS: Record<HapticPattern, number | number[]> = {
	tap: 8,
	select: 12,
	success: [10, 40, 16],
	warning: [16, 50, 16],
	error: [24, 60, 24],
};

export function useHaptics() {
	return useCallback((pattern: HapticPattern = "tap") => {
		if (typeof navigator === "undefined" || !("vibrate" in navigator)) return;
		try {
			navigator.vibrate(PATTERNS[pattern]);
		} catch {
			/* no-op — some browsers throw on rapid calls */
		}
	}, []);
}
