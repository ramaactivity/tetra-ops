"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/get-user";
import {
	PER_BATCH_CONCURRENCY,
	PER_BATCH_TIMEOUT_MS,
	runWithConcurrency,
	withRetry,
	withTimeout,
} from "@/lib/csv-import/resilience";
import type { ImportResult, ImportResultRow } from "@/lib/csv-import/types";
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
	return null;
}

function cleanPhone(raw: string | undefined): string | null {
	if (!raw) return null;
	const cleaned = raw
		.replace(/[\s­​‌‍﻿ ]/g, "")
		.replace(/[^\d+]/g, "");
	return cleaned || null;
}

function cleanEmail(raw: string | undefined): string | null {
	if (!raw) return null;
	const v = raw.trim();
	return v || null;
}

const RowSchema = z.object({
	name: z.string().trim().min(1).max(200),
	legacy_contact_id: z.string().trim().nullish(),
	type: z.string().nullish(),
	phone: z.string().nullish(),
	email: z
		.union([z.string().email(), z.literal(""), z.null(), z.undefined()])
		.transform((v) => (v ? v : null)),
	notes: z.string().trim().max(500).nullish(),
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
	const { data, error } = await withRetry(() =>
		supabase
			.from("contacts")
			.select("legacy_contact_id")
			.in("legacy_contact_id", filtered),
	);
	if (error) throw new Error(`Duplicate check: ${error.message}`);
	return (data ?? [])
		.map((r) => r.legacy_contact_id as string | null)
		.filter((v): v is string => Boolean(v));
}

// ─────────────────────────────────────────────────────────────────────────
// Public action 2 — commit (upsert by legacy_contact_id when present)
// ─────────────────────────────────────────────────────────────────────────

export async function commitContactImport(
	rows: Record<string, string>[],
	rowOffset = 0,
): Promise<ImportResult> {
	return withTimeout(
		async () => {
			await requireOwnerLevel();
			const supabase = await createClient();

			let inserted = 0;
			let updated = 0;
			let skipped = 0;
			let errors = 0;
			const resultRows: ImportResultRow[] = [];

			// Pre-fetch which legacy_ids in this batch already exist → classify
			// each row as insert vs update without an extra round-trip per row.
			const legacyIdsInBatch = rows
				.map((r) => (r.legacy_contact_id ?? "").trim())
				.filter(Boolean);
			const existingIds = new Set<string>();
			if (legacyIdsInBatch.length > 0) {
				const { data: existing } = await withRetry(() =>
					supabase
						.from("contacts")
						.select("legacy_contact_id")
						.in("legacy_contact_id", legacyIdsInBatch),
				);
				for (const r of existing ?? []) {
					if (r.legacy_contact_id) existingIds.add(r.legacy_contact_id);
				}
			}

			const tasks = rows.map((obj, i) => async (): Promise<ImportResultRow> => {
				const rowNum = rowOffset + i + 2;
				const legacyId = (obj.legacy_contact_id ?? "").trim() || null;
				const name = (obj.name ?? "").trim();
				const phone = cleanPhone(obj.phone);
				const email = cleanEmail(obj.email);
				const type = normalizeType(obj.type);
				const notes = (obj.notes ?? "").trim() || null;

				if (!name) {
					return {
						row: rowNum,
						primaryKey: legacyId,
						label: name || null,
						status: "skipped",
						message: "Name kosong",
					};
				}

				const validation = RowSchema.safeParse({
					name,
					legacy_contact_id: legacyId,
					type,
					phone,
					email,
					notes,
				});
				if (!validation.success) {
					return {
						row: rowNum,
						primaryKey: legacyId,
						label: name,
						status: "error",
						message: validation.error.issues
							.map((iss) =>
								iss.path.length
									? `${iss.path.join(".")}: ${iss.message}`
									: iss.message,
							)
							.join("; "),
					};
				}

				const payload = {
					legacy_contact_id: validation.data.legacy_contact_id ?? null,
					type: validation.data.type ?? null,
					name: validation.data.name,
					phone: validation.data.phone ?? null,
					email: validation.data.email,
					notes: validation.data.notes ?? null,
					updated_at: new Date().toISOString(),
				};

				const isUpdate = legacyId ? existingIds.has(legacyId) : false;

				try {
					if (legacyId) {
						const { error } = await withRetry(() =>
							supabase
								.from("contacts")
								.upsert(payload, {
									onConflict: "legacy_contact_id",
									ignoreDuplicates: false,
								}),
						);
						if (error) throw new Error(error.message);
					} else {
						const { error } = await withRetry(() =>
							supabase.from("contacts").insert(payload),
						);
						if (error) throw new Error(error.message);
					}
					return {
						row: rowNum,
						primaryKey: legacyId,
						label: name,
						status: isUpdate ? "updated" : "inserted",
						category: isUpdate ? "updated" : "inserted",
					};
				} catch (err) {
					return {
						row: rowNum,
						primaryKey: legacyId,
						label: name,
						status: "error",
						message: err instanceof Error ? err.message : "Unknown DB error",
					};
				}
			});

			const settled = await runWithConcurrency(tasks, PER_BATCH_CONCURRENCY);
			for (const s of settled) {
				if (s.status === "fulfilled") {
					const r = s.value;
					resultRows.push(r);
					if (r.status === "inserted") inserted++;
					else if (r.status === "updated") updated++;
					else if (r.status === "skipped") skipped++;
					else if (r.status === "error") errors++;
				} else {
					errors++;
					resultRows.push({
						row: rowOffset + 2,
						primaryKey: null,
						label: null,
						status: "error",
						message:
							s.reason instanceof Error ? s.reason.message : "Worker rejected",
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
					{
						label: "Errors",
						value: errors,
						tone: errors > 0 ? "rose" : "muted",
					},
				],
				rows: resultRows,
			};
		},
		PER_BATCH_TIMEOUT_MS,
		"contacts batch import",
	);
}
