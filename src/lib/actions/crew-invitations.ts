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

async function requireSuperAdmin() {
	const me = await getCurrentUser();
	if (!me) throw new Error("Unauthorized");
	if (me.profile.role !== "super_admin") {
		throw new Error("Forbidden — super_admin only");
	}
	return me;
}

const TIERS = ["senior", "junior"] as const;

// Lenient email regex — accepts any non-whitespace local + domain + TLD.
// Strict zod .email() rejects edge cases like emails with + or dots that
// are actually valid in Gmail (e.g. user.name+tag@gmail.com).
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(raw: unknown): string {
	if (typeof raw !== "string") return "";
	return raw.trim().toLowerCase();
}

function normalizeTier(raw: unknown): "senior" | "junior" {
	const v = (typeof raw === "string" ? raw : "").trim().toLowerCase();
	return v === "senior" ? "senior" : "junior";
}

const InvitationSchema = z.object({
	email: z
		.string()
		.min(1, "email kosong")
		.refine((v) => EMAIL_REGEX.test(v), {
			message: "email format invalid",
		}),
	full_name: z.string().trim().min(1, "full_name kosong").max(120),
	nickname: z
		.string()
		.trim()
		.max(60)
		.nullish()
		.transform((v) => (v ? v : null)),
	phone_wa: z
		.string()
		.trim()
		.max(40)
		.nullish()
		.transform((v) => (v ? v : null)),
	tier: z.enum(TIERS),
	default_fee_override: z
		.union([z.coerce.number().int().nonnegative(), z.literal("")])
		.nullish()
		.transform((v) => (typeof v === "number" ? v : null)),
	notes: z
		.string()
		.trim()
		.max(500)
		.nullish()
		.transform((v) => (v ? v : null)),
});

// Pre-process raw row → normalized payload before zod validation.
// Returns null if email is hopelessly malformed (caller can short-circuit
// with a clearer error than zod's generic "format invalid").
function preprocessRow(obj: Record<string, string>): {
	error?: string;
	data?: z.input<typeof InvitationSchema>;
} {
	const email = normalizeEmail(obj.email ?? "");
	if (!email) return { error: "email kosong" };
	if (!EMAIL_REGEX.test(email))
		return { error: `email "${email}" format invalid` };
	return {
		data: {
			email,
			full_name: (obj.full_name ?? "").trim(),
			nickname: obj.nickname ?? "",
			phone_wa: obj.phone_wa ?? "",
			tier: normalizeTier(obj.tier),
			default_fee_override: obj.default_fee_override ?? "",
			notes: obj.notes ?? "",
		},
	};
}

export type InvitationFormState =
	| { error?: string; ok?: boolean }
	| undefined;

// ─────────────────────────────────────────────────────────────────────────
// Single invitation create
// ─────────────────────────────────────────────────────────────────────────

export async function createCrewInvitation(
	_prev: InvitationFormState,
	formData: FormData,
): Promise<InvitationFormState> {
	try {
		const me = await requireSuperAdmin();
		const raw: Record<string, string> = {
			email: String(formData.get("email") ?? ""),
			full_name: String(formData.get("full_name") ?? ""),
			nickname: String(formData.get("nickname") ?? ""),
			phone_wa: String(formData.get("phone_wa") ?? ""),
			tier: String(formData.get("tier") ?? ""),
			default_fee_override: String(formData.get("default_fee_override") ?? ""),
			notes: String(formData.get("notes") ?? ""),
		};
		const pre = preprocessRow(raw);
		if (pre.error || !pre.data) {
			return { error: pre.error ?? "Invalid input" };
		}
		const parsed = InvitationSchema.safeParse(pre.data);
		if (!parsed.success) {
			return {
				error: parsed.error.issues
					.map((iss) =>
						iss.path.length
							? `${iss.path.join(".")}: ${iss.message}`
							: iss.message,
					)
					.join("; "),
			};
		}

		const supabase = await createClient();

		// Check if already accepted (i.e., user exists with this email already)
		const { data: existingUser } = await supabase
			.from("users")
			.select("id, role")
			.eq("email", parsed.data.email)
			.maybeSingle();
		if (existingUser) {
			return {
				error: `User dengan email ${parsed.data.email} sudah terdaftar (role: ${existingUser.role}). Edit role-nya langsung di tabel Master Crew.`,
			};
		}

		const { error } = await supabase.from("crew_invitations").insert({
			...parsed.data,
			invited_by: me.profile.id,
		});
		if (error) {
			if (/duplicate key/i.test(error.message)) {
				return {
					error: `Email ${parsed.data.email} sudah ada di invitations.`,
				};
			}
			return { error: error.message };
		}

		revalidatePath("/settings/crew");
		return { ok: true };
	} catch (err) {
		return { error: err instanceof Error ? err.message : "Unknown error" };
	}
}

