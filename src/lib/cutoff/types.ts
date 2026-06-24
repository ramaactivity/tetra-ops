/**
 * Finance-cutoff wizard — shared types & constants.
 *
 * Plain module (NOT "use server") so both the server action
 * (`src/lib/actions/finance-cutoff.ts`) and the client wizard
 * (`src/components/cutoff/wizard.tsx`) can import the same shapes.
 */

/** Latest allowed cutoff date (owner decision: paling lambat 1 Juli 2026). */
export const CUTOFF_MAX_DATE = "2026-07-01";

/**
 * Tables the cutoff RPC hard-deletes. Listed here so the pre-delete backup
 * captures exactly what will be wiped (same set, for an honest safety net).
 */
export const CUTOFF_BACKUP_TABLES = [
	"journal_entries",
	"journal_lines",
	"event_settlements",
	"payables",
	"payable_payments",
	"sinking_fund_movements",
	"owner_earnings",
	"depreciation_postings",
	"wastage_logs",
	"stock_movements",
	"stock_takes",
	"stock_take_lines",
] as const;

export type CutoffBackupTable = (typeof CUTOFF_BACKUP_TABLES)[number];

export type CutoffBackupPayload = {
	generatedAt: string;
	totalRows: number;
	tables: Record<string, { count: number; rows: unknown[] }>;
};

export type CutoffBankInput = { coa_code: string; amount: number };
export type CutoffItemInput = {
	item_id: string;
	qty_base: number;
	wac: number;
};

export type ExecuteCutoffInput = {
	cutoffDate: string; // YYYY-MM-DD
	cash: number; // Kas Tunai opening (1-100)
	banks: CutoffBankInput[];
	items: CutoffItemInput[];
};

export type ExecuteCutoffResult = {
	ok: boolean;
	error?: string;
	cutoffDate?: string;
	openingTotal?: number;
	eventsFrozen?: number;
	journalRef?: string | null;
};

/** Option shapes the wizard renders (built server-side in the page). */
export type CutoffBankOption = {
	coa_code: string;
	accountName: string;
	bankName: string;
};

export type CutoffItemOption = {
	item_id: string;
	sku: string;
	name: string;
	unit: string; // base unit label — owner enters opening qty in this unit
};
