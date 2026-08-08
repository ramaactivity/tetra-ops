"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/get-user";
import { FRAME_AGNOSTIC, packageFitsFrame } from "@/lib/events/frame-package";
import { createClient } from "@/lib/supabase/server";
import { tgEscape } from "@/lib/telegram/client";
import { rp } from "@/lib/telegram/digest";
import {
	notifyTelegramDesignApproved,
	notifyTelegramEventUpdated,
} from "@/lib/telegram/notify";

async function requireOwnerLevel() {
	const me = await getCurrentUser();
	if (!me) throw new Error("Unauthorized");
	if (me.profile.role !== "super_admin" && me.profile.role !== "owner") {
		throw new Error("Forbidden — owner-level only");
	}
	return me;
}

const DesignLinkSchema = z.object({
	url: z
		.string()
		.trim()
		.url("Harus URL valid (https://drive.google.com/...)")
		.max(500),
	label: z.string().trim().max(120).optional(),
});

export type DesignFormState =
	| { error?: string; values?: Record<string, string> }
	| undefined;

/**
 * Add a design link from the Operations event page. This writes to the SAME
 * store as the Asset & Design page — an `event_assets` row of type
 * `design_frame` — so a link added here shows up there and vice versa (single
 * source of truth, no separate `design_drive_folder_url` silo).
 *
 * `events.design_drive_folder_url` is still mirrored to the latest link for
 * backward-compat (crew "Desain" shortcut + legacy readers), and design_status
 * is bumped off "belum" since adding a design means work has started.
 */
export async function addDesignLink(
	eventId: string,
	projectId: string,
	_prev: DesignFormState,
	formData: FormData,
): Promise<DesignFormState> {
	const me = await requireOwnerLevel();

	const parsed = DesignLinkSchema.safeParse({
		url: formData.get("url"),
		label: formData.get("label") ?? undefined,
	});
	if (!parsed.success) {
		return {
			error: parsed.error.issues[0]?.message ?? "Invalid input",
			values: { url: String(formData.get("url") ?? "") },
		};
	}

	const supabase = await createClient();

	const { error: assetErr } = await supabase.from("event_assets").insert({
		event_id: eventId,
		asset_type: "design_frame",
		label: parsed.data.label || "Design link",
		url: parsed.data.url,
		uploaded_by: me.profile.id,
	});
	if (assetErr) return { error: assetErr.message };

	const { data: cur } = await supabase
		.from("events")
		.select("design_brief_at, design_status")
		.eq("id", eventId)
		.maybeSingle();

	const now = new Date().toISOString();
	const updates: Record<string, unknown> = {
		design_drive_folder_url: parsed.data.url,
		updated_at: now,
	};
	if (!cur?.design_brief_at) updates.design_brief_at = now;
	// Adding a design means work has started — move off "belum". Does NOT touch
	// the event lifecycle status.
	if (cur?.design_status === "belum" || !cur?.design_status) {
		updates.design_status = "proses";
	}
	await supabase.from("events").update(updates).eq("id", eventId);

	revalidatePath(`/operations/${projectId}`);
	revalidatePath(`/design/${projectId}`);
	revalidatePath("/design");
	return undefined;
}

const DESIGN_STATUSES = ["belum", "proses", "approved"] as const;
export type DesignStatusValue = (typeof DESIGN_STATUSES)[number];

/**
 * Set an event's design workflow status (belum | proses | approved). This is the
 * single entry point for design-status changes — used both on the Asset & Design
 * list and the event detail page. Kept independent of the event lifecycle status.
 * Design timestamps are synced for backward compatibility (readiness card etc.).
 */
