"use server";

import { randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/get-user";
import {
	PER_BATCH_TIMEOUT_MS,
	withRetry,
	withTimeout,
} from "@/lib/csv-import/resilience";
import type { ImportResult } from "@/lib/csv-import/types";
import { createClient } from "@/lib/supabase/server";
import { revalidateDashboard } from "@/lib/dashboard/stats";

// ─────────────────────────────────────────────────────────────────────────
// Auth
// ─────────────────────────────────────────────────────────────────────────

async function requireSuperAdmin() {
	const me = await getCurrentUser();
	if (!me) throw new Error("Unauthorized");
	if (me.profile.role !== "super_admin") {
		throw new Error("Forbidden — super_admin only");
	}
	return me;
}

// ─────────────────────────────────────────────────────────────────────────
// Parsers / normalizers
// ─────────────────────────────────────────────────────────────────────────

function parseRupiah(raw: string | undefined): number {
	if (!raw) return 0;
	const s = raw
		.toString()
		.replace(/[Rr][Pp]\.?/, "")
		.replace(/\s/g, "")
		.replace(/[.,](?=\d{3}\b)/g, "")
		.replace(/[.,](\d{1,2})$/, ".$1");
	const n = Number.parseFloat(s);
	return Number.isFinite(n) ? Math.round(n) : 0;
}

function parseDate(raw: string | undefined): string | null {
	if (!raw) return null;
	const s = raw.trim();
	if (!s) return null;
	const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
	if (iso) {
		return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
	}
	const slash = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(s);
	if (slash) {
		let a = Number.parseInt(slash[1], 10);
		let b = Number.parseInt(slash[2], 10);
		const y =
			slash[3].length === 2
				? 2000 + Number.parseInt(slash[3], 10)
				: Number.parseInt(slash[3], 10);
		if (a > 12 && b <= 12) {
			[a, b] = [b, a];
		}
		const m = a;
		const d = b;
		if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
			return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
		}
	}
	const dt = new Date(s);
	if (!Number.isNaN(dt.getTime())) {
		return dt.toISOString().slice(0, 10);
	}
	return null;
}

function parseTime(raw: string | undefined, fallback = "10:00:00"): string {
	if (!raw) return fallback;
	const s = raw.trim();
	if (!s) return fallback;
	const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(s);
	if (m) {
		const hh = m[1].padStart(2, "0");
		const mm = m[2];
		const ss = (m[3] ?? "00").padStart(2, "0");
		return `${hh}:${mm}:${ss}`;
	}
	return fallback;
}

function parseBool(raw: string | undefined): boolean {
	if (!raw) return true;
	const v = raw.trim().toLowerCase();
	return v === "true" || v === "1" || v === "y" || v === "yes" || v === "ya";
}

type Channel = "direct" | "vendor" | "relasi";

function resolveChannel(raw: string | undefined): Channel {
	const v = (raw ?? "").trim().toLowerCase();
	if (v.startsWith("vendor")) return "vendor";
	if (v.startsWith("relasi") || v.startsWith("ref")) return "relasi";
	return "direct";
}

type FrameSize = "2R" | "4R" | "polaroid" | "none";

function resolveFrameSize(raw: string | undefined): FrameSize {
	const v = (raw ?? "").trim().toLowerCase();
	if (v === "2r") return "2R";
	if (v === "4r") return "4R";
	if (v === "pr" || v.startsWith("polaroid")) return "polaroid";
	return "none";
}

type PaymentStatus = "unpaid" | "partial" | "paid" | "overdue";

function resolvePaymentStatus(raw: string | undefined): PaymentStatus {
	const v = (raw ?? "").trim().toLowerCase();
	if (v === "lunas" || v === "paid") return "paid";
	if (v === "dp" || v === "partial") return "partial";
	if (v === "overdue") return "overdue";
	return "unpaid";
}

function stripMigrasiSuffix(raw: string | undefined): string | null {
	if (!raw) return null;
	const cleaned = raw
		.replace(/\*?Migrasi Historis\*?/gi, "")
		.replace(/\s+$/g, "")
		.trim();
	return cleaned || null;
}