// ─────────────────────────────────────────────────────────────────────────
// Single invitation delete
// ─────────────────────────────────────────────────────────────────────────

export async function deleteCrewInvitation(
	id: string,
): Promise<{ error?: string }> {
	try {
		await requireSuperAdmin();
		const supabase = await createClient();
		const { error } = await supabase
			.from("crew_invitations")
			.delete()
			.eq("id", id)
			.is("accepted_at", null);
		if (error) return { error: error.message };
		revalidatePath("/settings/crew");
		return {};
	} catch (err) {
		return { error: err instanceof Error ? err.message : "Unknown error" };
	}
}

// ─────────────────────────────────────────────────────────────────────────
// Bulk CSV import (matches CsvImportWizard interface)
// ─────────────────────────────────────────────────────────────────────────

export async function checkInvitationDuplicates(
	emails: string[],
): Promise<string[]> {
	await requireSuperAdmin();
	const filtered = emails.map((e) => e.trim().toLowerCase()).filter(Boolean);
	if (filtered.length === 0) return [];
	const supabase = await createClient();
	const [{ data: invs }, { data: existingUsers }] = await Promise.all([
		withRetry(() =>
			supabase.from("crew_invitations").select("email").in("email", filtered),
		),
		withRetry(() =>
			supabase.from("users").select("email").in("email", filtered),
		),
	]);
	const dupes = new Set<string>();
	for (const r of (invs ?? []) as Array<{ email: string }>) dupes.add(r.email);
	for (const r of (existingUsers ?? []) as Array<{ email: string }>)
		dupes.add(r.email);
	return Array.from(dupes);
}

export async function commitInvitationImport(
	rows: Record<string, string>[],
	rowOffset = 0,
): Promise<ImportResult> {
	return withTimeout(
		async () => {
			const me = await requireSuperAdmin();
			const supabase = await createClient();

			let inserted = 0;
			let updated = 0;
			let skipped = 0;
			let errors = 0;
			const resultRows: ImportResultRow[] = [];

			// Pre-fetch existing emails (invitations OR users) to classify
			const emailsInBatch = rows
				.map((r) => (r.email ?? "").trim().toLowerCase())
				.filter(Boolean);
			const existingEmails = new Set<string>();
			if (emailsInBatch.length > 0) {
				const [{ data: invs }, { data: users }] = await Promise.all([
					withRetry(() =>
						supabase
							.from("crew_invitations")
							.select("email")
							.in("email", emailsInBatch),
					),
					withRetry(() =>
						supabase.from("users").select("email").in("email", emailsInBatch),
					),
				]);
				for (const r of (invs ?? []) as Array<{ email: string }>)
					existingEmails.add(r.email);
				for (const r of (users ?? []) as Array<{ email: string }>)
					existingEmails.add(r.email);
			}

			const tasks = rows.map(
				(obj, i) => async (): Promise<ImportResultRow> => {
					const rowNum = rowOffset + i + 2;
					const pre = preprocessRow(obj);
					if (pre.error || !pre.data) {
						return {
							row: rowNum,
							primaryKey: obj.email ?? null,
							label: obj.full_name ?? null,
							status: "error",
							message: pre.error ?? "preprocess gagal",
						};
					}
					const validation = InvitationSchema.safeParse(pre.data);
					if (!validation.success) {
						return {
							row: rowNum,
							primaryKey: pre.data.email,
							label: obj.full_name ?? null,
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

					const data = validation.data;
					const isExisting = existingEmails.has(data.email);

					try {
						if (isExisting) {
							// Skip — don't overwrite an accepted user, and avoid stomping
							// on an existing invitation silently
							return {
								row: rowNum,
								primaryKey: data.email,
								label: data.full_name,
								status: "skipped",
								message:
									"Email sudah ada (sebagai invitation aktif atau user terdaftar)",
							};
						}
						const { error } = await withRetry(() =>
							supabase.from("crew_invitations").insert({
								...data,
								invited_by: me.profile.id,
							}),
						);
						if (error) throw new Error(error.message);
						return {
							row: rowNum,
							primaryKey: data.email,
							label: data.full_name,
							status: "inserted",
							category: "inserted",
						};
					} catch (err) {
						return {
							row: rowNum,
							primaryKey: data.email,
							label: data.full_name,
							status: "error",
							message:
								err instanceof Error ? err.message : "Unknown DB error",
						};
					}
				},
			);

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
							s.reason instanceof Error
								? s.reason.message
								: "Worker rejected",
					});
				}
			}

			revalidatePath("/settings/crew");

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
		"crew invitations import",
	);
}
