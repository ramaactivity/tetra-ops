"use server";

import { nomorTim } from "@/lib/ai/tools/tim";
import { getCurrentUser } from "@/lib/auth/get-user";
import {
	FOLLOWUP_JEDA_JAM,
	type FollowupState,
	type FollowupStatus,
} from "@/lib/leads/followup-types";
import { createClient } from "@/lib/supabase/server";
import { isLikelyWaPhone, toWaPhone } from "@/lib/whatsapp";

/**
 * Follow-up sekali klik dari /leads (spek Hermes SPEC-LEADS-HERMES §4).
 * Tetra Ops tidak menulis kalimat ke klien: draf ditulis agent Hermes cs-wa
 * lewat bot (`followup-draf`), owner memeriksa/mengubah, lalu Kirim
 * (`send-followup`) = izin untuk pesan itu saja.
 */

type Db = Awaited<ReturnType<typeof createClient>>;

async function requireOwner() {
	const me = await getCurrentUser();
	if (!me) throw new Error("Tidak terautentikasi");
	if (me.profile.role !== "owner" && me.profile.role !== "super_admin")
		throw new Error("Hanya owner yang boleh meminta follow-up");
	return me;
}

const toState = (r: {
	id: string;
	status: string;
	draf: string | null;
	pesan: string | null;
	hasil: string | null;
	created_at: string;
	updated_at: string;
}): FollowupState => ({
	id: r.id,
	status: r.status as FollowupStatus,
	draf: r.draf,
	pesan: r.pesan,
	hasil: r.hasil,
	createdAt: r.created_at,
	updatedAt: r.updated_at,
});

const KOLOM = "id, status, draf, pesan, hasil, created_at, updated_at";

export async function mintaFollowup(input: {
	jid: string | null;
	nomor: string;
	alasan: string;
	konteks?: string | null;
}): Promise<{ ok: true; state: FollowupState } | { ok: false; error: string }> {
	try {
		const me = await requireOwner();
		if (!isLikelyWaPhone(input.nomor))
			return { ok: false, error: "Nomor WA kontak ini tidak valid" };
		const nomor = toWaPhone(input.nomor);
		if (!nomor.startsWith("628"))
			return { ok: false, error: "Nomor ini bukan nomor HP (628…)" };
		const alasan = input.alasan.trim().slice(0, 300);
		if (!alasan) return { ok: false, error: "Alasan follow-up kosong" };
		const supabase = await createClient();

		// Permintaan yang masih berjalan → lanjutkan, jangan bikin dobel.
		const { data: open } = await supabase
			.from("followup_requests")
			.select(KOLOM)
			.eq("nomor", nomor)
			.in("status", ["menunggu_draf", "draf", "mengirim"])
			.order("created_at", { ascending: false })
			.limit(1)
			.maybeSingle();
		if (open) return { ok: true, state: toState(open) };

		const since = new Date(
			Date.now() - FOLLOWUP_JEDA_JAM * 3_600_000,
		).toISOString();
		const { data: recent } = await supabase
			.from("followup_requests")
			.select("updated_at")
			.eq("nomor", nomor)
			.eq("status", "terkirim")
			.gte("updated_at", since)
			.limit(1)
			.maybeSingle();
		if (recent)
			return {
				ok: false,
				error: `Kontak ini sudah di-follow-up dalam ${FOLLOWUP_JEDA_JAM} jam terakhir`,
			};

		if ((await nomorTim(supabase)).some((t) => toWaPhone(t.nomor) === nomor))
			return { ok: false, error: "Ini nomor tim Tetra, bukan klien" };
		const { data: blokir, error: blokirErr } = await supabase
			.from("prospek")
			.select("nama, telepon")
			.in("status", ["tolak", "jangan_hubungi"])
			.not("telepon", "is", null);
		if (blokirErr) return { ok: false, error: blokirErr.message };
		const b = (blokir ?? []).find(
			(p) => isLikelyWaPhone(p.telepon) && toWaPhone(p.telepon) === nomor,
		);
		if (b)
			return {
				ok: false,
				error: `${b.nama} minta tidak dihubungi lagi — tidak di-follow-up`,
			};

		const { data: cmd, error: cmdErr } = await supabase
			.from("bot_commands")
			.insert({
				command: `followup-draf:${JSON.stringify({
					jid: input.jid,
					nomor,
					alasan,
					konteks: input.konteks?.trim().slice(0, 800) || null,
				})}`,
				status: "pending",
			})
			.select("id")
			.single();
		if (cmdErr) return { ok: false, error: `Gagal ke bot: ${cmdErr.message}` };
		const { data: row, error } = await supabase
			.from("followup_requests")
			.insert({
				wa_jid: input.jid,
				nomor,
				alasan,
				command_id: cmd.id,
				dibuat_oleh: me.profile.id,
			})
			.select(KOLOM)
			.single();
		if (error) return { ok: false, error: error.message };
		return { ok: true, state: toState(row) };
	} catch (e) {
		return { ok: false, error: e instanceof Error ? e.message : String(e) };
	}
}

