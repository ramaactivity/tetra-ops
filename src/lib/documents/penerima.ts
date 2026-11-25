import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { penerimaKelengkapan } from "@/lib/events/penerima";
import { formatPhoneLocal } from "@/lib/format";
import { phoneTail } from "@/lib/portal/vendor-signup-core";
import { isLikelyWaPhone, toWaPhone } from "@/lib/whatsapp";

/**
 * Ke nomor mana dokumen dikirim (owner 25 Nov 2026): nota lunas Shella
 * terkirim ke WO/pemesan (nomor tersalin di dokumen) padahal yang mengirim
 * bukti transfer Shella. Satu sumber untuk dialog kirim di app, kartu
 * "Perlu persetujuan", kartu Telegram, dan pratinjau agent.
 */
export type PilihanPenerima = {
	nomor: string;
	nama: string | null;
	/** Peran: WO/EO · Pemesan · Klien · PIC lapangan · Pengirim bukti · Nomor di dokumen. */
	label: string;
};

export type InfoPenerima = {
	/** Tujuan bawaan saat tombol kirim ditekan. */
	tujuan: PilihanPenerima | null;
	pilihan: PilihanPenerima[];
	/** Tujuan bukan nomor klien di event (atau WO untuk event lewat vendor). */
	peringatan: string | null;
	/** Nomor di dokumen ≠ nomor klien event → tawarkan "Samakan nomor". */
	nomorDokumenBeda: {
		lama: string;
		baru: string;
		namaBaru: string | null;
	} | null;
};

const wa = (n: string | null | undefined): string | null =>
	isLikelyWaPhone(n) ? toWaPhone(n as string) : null;
const sama = (a: string | null | undefined, b: string | null | undefined) =>
	Boolean(a && b) && phoneTail(a) === phoneTail(b);

export const teksPenerima = (p: PilihanPenerima) =>
	`${p.nama ? `${p.nama} · ` : ""}${formatPhoneLocal(p.nomor)} (${p.label})`;

/**
 * `nomorPermintaan` = nomor yang disimpan permintaan kirim (mis. pengirim
 * bukti transfer). Tanpa itu, bawaan = nomor di dokumen (perilaku lama).
 */
export async function infoPenerima(
	supabase: SupabaseClient,
	documentId: string,
	nomorPermintaan?: string | null,
): Promise<InfoPenerima> {
	const { data: doc } = await supabase
		.from("documents")
		.select("client, event_id")
		.eq("id", documentId)
		.maybeSingle();
	const client = (doc?.client ?? {}) as { name?: string; phone?: string };
	const { data: ev } = doc?.event_id
		? await supabase
				.from("events")
				.select(
					"channel, client_name, client_wa, vendor_name, vendor_pic_name, vendor_contact, pic_name, pic_wa, booker_contact:contacts!events_booker_contact_id_fkey(name, phone), pic_contact:contacts!events_pic_contact_id_fkey(name, phone)",
				)
				.eq("id", doc.event_id as string)
				.maybeSingle()
		: { data: null };

	const pilihan: PilihanPenerima[] = ev
		? penerimaKelengkapan(ev as Parameters<typeof penerimaKelengkapan>[0]).map(
				(p) => ({ nomor: p.nomor, nama: p.nama, label: p.label }),
			)
		: [];
	const tambah = (p: PilihanPenerima) => {
		const ada = pilihan.find((x) => sama(x.nomor, p.nomor));
		if (ada) {
			if (!ada.label.includes(p.label)) ada.label = `${ada.label} · ${p.label}`;
			return;
		}
		pilihan.push(p);
	};
	const nomorDoc = wa(client.phone);
	const nomorReq = wa(nomorPermintaan);
	if (nomorReq)
		tambah({ nomor: nomorReq, nama: null, label: "pengirim bukti" });
	if (nomorDoc)
		tambah({
			nomor: nomorDoc,
			nama: client.name ?? null,
			label: "nomor di dokumen",
		});

	const tujuanNomor = nomorReq ?? nomorDoc ?? wa(ev?.client_wa as string);
	const tujuan = tujuanNomor
		? (pilihan.find((p) => sama(p.nomor, tujuanNomor)) ?? null)
		: null;

	const nomorKlien = wa(ev?.client_wa as string | null);
	const klien = pilihan.find((p) => sama(p.nomor, nomorKlien));
	const bolehWo =
		ev?.channel === "vendor" &&
		sama(tujuan?.nomor, ev?.vendor_contact as string | null);
	const peringatan =
		tujuan && nomorKlien && !sama(tujuan.nomor, nomorKlien) && !bolehWo
			? `Nomor tujuan bukan nomor klien di event${klien ? ` (${teksPenerima(klien)})` : ""}.`
			: !tujuan
				? "Nomor WA tujuan belum ada — isi nomor dulu."
				: null;
	return {
		tujuan,
		pilihan,
		peringatan,
		nomorDokumenBeda:
			nomorDoc && nomorKlien && !sama(nomorDoc, nomorKlien)
				? {
						lama: nomorDoc,
						baru: nomorKlien,
						namaBaru: (ev?.client_name as string | null) ?? null,
					}
				: null,
	};
}

/** Nomor permintaan kirim yang masih terbuka untuk dokumen ini (kalau ada). */
export async function nomorPermintaanTerbuka(
	supabase: SupabaseClient,
	documentId: string,
): Promise<string | null> {
	const { data } = await supabase
		.from("doc_send_requests")
		.select("nomor")
		.is("handled_at", null)
		.contains("document_ids", [documentId])
		.order("created_at", { ascending: false })
		.limit(1)
		.maybeSingle();
	return (data?.nomor as string | null) ?? null;
}