function resolveDesign(
	rawStatus: string | undefined,
	eventDate: string,
): { brief_at: string | null; approved_at: string | null } {
	const v = (rawStatus ?? "").trim().toLowerCase();
	const ts = `${eventDate}T00:00:00Z`;
	if (v.includes("acc") || v.includes("approved")) {
		return { brief_at: ts, approved_at: ts };
	}
	if (v.includes("brief") || v.includes("masuk")) {
		return { brief_at: ts, approved_at: null };
	}
	if (v.includes("menunggu") || v.includes("pending")) {
		return { brief_at: ts, approved_at: null };
	}
	return { brief_at: null, approved_at: null };
}

// ─────────────────────────────────────────────────────────────────────────
// Master-data resolvers
// ─────────────────────────────────────────────────────────────────────────

type Backdrop = { id: string; code: string; name: string };
type EventType = { code: string; label: string };
type Pkg = { id: string; name: string };
type CrewUser = { id: string; full_name: string };
type Contact = {
	id: string;
	legacy_contact_id: string | null;
	name: string;
	phone: string | null;
};

function resolveBackdrop(
	raw: string | undefined,
	backdrops: Backdrop[],
): { id: string | null; warning?: string } {
	const v = (raw ?? "").trim().toLowerCase();
	if (!v) return { id: null };
	if (
		v.includes("klien") ||
		v.includes("dekor") ||
		v.includes("decor") ||
		v.includes("vendor")
	) {
		const m = backdrops.find((b) => b.code === "BG-VENDOR-DECOR");
		return m
			? { id: m.id }
			: { id: null, warning: `backdrop "${raw}" not in master` };
	}
	const colorMap: Array<[string[], string]> = [
		[["gold", "emas"], "BG-BASIC-GOLD"],
		[["silver", "perak"], "BG-BASIC-SILVER"],
		[["putih", "white"], "BG-BASIC-WHITE"],
		[["hitam", "black"], "BG-BASIC-BLACK"],
		[["merah", "red"], "BG-BASIC-RED"],
	];
	for (const [keywords, code] of colorMap) {
		if (keywords.some((k) => v.includes(k))) {
			const m = backdrops.find((b) => b.code === code);
			if (m) return { id: m.id };
		}
	}
	const m = backdrops.find(
		(b) =>
			b.name.toLowerCase().includes(v) || v.includes(b.name.toLowerCase()),
	);
	if (m) return { id: m.id };
	const fallback = backdrops.find((b) => b.code === "BG-BASIC-GOLD");
	return {
		id: fallback?.id ?? null,
		warning: `backdrop "${raw}" → fallback BG-BASIC-GOLD`,
	};
}

function resolveEventCategory(
	raw: string | undefined,
	types: EventType[],
): string {
	const v = (raw ?? "").trim().toLowerCase();
	if (!v) return "event";
	const exact = types.find((t) => t.code === v);
	if (exact) return exact.code;
	if (v.includes("wedding") || v.includes("nikah") || v.includes("akad")) {
		return types.find((t) => t.code === "wedding")?.code ?? "event";
	}
	if (
		v.includes("birthday") ||
		v.includes("ultah") ||
		v.includes("ulang tahun")
	) {
		return types.find((t) => t.code === "birthday")?.code ?? "event";
	}
	if (v.includes("wisuda") || v.includes("graduation")) {
		return types.find((t) => t.code === "wisuda")?.code ?? "event";
	}
	if (v.includes("gathering")) {
		return types.find((t) => t.code === "gathering")?.code ?? "event";
	}
	if (v.includes("reuni")) {
		return types.find((t) => t.code === "reuni")?.code ?? "event";
	}
	if (v.includes("corporate") || v.includes("perusahaan")) {
		return types.find((t) => t.code === "corporate")?.code ?? "event";
	}
	if (v.includes("instansi") || v.includes("government")) {
		return types.find((t) => t.code === "instansi")?.code ?? "event";
	}
	return "event";
}

