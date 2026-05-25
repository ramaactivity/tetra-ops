/**
 * Pure helpers untuk hitung straight-line depreciation per asset.
 *
 * Formula:
 *   monthly_depr = (purchase_price - salvage_value) / useful_life_months
 *   months_elapsed = clamp(monthsBetween(start, now), 0, useful_life_months)
 *   accum_depr = monthly_depr × months_elapsed
 *   book_value = purchase_price - accum_depr
 *
 * Catatan:
 *   - Method 'none' → tidak disusutkan (book_value = purchase_price).
 *   - Salvage value adalah floor — book_value tidak boleh < salvage_value.
 *   - Belum integrate ke journal otomatis. Owner pakai Manual Journal Entry
 *     untuk post depreciation bulanan sampai cron RPC dibuat.
 */

export type DepreciationInput = {
	purchase_price: number;
	salvage_value: number;
	useful_life_months: number | null;
	depreciation_method: "straight_line" | "none";
	depreciation_start_date: string | null; // ISO date
};

export type DepreciationResult = {
	monthly: number;
	monthsElapsed: number;
	accumulated: number;
	bookValue: number;
	isFullyDepreciated: boolean;
};

function monthsBetween(startIso: string, endDate: Date): number {
	const start = new Date(startIso);
	if (Number.isNaN(start.getTime())) return 0;
	const years = endDate.getFullYear() - start.getFullYear();
	const months = endDate.getMonth() - start.getMonth();
	const total = years * 12 + months;
	// Subtract 1 if we haven't completed the current month relative to start
	return Math.max(0, total + (endDate.getDate() >= start.getDate() ? 0 : -1));
}

export function computeDepreciation(
	input: DepreciationInput,
	asOf: Date = new Date(),
): DepreciationResult {
	if (
		input.depreciation_method === "none" ||
		!input.useful_life_months ||
		input.useful_life_months <= 0 ||
		!input.depreciation_start_date
	) {
		return {
			monthly: 0,
			monthsElapsed: 0,
			accumulated: 0,
			bookValue: input.purchase_price,
			isFullyDepreciated: false,
		};
	}

	const depreciableBase = Math.max(
		0,
		input.purchase_price - input.salvage_value,
	);
	const monthly = Math.round(depreciableBase / input.useful_life_months);
	const elapsed = Math.min(
		monthsBetween(input.depreciation_start_date, asOf),
		input.useful_life_months,
	);
	const accumulated = Math.min(monthly * elapsed, depreciableBase);
	const bookValue = input.purchase_price - accumulated;
	return {
		monthly,
		monthsElapsed: elapsed,
		accumulated,
		bookValue: Math.max(bookValue, input.salvage_value),
		isFullyDepreciated: elapsed >= input.useful_life_months,
	};
}
