"use server";

import { getCurrentUser } from "@/lib/auth/get-user";
import { listMissingFields } from "@/lib/events/tbc";
import { dispatchPushToMany, isVapidConfigured } from "@/lib/push/web-push";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Crew menekan "Ingatkan owner" saat data event masih TBC.
 *
 * Kenapa perlu, padahal sudah ada reminder H-7/H-3: reminder itu otomatis dan
 * terjadwal, sementara crew-lah yang paling dulu sadar kalau ada yang janggal
 * ("besok saya ke mana?"). Ini menutup celah antara dua reminder terjadwal, dan
 * kalau owner kadung lupa follow-up ke klien, crew punya cara mengingatkan yang
 * tercatat — bukan chat pribadi yang hilang di grup.
 *
 * RLS tabel notifications self-only (user_id = auth.uid()), jadi menulis baris
 * untuk owner harus lewat service-role admin client — pola sama dengan
 * rekap-notifications.ts.
 */

/** Jeda minimum antar-ingatan untuk event yang sama, dari crew mana pun. */
const COOLDOWN_HOURS = 12;

export async function remindOwnerIncompleteData(
	projectId: string,
): Promise<{ ok: true; missing: string[] } | { ok: false; error: string }> {
	try {
		const me = await getCurrentUser();
		if (!me) return { ok: false, error: "Sesi habis — login ulang." };

		const admin = createAdminClient();

		const { data: event } = await admin
			.from("events")
			.select(
				`id, project_id, client_name, event_date, event_date_is_estimate,
				 venue_name, start_time, frame_size, backdrop_id, pic_name, pic_wa`,
			)
			.eq("project_id", projectId)
			.maybeSingle();
		if (!event) return { ok: false, error: "Event tidak ditemukan." };

		// Crew hanya boleh mengingatkan event yang dia kerjakan. Owner boleh juga
		// (mis. mengetes), tapi crew lain tidak bisa memancing notifikasi acak.
		const isOwnerLevel =
			me.profile.role === "owner" || me.profile.role === "super_admin";
		if (!isOwnerLevel) {
			const { data: assigned } = await admin
				.from("crew_assignments")
				.select("id")
				.eq("event_id", event.id as string)
				.eq("user_id", me.profile.id)
				.maybeSingle();
			if (!assigned) {
				return { ok: false, error: "Kamu tidak ditugaskan di event ini." };
			}
		}

		const missing = listMissingFields(event);
		if (missing.length === 0) {
			return { ok: false, error: "Data event ini sudah lengkap." };
		}

		// Anti-spam: satu ingatan per event per COOLDOWN_HOURS jam. Tanpa ini,
		// tiap crew di satu event bisa mengirim beruntun dan owner belajar
		// mengabaikan notifikasinya — reminder yang berisik = reminder mati.
		const since = new Date(
			Date.now() - COOLDOWN_HOURS * 60 * 60 * 1000,
		).toISOString();
		const { data: recent } = await admin
			.from("notifications")
			.select("id")
			.eq("entity_type", "event_tbc_nudge")
			.eq("entity_id", event.id as string)
			.gte("created_at", since)
			.limit(1);
		if (recent && recent.length > 0) {
			return {
				ok: false,
				error: `Owner sudah diingatkan untuk event ini dalam ${COOLDOWN_HOURS} jam terakhir.`,
			};
		}

		const { data: owners } = await admin
			.from("users")
			.select("id, role")
			.eq("is_active", true)
			.is("deleted_at", null);
		const ownerIds = (owners ?? [])
			.filter((u) => u.role === "owner" || u.role === "super_admin")
			.map((u) => u.id as string);
		if (ownerIds.length === 0) {
			return { ok: false, error: "Tidak ada owner aktif untuk diingatkan." };
		}

		const title = `Data belum lengkap: ${event.client_name}`;
		const body = `${me.profile.full_name ?? "Crew"} menanyakan: ${missing.join(", ")}. Tap untuk lengkapi.`;
		const actionUrl = `/operations/${event.project_id}/edit`;

		const { error: insErr } = await admin.from("notifications").insert(
			ownerIds.map((user_id) => ({
				user_id,
				severity: "warning",
				category: "operational",
				title,
				body,
				entity_type: "event_tbc_nudge",
				entity_id: event.id as string,
				action_url: actionUrl,
			})),
		);
		if (insErr) return { ok: false, error: insErr.message };

		// Push best-effort — inbox notifikasi sudah tertulis di atas, jadi
		// kegagalan push tidak boleh menggagalkan aksinya.
		if (isVapidConfigured()) {
			try {
				const { data: subs } = await admin
					.from("push_subscriptions")
					.select("id, endpoint, p256dh_key, auth_key")
					.in("user_id", ownerIds)
					.eq("is_active", true);
				if (subs && subs.length > 0) {
					await dispatchPushToMany(
						subs.map((s) => ({
							id: s.id as string,
							endpoint: s.endpoint as string,
							p256dh_key: s.p256dh_key as string,
							auth_key: s.auth_key as string,
						})),
						{
							title,
							body,
							url: actionUrl,
							tag: `tbc-nudge-${event.id}`,
							severity: "warning",
						},
					);
				}
			} catch (e) {
				console.error("[nudge-owner] push gagal:", e);
			}
		}

		return { ok: true, missing };
	} catch (err) {
		console.error("[nudge-owner] unexpected:", err);
		return {
			ok: false,
			error: err instanceof Error ? err.message : "Gagal mengirim ingatan",
		};
	}
}