function resolvePackage(
	raw: string | undefined,
	packages: Pkg[],
): string | null {
	const v = (raw ?? "").trim().toLowerCase();
	if (!v) return null;
	if (v === "custom package" || v === "custom") return null;
	const m = packages.find((p) => p.name.toLowerCase() === v);
	if (m) return m.id;
	const fuzzy = packages.find(
		(p) =>
			p.name.toLowerCase().includes(v) || v.includes(p.name.toLowerCase()),
	);
	return fuzzy?.id ?? null;
}

function resolveCrewByName(
	raw: string | undefined,
	crew: CrewUser[],
): string | null {
	const v = (raw ?? "").trim().toLowerCase();
	if (!v) return null;
	const exact = crew.find((c) => c.full_name.toLowerCase() === v);
	if (exact) return exact.id;
	const partial = crew.find(
		(c) =>
			c.full_name.toLowerCase().includes(v) ||
			v.includes(c.full_name.toLowerCase()),
	);
	return partial?.id ?? null;
}

function classify(
	eventDate: string,
	statusProject: string | undefined,
	today: string,
): { isPast: boolean; mappedStatus: string } {
	const v = (statusProject ?? "").trim().toLowerCase();
	const dateInPast = eventDate < today;
	const isClosed =
		v.includes("done") ||
		v.includes("selesai") ||
		v.includes("complete") ||
		v.includes("lunas") ||
		v.includes("archive");
	// Past legacy events are historical/done → completed (settlement N/A; they
	// stay flagged is_migrated_legacy). The deprecated draft/confirmed/archived
	// statuses are no longer used — see @/lib/event-status.
	if (dateInPast && isClosed) {
		return { isPast: true, mappedStatus: "completed" };
	}
	if (v.includes("cancel") || v.includes("batal"))
		return { isPast: false, mappedStatus: "cancelled" };
	if (dateInPast) return { isPast: true, mappedStatus: "completed" };
	if (v.includes("in progress") || v.includes("proses"))
		return { isPast: false, mappedStatus: "in_progress" };
	return { isPast: false, mappedStatus: "upcoming" };
}

const RowSchema = z.object({
	project_id: z.string().trim().min(3),
	client_name: z.string().trim().min(1),
	event_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "event_date invalid"),
	total_price: z.number().int().nonnegative(),
});

function generatePaymentRefId(date: string): string {
	const compact = date.replaceAll("-", "");
	return `PAY-${compact}-${randomInt(1000, 10000)}`;
}

// ─────────────────────────────────────────────────────────────────────────
// Public action 1 — duplicate check (called from wizard step 3)
// ─────────────────────────────────────────────────────────────────────────

export async function checkProjectDuplicates(
	projectIds: string[],
): Promise<string[]> {
	await requireSuperAdmin();
	if (projectIds.length === 0) return [];
	const supabase = await createClient();
	const { data, error } = await supabase
		.from("events")
		.select("project_id")
		.in("project_id", projectIds);
	if (error) throw new Error(`Duplicate check: ${error.message}`);
	return (data ?? []).map((r) => r.project_id as string);
}

// ─────────────────────────────────────────────────────────────────────────
// Public action 2 — commit (called from wizard step 4)
// ─────────────────────────────────────────────────────────────────────────

export async function commitProjectImport(
	rows: Record<string, string>[],
	rowOffset = 0,
): Promise<ImportResult> {
	return withTimeout(
		() => commitProjectImportInner(rows, rowOffset),
		PER_BATCH_TIMEOUT_MS,
		"projects batch import",
	);
}