export async function setDesignStatus(
	eventId: string,
	projectId: string,
	status: DesignStatusValue,
): Promise<{ error?: string }> {
	// Invoked from a client startTransition without try/catch — never throw,
	// always resolve with { error } so a failure can't crash the page.
	try {
		const me = await getCurrentUser();
		if (!me) return { error: "Sesi berakhir. Refresh halaman lalu coba lagi." };
		if (me.profile.role !== "super_admin" && me.profile.role !== "owner") {
			return { error: "Hanya owner yang bisa mengubah status design." };
		}
		if (!DESIGN_STATUSES.includes(status)) {
			return { error: "Status design tidak valid" };
		}
		// "Approved" punya pintu sendiri (approveDesign) yang mewajibkan
		// desainer menyatakan ukuran file-nya. Tanpa penjagaan ini, ACC masih
		// bisa lolos lewat jalur lama dan gerbang terakhir itu jadi hiasan.
		if (status === "approved") {
			return {
				error:
					"ACC desain lewat tombol Approved — sistem akan menanyakan ukuran desainnya dulu.",
			};
		}

		const supabase = await createClient();
		const { data: cur } = await supabase
			.from("events")
			.select("design_brief_at")
			.eq("id", eventId)
			.maybeSingle();

		const now = new Date().toISOString();
		const updates: Record<string, unknown> = {
			design_status: status,
			// Turun dari "approved" → jejak ACC ikut dicabut, termasuk ukuran yang
			// dulu dinyatakan desainer; kalau tidak, event terlihat masih punya
			// "ukuran desain yang sudah divalidasi" padahal ACC-nya sudah batal.
			design_approved_at: null,
			design_approved_by: null,
			design_frame_size: null,
			updated_at: now,
		};
		// First-touch timestamp when leaving "belum".
		if (status !== "belum" && !cur?.design_brief_at) {
			updates.design_brief_at = now;
		}

		const { error } = await supabase
			.from("events")
			.update(updates)
			.eq("id", eventId);
		if (error) return { error: error.message };

		revalidatePath(`/operations/${projectId}`);
		revalidatePath("/design");
		return {};
	} catch (err) {
		return {
			error:
				err instanceof Error ? err.message : "Gagal mengubah status design.",
		};
	}
}

// ── Gerbang terakhir: ACC desain ────────────────────────────────────────────
//
// Desainer adalah orang terakhir yang melihat file sebelum dicetak. Sejak 8
// Agu 2026 (event tercatat 2R, klien pesan 4R, ketahuan di hari-H) dia wajib
// menyatakan ukuran file yang dia buat. Kalau berbeda dengan pesanan, ACC
// ditahan dan dia — yang juga owner — bisa langsung membetulkan ukuran & paket
// event dari dialog itu juga; perubahannya diumumkan ke grup Telegram.

export type DesignApprovalContext = {
	eventId: string;
	projectId: string;
	clientName: string;
	eventDate: string;
	/** Ukuran yang dipesan klien. null = masih menyusul. */
	frameSize: string | null;
	/** Paket terpasang, kalau sudah final. */
	packageName: string | null;
	/** Durasi yang berlaku (dari paket atau dari kesepakatan sementara). */
	durationHours: number | null;
	/** Paket ini memang tanpa cetak frame (Videobooth, Photo Stage)? */
	frameIrrelevant: boolean;
	/** Pilihan koreksi: paket dengan durasi sama di tiap ukuran. */
	alternatives: Array<{
		packageId: string;
		frameSize: string;
		name: string;
		basePrice: number;
	}>;
	/** Selisih harga dibanding paket sekarang, per packageId. */
	currentBasePrice: number;
};

export async function getDesignApprovalContext(
	eventId: string,
): Promise<{ error?: string; context?: DesignApprovalContext }> {
	try {
		await requireOwnerLevel();
		const supabase = await createClient();
		const { data: ev, error } = await supabase
			.from("events")
			.select(
				`id, project_id, client_name, event_date, frame_size, service_type,
				 base_price, pending_package_hours,
				 package:packages(id, name, frame_size, duration_hours, base_price)`,
			)
			.eq("id", eventId)
			.maybeSingle();
		if (error) return { error: error.message };
		if (!ev) return { error: "Event tidak ditemukan." };

		// Embed to-one PostgREST: objek, BUKAN array (lihat catatan di
		// reference PostgREST embed) — jangan pernah dibaca dengan [0].
		const pkg = (Array.isArray(ev.package) ? ev.package[0] : ev.package) as {
			id: string;
			name: string;
			frame_size: string;
			duration_hours: number;
			base_price: number;
		} | null;

		const durationHours =
			pkg?.duration_hours ?? ev.pending_package_hours ?? null;
		const frameIrrelevant = pkg ? pkg.frame_size === FRAME_AGNOSTIC : false;

		let alternatives: DesignApprovalContext["alternatives"] = [];
		if (durationHours && !frameIrrelevant) {
			const { data: alts } = await supabase
				.from("packages")
				.select("id, name, frame_size, base_price")
				.eq("category", ev.service_type)
				.eq("duration_hours", durationHours)
				.neq("frame_size", FRAME_AGNOSTIC)
				.eq("is_active", true)
				.is("deleted_at", null)
				.order("frame_size", { ascending: true });
			alternatives = (alts ?? []).map((a) => ({
				packageId: a.id as string,
				frameSize: a.frame_size as string,
				name: a.name as string,
				basePrice: Number(a.base_price),
			}));
		}

		return {
			context: {
				eventId: ev.id as string,
				projectId: ev.project_id as string,
				clientName: ev.client_name as string,
				eventDate: ev.event_date as string,
				frameSize: (ev.frame_size as string | null) ?? null,
				packageName: pkg?.name ?? null,
				durationHours,
				frameIrrelevant,
				alternatives,
				currentBasePrice: Number(ev.base_price ?? 0),
			},
		};
	} catch (err) {
		return {
			error: err instanceof Error ? err.message : "Gagal membaca data event.",
		};
	}
}

