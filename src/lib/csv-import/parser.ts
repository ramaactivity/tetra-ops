/**
 * Lightweight CSV parser — handles quoted fields with embedded commas, BOM, CRLF.
 * Pure / browser-safe. No streaming; suitable for < 10k rows.
 */
export function parseCsv(text: string): string[][] {
	const stripped = text.replace(/^﻿/, "");
	const rows: string[][] = [];
	let row: string[] = [];
	let cur = "";
	let inQuotes = false;
	for (let i = 0; i < stripped.length; i++) {
		const ch = stripped[i];
		if (inQuotes) {
			if (ch === '"') {
				if (stripped[i + 1] === '"') {
					cur += '"';
					i++;
				} else {
					inQuotes = false;
				}
			} else {
				cur += ch;
			}
		} else {
			if (ch === '"') {
				inQuotes = true;
			} else if (ch === ",") {
				row.push(cur);
				cur = "";
			} else if (ch === "\n") {
				row.push(cur);
				rows.push(row);
				row = [];
				cur = "";
			} else if (ch === "\r") {
				// skip CR
			} else {
				cur += ch;
			}
		}
	}
	if (cur.length > 0 || row.length > 0) {
		row.push(cur);
		rows.push(row);
	}
	return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

export function normalizeHeaderKey(k: string): string {
	return k.trim().toLowerCase().replace(/^﻿/, "").replace(/\s+/g, "_");
}