async function commitProjectImportInner(
	rows: Record<string, string>[],
	rowOffset = 0,
): Promise<ImportResult> {
	const me = await requireSuperAdmin();
	const supabase = await createClient();

	// Collect Contact_IDs needed by this batch so we only fetch matching ones
	const neededContactIds = new Set<string>();
	for (const row of rows) {
		const b = (row.booker_contact_id ?? "").trim();
		const p = (row.pic_contact_id ?? "").trim();
		if (b) neededContactIds.add(b);
		if (p) neededContactIds.add(p);
	}

	// Pre-fetch project_ids that already exist in this batch — avoids N+1
	// .maybeSingle() round-trips inside the per-row loop.
	const projectIdsInBatch = rows
		.map((r) => (r.project_id ?? "").trim())
		.filter(Boolean);

	const [
		{ data: backdropRows },
		{ data: typeRows },
		{ data: pkgRows },
		{ data: crewRows },
		{ data: bankRows },
		{ data: contactRows },
		{ data: existingProjectRows },
	] = await Promise.all([
		withRetry(() => supabase.from("backdrops").select("id, code, name")),
		withRetry(() =>
			supabase
				.from("event_types")
				.select("code, label")
				.eq("is_active", true),
		),
		withRetry(() => supabase.from("packages").select("id, name")),
		withRetry(() =>
			supabase
				.from("users")
				.select("id, full_name")
				.in("role", ["crew", "owner", "super_admin"])
				.eq("is_active", true),
		),
		withRetry(() =>
			supabase
				.from("bank_accounts")
				.select("id, is_default_receive, is_active")
				.eq("is_active", true),
		),
		neededContactIds.size > 0
			? withRetry(() =>
					supabase
						.from("contacts")
						.select("id, legacy_contact_id, name, phone")
						.in("legacy_contact_id", Array.from(neededContactIds)),
				)
			: Promise.resolve({ data: [] as Contact[] }),
		projectIdsInBatch.length > 0
			? withRetry(() =>
					supabase
						.from("events")
						.select("project_id")
						.in("project_id", projectIdsInBatch),
				)
			: Promise.resolve({ data: [] as Array<{ project_id: string }> }),
	]);

	const existingProjectIds = new Set<string>();
	for (const r of (existingProjectRows ?? []) as Array<{ project_id: string }>) {
		existingProjectIds.add(r.project_id);
	}

	const backdrops: Backdrop[] = backdropRows ?? [];
	const eventTypes: EventType[] = typeRows ?? [];
	const packages: Pkg[] = pkgRows ?? [];
	const crew: CrewUser[] = (crewRows ?? []) as CrewUser[];
	const defaultBankId =
		(bankRows ?? []).find((b) => b.is_default_receive)?.id ??
		(bankRows ?? [])[0]?.id ??
		null;

	// Build Map<legacy_contact_id, Contact> for O(1) lookup
	const contactsByLegacy = new Map<string, Contact>();
	for (const c of (contactRows ?? []) as Contact[]) {
		if (c.legacy_contact_id) contactsByLegacy.set(c.legacy_contact_id, c);
	}

	const today = new Date().toISOString().slice(0, 10);

	let archivedCount = 0;
	let liveCount = 0;
	let skippedCount = 0;
	let errorCount = 0;
	const resultRows: ImportResult["rows"] = [];

	for (let i = 0; i < rows.length; i++) {
		const rowNum = rowOffset + i + 2;
		const obj = rows[i];
		const projectId = (obj.project_id ?? "").trim() || null;
		const clientName = (obj.client_name ?? "").trim() || null;
		const warnings: string[] = [];

		if (!projectId || !clientName) {
			skippedCount++;
			resultRows.push({
				row: rowNum,
				primaryKey: projectId,
				label: clientName,
				status: "skipped",
				message: "project_id atau client_name kosong",
			});
			continue;
		}

		const eventDate = parseDate(obj.event_date);
		const totalPrice = parseRupiah(obj.total_price);
		if (!eventDate) {
			errorCount++;
			resultRows.push({
				row: rowNum,
				primaryKey: projectId,
				label: clientName,
				status: "error",
				message: `event_date invalid: "${obj.event_date}"`,
			});
			continue;
		}

		const validation = RowSchema.safeParse({
			project_id: projectId,
			client_name: clientName,
			event_date: eventDate,
			total_price: totalPrice,
		});
		if (!validation.success) {
			errorCount++;
			resultRows.push({
				row: rowNum,
				primaryKey: projectId,
				label: clientName,
				status: "error",
				message: validation.error.issues
					.map((iss) => `${iss.path.join(".")}: ${iss.message}`)
					.join("; "),
			});
			continue;
		}

		if (existingProjectIds.has(projectId)) {
			skippedCount++;
			resultRows.push({
				row: rowNum,
				primaryKey: projectId,
				label: clientName,
				status: "skipped",
				message: "Duplicate project_id (already in DB)",
			});
			continue;
		}

		const { isPast, mappedStatus } = classify(eventDate, obj.status_project, today);

		// Resolve Booker + PIC contacts via legacy CT-XXX id
		const bookerLegacyId = (obj.booker_contact_id ?? "").trim();
		const picLegacyId = (obj.pic_contact_id ?? "").trim();
		const bookerContact = bookerLegacyId
			? contactsByLegacy.get(bookerLegacyId)
			: undefined;
		const picContact = picLegacyId ? contactsByLegacy.get(picLegacyId) : undefined;
		if (bookerLegacyId && !bookerContact) {
			warnings.push(
				`booker contact "${bookerLegacyId}" not in contacts master`,
			);
		}
		if (picLegacyId && !picContact) {
			warnings.push(`pic contact "${picLegacyId}" not in contacts master`);
		}

		const channel = resolveChannel(obj.channel);
		const frameSize = resolveFrameSize(obj.sleeve_type);
		const eventCategory = resolveEventCategory(obj.event_type, eventTypes);
		const packageId = resolvePackage(obj.package_name, packages);
		const backdropResolved = resolveBackdrop(obj.background_type, backdrops);
		if (backdropResolved.warning) warnings.push(backdropResolved.warning);

		const basePrice = parseRupiah(obj.base_price) || totalPrice;
		const discount = parseRupiah(obj.discount);
		const grossUp = parseRupiah(obj.gross_up);
		const paid = parseRupiah(obj.paid);
		const balance = parseRupiah(obj.balance_due);
		const dueDate = parseDate(obj.payment_due_date);

		const startTime = parseTime(obj.start_time, "10:00:00");
		const setupTime = parseTime(obj.setup_time, startTime);
		const endTime = parseTime(obj.end_time, "16:00:00");

		const design = resolveDesign(obj.design_status, eventDate);

		let forcedLunas = false;
		if (
			isPast &&
			(obj.payment_status?.toLowerCase() === "dp" ||
				obj.payment_status?.toLowerCase() === "unpaid" ||
				balance > 0)
		) {
			forcedLunas = true;
			warnings.push("Past+Unpaid: forced lunas; review manually");
		}

		if (
			!isPast &&
			balance > 0 &&
			Math.abs(paid + balance - totalPrice) > 1
		) {
			warnings.push(
				`paid (${paid}) + balance (${balance}) ≠ total (${totalPrice})`,
			);
		}

		const totalPaidValue = isPast ? totalPrice : paid;
		const remainingBalanceValue = isPast ? 0 : Math.max(0, totalPrice - paid);
		const paymentStatusValue: PaymentStatus = isPast
			? "paid"
			: paid >= totalPrice && totalPrice > 0
				? "paid"
				: paid > 0
					? "partial"
					: resolvePaymentStatus(obj.payment_status);

		// client_wa default fallback "-" — overridden if booker contact has phone
		const resolvedClientWa = bookerContact?.phone || "-";
		const resolvedPicName = picContact?.name ?? null;
		const resolvedPicWa = picContact?.phone ?? null;

		const eventPayload: Record<string, unknown> = {
			project_id: projectId,
			status: mappedStatus,
			channel,
			client_name: clientName,
			client_wa: resolvedClientWa,
			pic_name: resolvedPicName,
			pic_wa: resolvedPicWa,
			booker_contact_id: bookerContact?.id ?? null,
			pic_contact_id: picContact?.id ?? null,
			service_type: "photobooth_classic",
			package_id: packageId,
			custom_package_name: packageId ? null : obj.package_name || null,
			custom_package_price: packageId ? null : basePrice || null,
			frame_size: frameSize,
			backdrop_source: "basic_tetra",
			backdrop_color: null,
			backdrop_id: backdropResolved.id,
			vendor_decor_markup: 0,
			include_flashdisk_pouch: parseBool(obj.include_flashdisk),
			event_category: eventCategory,
			event_date: eventDate,
			setup_time: setupTime,
			start_time: startTime,
			end_time: endTime,
			venue_name: obj.venue || "-",
			venue_address: obj.venue || null,
			venue_city: obj.city || null,
			google_maps_url: obj.maps_url || null,
			base_price: basePrice,
			addons_total: 0,
			discount_amount: discount,
			discount_percentage: 0,
			gross_up_pph_amount: grossUp,
			grand_total: totalPrice,
			total_paid: totalPaidValue,
			remaining_balance: remainingBalanceValue,
			payment_status: paymentStatusValue,
			due_date: dueDate,
			design_brief_at: design.brief_at,
			design_approved_at: design.approved_at,
			design_drive_folder_url: obj.design_link || null,
			crew_notes: stripMigrasiSuffix(obj.notes),
			is_migrated_legacy: isPast,
			legacy_invoice_number: obj.invoice_number || null,
			created_by: me.authId,
		};

		const { data: insertedEvent, error: insertErr } = await withRetry(() =>
			supabase.from("events").insert(eventPayload).select("id").single(),
		);

		if (insertErr || !insertedEvent) {
			errorCount++;
			resultRows.push({
				row: rowNum,
				primaryKey: projectId,
				label: clientName,
				status: "error",
				message: `events insert: ${insertErr?.message ?? "unknown"}`,
				warnings: warnings.length ? warnings : undefined,
			});
			continue;
		}

		const eventId = insertedEvent.id as string;

		const crewLeadId = resolveCrewByName(obj.crew_a, crew);
		const crewAsstId = resolveCrewByName(obj.crew_b, crew);

		if (obj.crew_a && !crewLeadId)
			warnings.push(`crew lead "${obj.crew_a}" not in master`);
		if (obj.crew_b && !crewAsstId)
			warnings.push(`crew asisten "${obj.crew_b}" not in master`);

		const crewInserts: Array<Record<string, unknown>> = [];
		if (crewLeadId) {
			crewInserts.push({
				event_id: eventId,
				user_id: crewLeadId,
				role_in_event: "lead",
				fee_amount: 0,
				bonus_amount: 0,
				is_paid: isPast,
				assigned_by: me.authId,
			});
		}
		if (crewAsstId && crewAsstId !== crewLeadId) {
			crewInserts.push({
				event_id: eventId,
				user_id: crewAsstId,
				role_in_event: "asisten",
				fee_amount: 0,
				bonus_amount: 0,
				is_paid: isPast,
				assigned_by: me.authId,
			});
		}
		if (crewInserts.length > 0) {
			const { error: crewErr } = await withRetry(() =>
				supabase.from("crew_assignments").insert(crewInserts),
			);
			if (crewErr) warnings.push(`crew_assignments: ${crewErr.message}`);
		}

		if (!isPast && paid > 0) {
			if (!defaultBankId) {
				warnings.push(
					"no default bank account — DP not recorded; create a bank in /finance/bank-accounts then re-import",
				);
			} else {
				const { error: payErr } = await withRetry(() =>
					supabase.from("payments").insert({
						ref_id: generatePaymentRefId(today),
						event_id: eventId,
						amount: paid,
						payment_date: today,
						bank_account_id: defaultBankId,
						payment_type: "dp",
						notes: "Migrated DP from Phase 2",
						recorded_by: me.authId,
					}),
				);
				if (payErr) warnings.push(`payments insert: ${payErr.message}`);
			}
		}

		const category = isPast ? "archived" : "live";
		if (isPast) archivedCount++;
		else liveCount++;

		const messages: string[] = [];
		if (forcedLunas) messages.push("forced lunas (past+unpaid)");

		resultRows.push({
			row: rowNum,
			primaryKey: projectId,
			label: clientName,
			status: category,
			category,
			message: messages.join("; ") || undefined,
			warnings: warnings.length ? warnings : undefined,
		});
	}

	revalidatePath("/operations");
	revalidateDashboard();
	revalidatePath("/settings/operations/import-projects");

	return {
		totalRows: rows.length,
		stats: [
			{ label: "📦 Archived", value: archivedCount, tone: "amber" },
			{ label: "📥 Live", value: liveCount, tone: "emerald" },
			{ label: "Skipped", value: skippedCount, tone: "muted" },
			{ label: "Errors", value: errorCount, tone: errorCount > 0 ? "rose" : "muted" },
		],
		rows: resultRows,
	};
}
