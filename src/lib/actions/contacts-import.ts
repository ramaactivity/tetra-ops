"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/get-user";
import type { ImportResult } from "@/lib/csv-import/types";
import { createClient } from "@/lib/supabase/server";

// ─────────────────────────────────────────────────────────────────────────
// Auth
// ─────────────────────────────────────────────────────────────────────────

async function requireOwnerLevel() {
	const me = await getCurrentUser();
	if (!me) throw new Error("Unauthorized");
	if (me.profile.role !== "super_admin" && me.profile.role !== "owner") {
		throw new Error("Forbidden — owner-level only");
	}
	return me;
}

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

const VALID_TYPES = new Set([
	"booker",
	"client",
	"pic_event",
	"vendor",
	"other",
]);

function normalizeType(raw: string | undefined): string | null {
	if (!raw) return null;
	const v = raw.trim().toLowerCase().replace(/\s+/g, "_");
	if (VALID_TYPES.has(v)) return v;
	if (v === "pic" || v === "pic_di_lapangan") return "pic_event";
	if (v === "wo" || v === "vendor_wo") return "vendor";
	return null; // unknown type — leave null
}

function cleanPhone(raw: string | undefined): string | null {
	if (!raw) return null;
	// Keep digits + leading +; strip dashes, spaces, parens, quotes, weird unicode
	const cleaned = raw
		.replace(/[ ­​-‍﻿]/g, "") // zero-width / nbsp
		.replace(/[^\d+]/g, "");
	return cleaned || null;
}

const RowSchema = z.object({
	name: z.string().trim().min(1).max(200),
	legacy_contact_id: z
		.string()
		.trim()
		.optional()
		.transform((v) => (v ? v : null)),
	type: z.string().nullable(),
	phone: z.string().nullable(),
	email: z.string().email().nullable().or(z.literal("").transform(() => null)),
	notes: z
		.string()
		.trim()
		.max(500)
		.optional()
		.transform((v) => (v ? v : null)),
});

// ─────────────────────────────────────────────────────────────────────────
// Public action 1 — duplicate check
// ─────────────────────────────────────────────────────────────────────────

export async function checkContactDuplicates(
	legacyIds: string[],
): Promise<string[]> {
	await requireOwnerLevel();
	const filtered = legacyIds.filter(Boolean);
	if (filtered.length === 0) return [];
	const supabase = await createClient();
	const { data, error } = await supabase
		.from("contacts")
		.select("legacy_contact_id")
		.in("legacy_contact_id", filtered);
	if (error) throw new Error(`Duplicate check: ${error.message}`);
	return (data ?? [])
		.map((r) => r.legacy_contact_id as string | null)
		.filter((v): v is string => Boolean(v));
}

// ─────────────────────────────────────────────────────────────────────────
// Public action 2 — commit (upsert by legacy_contact_id when present, else insert)
// ─────────────────────────────────────────────────────────────────────────

export async function commitContactImport(
	rows: Record<string, string>[],
	rowOffset = 0,
): Promise<ImportResult> {
	await requireOwnerLevel();
	const supabase = await createClient();

	let inserted = 0;
	let updated = 0;
	let skipped = 0;
	let errors = 0;
	const resultRows: ImportResult["rows"] = [];

	for (let i = 0; i < rows.length; i++) {
		const rowNum = rowOffset + i + 2;
		const obj = rows[i];

		const legacyId = (obj.legacy_contact_id ?? "").trim() || null;
		const name = (obj.name ?? "").trim();
		const rawPhone = obj.phone;
		const phone = cleanPhone(rawPhone);
		const rawEmail = (obj.email ?? "").trim();
		const email = rawEmail || null;
		const type = normalizeType(obj.type);
		const notes = (obj.notes ?? "").trim() || null;

		if (!name) {
			skipped++;
			resultRows.push({
				row: rowNum,
				primaryKey: legacyId,
				label: name || null,
				status: "skipped",
				message: "Name kosong",
			});
			continue;
		}

		const validation = RowSchema.safeParse({
			name,
			legacy_contact_id: legacyId ?? undefined,
			type,
			phone,
			email,
			notes,
		});

		if (!validation.success) {
			errors++;
			resultRows.push({
				row: rowNum,
				primaryKey: legacyId,
				label: name,
				status: "error",
				message: validation.error.issues
					.map((iss) => `${iss.path.join(".")}: ${iss.message}`)
					.join("; "),
			});
			continue;
		}

		const payload = {
			legacy_contact_id: validation.data.legacy_contact_id,
			type: validation.data.type,
			name: validation.data.name,
			phone: validation.data.phone,
			email: validation.data.email,
			notes: validation.data.notes,
			updated_at: new Date().toISOString(),
		};

		// Upsert by legacy_contact_id when present
		if (legacyId) {
			const { data: existing } = await supabase
				.from("contacts")
				.select("id")
				.eq("legacy_contact_id", legacyId)
				.maybeSingle();
			if (existing) {
				const { error: updErr } = await supabase
					.from("contacts")
					.update(payload)
					.eq("id", existing.id);
				if (updErr) {
					errors++;
					resultRows.push({
						row: rowNum,
						primaryKey: legacyId,
						label: name,
						status: "error",
						message: updErr.message,
					});
				} else {
					updated++;
					resultRows.push({
						row: rowNum,
						primaryKey: legacyId,
						label: name,
						status: "updated",
						category: "updated",
					});
				}
				continue;
			}
		}

		const { error: insErr } = await supabase.from("contacts").insert(payload);
		if (insErr) {
			errors++;
			resultRows.push({
				row: rowNum,
				primaryKey: legacyId,
				label: name,
				status: "error",
				message: insErr.message,
			});
		} else {
			inserted++;
			resultRows.push({
				row: rowNum,
				primaryKey: legacyId,
				label: name,
				status: "inserted",
				category: "inserted",
			});
		}
	}

	revalidatePath("/settings/contacts");
	revalidatePath("/settings/contacts/import");

	return {
		totalRows: rows.length,
		stats: [
			{ label: "Inserted", value: inserted, tone: "emerald" },
			{ label: "Updated", value: updated, tone: "primary" },
			{ label: "Skipped", value: skipped, tone: "muted" },
			{ label: "Errors", value: errors, tone: errors > 0 ? "rose" : "muted" },
		],
		rows: resultRows,
	};
}
