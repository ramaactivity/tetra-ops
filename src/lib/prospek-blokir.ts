import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { phoneTail } from "@/lib/portal/vendor-signup-core";
import { labelBlokir, PROSPEK_BLOKIR } from "@/lib/prospek";
import { fetchAllRows } from "@/lib/supabase/fetch-all";

/**
 * Nomor prospek yang tidak boleh dihubungi lagi (tolak / jangan_hubungi /
 * berhenti), kunci = 9 digit terakhir. Satu sumber untuk tombol Follow-up,
 * send-followup, Klien lama, dan tool MCP. Gagal baca = THROW (jangan sampai
 * daftar blokir kosong diam-diam lalu orang yang minta berhenti dihubungi).
 */
export type Blokir = { nama: string; status: string; label: string };

export async function loadProspekBlokir(
	supabase: SupabaseClient,
): Promise<Map<string, Blokir>> {
	const rows = await fetchAllRows<{
		nama: string;
		telepon: string | null;
		status: string;
		alasan_berhenti: string | null;
	}>(
		(from, to) =>
			supabase
				.from("prospek")
				.select("nama, telepon, status, alasan_berhenti")
				.in("status", [...PROSPEK_BLOKIR])
				.not("telepon", "is", null)
				.order("id")
				.range(from, to),
		"prospek blokir",
	);
	const out = new Map<string, Blokir>();
	for (const r of rows) {
		const t = phoneTail(r.telepon);
		if (t.length !== 9) continue;
		out.set(t, {
			nama: r.nama,
			status: r.status,
			label: labelBlokir(r.status, r.alasan_berhenti),
		});
	}
	return out;
}

/** Satu nomor: diblokir? (null = boleh dihubungi). */
export async function blokirNomor(
	supabase: SupabaseClient,
	nomor: string | null | undefined,
): Promise<Blokir | null> {
	const t = phoneTail(nomor);
	if (t.length !== 9) return null;
	return (await loadProspekBlokir(supabase)).get(t) ?? null;
}