/** Baca hasil perintah bot dan majukan status permintaan. */
async function sync(supabase: Db, id: string): Promise<FollowupState | null> {
	const { data: r } = await supabase
		.from("followup_requests")
		.select(`${KOLOM}, command_id, send_command_id`)
		.eq("id", id)
		.maybeSingle();
	if (!r) return null;
	const cmdId =
		r.status === "menunggu_draf"
			? r.command_id
			: r.status === "mengirim"
				? r.send_command_id
				: null;
	if (!cmdId) return toState(r);
	const { data: cmd } = await supabase
		.from("bot_commands")
		.select("status, result")
		.eq("id", cmdId)
		.maybeSingle();
	if (!cmd || cmd.status === "pending") return toState(r);
	const ok = cmd.status === "done";
	const patch =
		r.status === "menunggu_draf"
			? ok && cmd.result?.trim()
				? { status: "draf", draf: cmd.result.trim() }
				: { status: "gagal", hasil: cmd.result ?? "Hermes tidak membuat draf" }
			: { status: ok ? "terkirim" : "gagal", hasil: cmd.result };
	const { data: upd, error } = await supabase
		.from("followup_requests")
		.update({ ...patch, updated_at: new Date().toISOString() })
		.eq("id", id)
		.eq("status", r.status)
		.select(KOLOM)
		.maybeSingle();
	if (error) throw new Error(error.message);
	return upd ? toState(upd) : toState(r);
}

export async function cekFollowup(
	id: string,
): Promise<{ ok: true; state: FollowupState } | { ok: false; error: string }> {
	try {
		await requireOwner();
		const state = await sync(await createClient(), id);
		return state
			? { ok: true, state }
			: { ok: false, error: "Permintaan follow-up tidak ditemukan" };
	} catch (e) {
		return { ok: false, error: e instanceof Error ? e.message : String(e) };
	}
}

export async function kirimFollowup(
	id: string,
	pesan: string,
): Promise<{ ok: true; state: FollowupState } | { ok: false; error: string }> {
	try {
		await requireOwner();
		const teks = pesan.trim();
		if (teks.length < 10)
			return { ok: false, error: "Pesan terlalu pendek (min. 10 karakter)" };
		if (teks.length > 1500)
			return { ok: false, error: "Pesan terlalu panjang (maks. 1.500)" };
		const supabase = await createClient();
		// Kunci dulu (draf → mengirim) baru titip ke bot: klik ganda tidak
		// bisa menghasilkan dua pesan ke klien.
		const { data: claimed, error: claimErr } = await supabase
			.from("followup_requests")
			.update({
				status: "mengirim",
				pesan: teks,
				updated_at: new Date().toISOString(),
			})
			.eq("id", id)
			.eq("status", "draf")
			.select("nomor")
			.maybeSingle();
		if (claimErr) return { ok: false, error: claimErr.message };
		if (!claimed)
			return { ok: false, error: "Draf ini sudah dikirim atau dibatalkan" };
		const { data: cmd, error: cmdErr } = await supabase
			.from("bot_commands")
			.insert({
				command: `send-followup:${JSON.stringify({ nomor: claimed.nomor, pesan: teks })}`,
				status: "pending",
			})
			.select("id")
			.single();
		if (cmdErr) {
			await supabase
				.from("followup_requests")
				.update({ status: "draf", updated_at: new Date().toISOString() })
				.eq("id", id);
			return { ok: false, error: `Gagal ke bot: ${cmdErr.message}` };
		}
		const { data: upd, error } = await supabase
			.from("followup_requests")
			.update({ send_command_id: cmd.id })
			.eq("id", id)
			.select(KOLOM)
			.single();
		if (error) return { ok: false, error: error.message };
		return { ok: true, state: toState(upd) };
	} catch (e) {
		return { ok: false, error: e instanceof Error ? e.message : String(e) };
	}
}

export async function batalFollowup(
	id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
	try {
		await requireOwner();
		const supabase = await createClient();
		const { error } = await supabase
			.from("followup_requests")
			.update({ status: "batal", updated_at: new Date().toISOString() })
			.eq("id", id)
			.in("status", ["menunggu_draf", "draf"]);
		if (error) return { ok: false, error: error.message };
		return { ok: true };
	} catch (e) {
		return { ok: false, error: e instanceof Error ? e.message : String(e) };
	}
}