/**
 * ACC desain. `designFrameSize` = ukuran file yang dibuat desainer.
 *
 * Kalau ukuran itu berbeda dengan pesanan (atau pesanannya sendiri masih
 * menyusul), ACC hanya lolos bila desainer sekaligus mengoreksi eventnya lewat
 * `correction` — paket & frame size event ditulis ulang, harga dihitung ulang,
 * dan grup Telegram diberi tahu apa yang berubah.
 */
export async function approveDesign(
	eventId: string,
	projectId: string,
	designFrameSize: string,
	correction?: { frameSize: string; packageId: string | null },
): Promise<{ error?: string }> {
	try {
		const me = await requireOwnerLevel();
		const supabase = await createClient();

		const { data: ev, error: evErr } = await supabase
			.from("events")
			.select(
				`id, project_id, client_name, frame_size, service_type, base_price,
				 addons_total, discount_amount, gross_up_pph_amount, grand_total,
				 pending_package_hours, design_brief_at, is_migrated_legacy,
				 total_paid, vendor_commission_mode, vendor_commission_value_type,
				 vendor_commission_value, vendor_commission_amount,
				 package:packages(id, name, frame_size, duration_hours, base_price)`,
			)
			.eq("id", eventId)
			.maybeSingle();
		if (evErr) return { error: evErr.message };
		if (!ev) return { error: "Event tidak ditemukan." };

		const pkg = (Array.isArray(ev.package) ? ev.package[0] : ev.package) as {
			id: string;
			name: string;
			frame_size: string;
			duration_hours: number;
			base_price: number;
		} | null;
		const frameIrrelevant = pkg ? pkg.frame_size === FRAME_AGNOSTIC : false;

		if (
			!frameIrrelevant &&
			!["2R", "4R", "polaroid"].includes(designFrameSize)
		) {
			return { error: "Pilih dulu ukuran desain yang kamu buat." };
		}

		const changeLines: string[] = [];
		let effectiveFrame = (ev.frame_size as string | null) ?? null;

		if (correction) {
			// Koreksi di tempat — desainer juga owner, jadi boleh membetulkan
			// pesanan tanpa pindah halaman. Paket wajib cocok dengan ukurannya.
			const newFrame = correction.frameSize;
			if (!["2R", "4R", "polaroid"].includes(newFrame)) {
				return { error: "Ukuran koreksi tidak valid." };
			}
			let newPkg: {
				id: string;
				name: string;
				frame_size: string;
				base_price: number;
			} | null = null;
			if (correction.packageId) {
				const { data: p } = await supabase
					.from("packages")
					.select("id, name, frame_size, base_price")
					.eq("id", correction.packageId)
					.maybeSingle();
				if (!p) return { error: "Paket koreksi tidak ditemukan." };
				if (!packageFitsFrame(p.frame_size as string, newFrame)) {
					return {
						error: `Paket "${p.name}" bukan ukuran ${newFrame}. Pilih paket yang ukurannya sama.`,
					};
				}
				newPkg = {
					id: p.id as string,
					name: p.name as string,
					frame_size: p.frame_size as string,
					base_price: Number(p.base_price),
				};
			}

			// Harga: ikut paket baru HANYA kalau harga lama memang harga paket
			// lama (owner belum menimpa manual). Kalau sudah ditimpa, angkanya
			// milik kesepakatan dengan klien — jangan diam-diam ditulis ulang.
			const oldBase = Number(ev.base_price ?? 0);
			const ownerOverrode = pkg ? oldBase !== Number(pkg.base_price) : false;
			const newBase = newPkg && !ownerOverrode ? newPkg.base_price : oldBase;

			const addonsTotal = Number(ev.addons_total ?? 0);
			const discount = Number(ev.discount_amount ?? 0);
			const grossUp = Number(ev.gross_up_pph_amount ?? 0);
			const newGrandTotal = Math.max(
				0,
				newBase + addonsTotal - discount + grossUp,
			);
			// Komisi vendor persen ikut basis yang berubah — sama rumusnya dengan
			// jalur booking (upfront_cut% dari base price, commission% dari grand).
			const vMode = ev.vendor_commission_mode as string | null;
			const vType = ev.vendor_commission_value_type as string | null;
			const vValue = Number(ev.vendor_commission_value ?? 0);
			const commissionPatch: Record<string, unknown> = {};
			let commissionAmount = Number(ev.vendor_commission_amount ?? 0);
			if (vMode && vType === "percent") {
				commissionAmount =
					vMode === "upfront_cut"
						? Math.round((newBase * vValue) / 100)
						: Math.round((newGrandTotal * vValue) / 100);
				commissionPatch.vendor_commission_amount = commissionAmount;
			}

			// Tagihan efektif = grand total − potongan langsung vendor, persis
			// seperti jalur edit booking (buildEventPayload). Dihitung di sini,
			// bukan lewat RPC, supaya tidak bergantung pada hak EXECUTE tambahan
			// untuk sesi owner biasa.
			const billable = Math.max(
				0,
				newGrandTotal - (vMode === "upfront_cut" ? commissionAmount : 0),
			);
			const totalPaid = Number(ev.total_paid ?? 0);

			const { error: upErr } = await supabase
				.from("events")
				.update({
					frame_size: newFrame,
					package_id: newPkg?.id ?? null,
					pending_package_hours: null,
					custom_package_name: newPkg ? null : undefined,
					custom_package_price: newPkg ? null : newBase,
					base_price: newBase,
					grand_total: newGrandTotal,
					remaining_balance: Math.max(0, billable - totalPaid),
					...commissionPatch,
					updated_at: new Date().toISOString(),
				})
				.eq("id", eventId);
			if (upErr) return { error: upErr.message };

			if ((ev.frame_size ?? null) !== newFrame) {
				changeLines.push(
					`📐 Frame: ${ev.frame_size ?? "menyusul"} → <b>${newFrame}</b>`,
				);
			}
			if ((pkg?.id ?? null) !== (newPkg?.id ?? null)) {
				changeLines.push(
					`📦 Paket: ${tgEscape(pkg?.name ?? (ev.pending_package_hours ? `${ev.pending_package_hours} jam · ukuran menyusul` : "Custom"))} → <b>${tgEscape(newPkg?.name ?? "Custom")}</b>`,
				);
			}
			if (Number(ev.grand_total ?? 0) !== newGrandTotal) {
				changeLines.push(
					`💰 Total: ${rp(Number(ev.grand_total ?? 0))} → <b>${rp(newGrandTotal)}</b>`,
				);
			}
			effectiveFrame = newFrame;
		}

		// Gerbangnya: ukuran desain HARUS sama dengan pesanan.
		if (!frameIrrelevant) {
			if (!effectiveFrame) {
				return {
					error:
						"Ukuran event masih menyusul — tentukan dulu ukurannya (bisa langsung dari dialog ini) sebelum desain di-ACC.",
				};
			}
			if (effectiveFrame !== designFrameSize) {
				return {
					error: `Desain ${designFrameSize} ≠ pesanan ${effectiveFrame}. Perbaiki desainnya, atau betulkan pesanan lewat pilihan koreksi di dialog ini.`,
				};
			}
		}

		const now = new Date().toISOString();
		const { error } = await supabase
			.from("events")
			.update({
				design_status: "approved",
				design_approved_at: now,
				design_approved_by: me.profile.id,
				design_frame_size: frameIrrelevant ? FRAME_AGNOSTIC : designFrameSize,
				...(ev.design_brief_at ? {} : { design_brief_at: now }),
				updated_at: now,
			})
			.eq("id", eventId);
		if (error) return { error: error.message };

		// Kabari grup: koreksi pesanan dulu (kalau ada), lalu ACC-nya.
		if (changeLines.length > 0 && !ev.is_migrated_legacy) {
			await notifyTelegramEventUpdated(eventId, [
				"🎨 Dikoreksi saat ACC desain:",
				...changeLines,
			]);
		}
		await notifyTelegramDesignApproved(
			eventId,
			frameIrrelevant ? null : designFrameSize,
			me.profile.full_name ?? "Desainer",
		);

		revalidatePath(`/operations/${projectId}`);
		revalidatePath(`/design/${projectId}`);
		revalidatePath("/design");
		revalidatePath("/operations");
		return {};
	} catch (err) {
		return {
			error: err instanceof Error ? err.message : "Gagal meng-ACC desain.",
		};
	}
}
