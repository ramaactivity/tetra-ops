/**
 * Kesiapan settle (owner 24 Nov 2026): satu daftar yang menunjukkan apa yang
 * masih bikin angka settle salah atau perlu diputuskan owner — dihitung dari
 * rekap + event, tanpa DB (lihat halaman rekap owner).
 */

export type CekLevel = "ok" | "perlu" | "cek";

export type Cek = {
	key: string;
	level: CekLevel;
	judul: string;
	detail?: string;
	/** Tautan untuk membereskannya. */
	href?: string;
	aksi?: string;
};

export type KesiapanInput = {
	projectId: string;
	disetujui: boolean;
	/** crew_rekap.transport_method */
	transport: "online" | "rental" | "none" | null;
	/** events.transport_rental_cost (null/0 = belum diisi) */
	sewaMobil: number | null;
	crewCount: number;
	durasiJam: number | null;
	/** Biaya lapangan bernilai > 0 + ada notanya atau tidak. */
	biaya: ReadonlyArray<{ label: string; amount: number; nota: boolean }>;
	/** Uang jalan dilaporkan crew vs yang tercatat di buku. */
	ujDilapor: number;
	ujTercatat: number;
	sisaTagihan: number;
	/** Jam tambahan di lokasi yang dilaporkan crew & sudah/belum ditagihkan. */
	extendJam?: number;
	extendDitagih?: boolean;
};

const rp = (n: number) => `Rp${Math.round(n).toLocaleString("id-ID")}`;

export function cekKesiapan(i: KesiapanInput): Cek[] {
	const out: Cek[] = [];
	const eventHref = `/operations/${i.projectId}`;

	out.push(
		i.disetujui
			? { key: "rekap", level: "ok", judul: "Rekap sudah disetujui" }
			: {
					key: "rekap",
					level: "perlu",
					judul: "Rekap belum disetujui",
					detail: "Cek isinya, lalu Setujui rekap di bawah.",
				},
	);

	if (i.transport === "rental")
		out.push(
			(i.sewaMobil ?? 0) > 0
				? {
						key: "sewa",
						level: "ok",
						judul: `Sewa mobil tercatat ${rp(i.sewaMobil ?? 0)}`,
					}
				: {
						key: "sewa",
						level: "perlu",
						judul: "Crew pakai sewa mobil, biaya sewanya belum diisi",
						detail:
							"Kalau di-settle sekarang, biaya sewa tidak ikut dan untung event kelihatan lebih besar.",
						href: `${eventHref}#crew`,
						aksi: "Isi rencana transport",
					},
		);

	if (i.crewCount === 0)
		out.push({
			key: "crew",
			level: "perlu",
			judul: "Belum ada crew yang ditugaskan",
			href: `${eventHref}#crew`,
			aksi: "Atur crew",
		});
	else if (i.crewCount === 1)
		out.push({
			key: "crew",
			level: "cek",
			judul: `Cuma 1 crew bertugas${i.durasiJam ? ` untuk acara ${i.durasiJam} jam` : ""}`,
			detail:
				"Biasanya 2 crew. Pastikan memang sendirian dan fee-nya sudah sesuai durasi.",
			href: `${eventHref}#crew`,
			aksi: "Lihat crew",
		});
	else
		out.push({
			key: "crew",
			level: "ok",
			judul: `${i.crewCount} crew bertugas`,
		});

	const biaya = i.biaya.filter((b) => b.amount > 0);
	const tanpaNota = biaya.filter((b) => !b.nota);
	const totalBiaya = biaya.reduce((t, b) => t + b.amount, 0);
	if (biaya.length > 0)
		out.push(
			tanpaNota.length === 0
				? {
						key: "nota",
						level: "ok",
						judul: `Biaya lapangan ${rp(totalBiaya)}, semua ada notanya`,
					}
				: {
						key: "nota",
						level: "cek",
						judul: `${tanpaNota.length} dari ${biaya.length} biaya lapangan tanpa nota`,
						detail: tanpaNota
							.map((b) => `${b.label} ${rp(b.amount)}`)
							.join(" · "),
					},
		);

	if (i.ujDilapor > i.ujTercatat)
		out.push({
			key: "uj",
			level: "perlu",
			judul: `Uang jalan dilaporkan ${rp(i.ujDilapor)}, baru tercatat ${rp(i.ujTercatat)}`,
			detail: "Lengkapi di panel Uang jalan crew.",
		});

	if ((i.extendJam ?? 0) > 0)
		out.push(
			i.extendDitagih
				? {
						key: "extend",
						level: "ok",
						judul: `Tambahan ${i.extendJam} jam di lokasi sudah ditagihkan`,
					}
				: {
						key: "extend",
						level: "perlu",
						judul: `Crew lapor tambahan ${i.extendJam} jam di lokasi, belum ditagihkan`,
						detail:
							"Tambahkan ke tagihan klien di kartu Tambahan jam di bawah.",
					},
		);

	if (i.sisaTagihan > 0)
		out.push({
			key: "tagihan",
			level: "cek",
			judul: `Klien masih kurang bayar ${rp(i.sisaTagihan)}`,
			detail:
				"Settle tetap boleh — sisanya jadi piutang, pelunasan dicatat nanti.",
		});
	else out.push({ key: "tagihan", level: "ok", judul: "Tagihan klien lunas" });

	return out;
}
