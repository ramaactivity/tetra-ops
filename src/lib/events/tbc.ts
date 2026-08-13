/**
 * Satu sumber kebenaran untuk "data event apa yang masih TBC".
 *
 * Dipakai bertiga: reminder H-7/H-3 ke owner (tbc-reminder.ts), tampilan di
 * aplikasi crew, dan tombol "Ingatkan owner" yang ditekan crew. Kalau daftarnya
 * dipisah-pisah, ketiganya akan pelan-pelan melenceng — crew melihat sesuatu
 * masih kosong padahal reminder owner sudah menganggapnya lengkap.
 *
 * Modul polos (bukan "use server") supaya bisa diimpor server maupun client.
 */

export type TbcSnapshot = {
	/** true = tanggal sudah terisi tapi masih perkiraan (klien belum memastikan). */
	event_date_is_estimate?: boolean | null;
	venue_name?: string | null;
	start_time?: string | null;
	frame_size?: string | null;
	backdrop_id?: string | null;
	pic_name?: string | null;
	pic_wa?: string | null;
	/**
	 * PIC yang dipilih dari buku kontak. Wajib ikut diperiksa: sejak booking
	 * form memakai contact picker, PIC sering hanya tersimpan sebagai relasi —
	 * kolom pic_name/pic_wa tetap kosong. Tanpa ini, event yang PIC-nya sudah
	 * jelas tetap dituduh "PIC lapangan belum ada" tiap hari.
	 */
	pic_contact_id?: string | null;
	/**
	 * Durasi paket yang sudah disepakati sementara ukurannya belum (lihat
	 * lib/events/frame-package.ts). Terisi = paket event belum final.
	 */
	pending_package_hours?: number | null;
	/**
	 * Ukuran paket yang terpilih ("none" = paket memang tanpa cetak frame).
	 * Dipakai supaya event Videobooth/Photo Stage tidak dituduh kurang frame
	 * size — paketnya memang tidak punya ukuran.
	 */
	package_frame_size?: string | null;
};

/**
 * Daftar hal yang belum pasti, dalam bahasa yang dimengerti owner & crew.
 * Urutannya sengaja: yang paling menghambat kerja lapangan lebih dulu.
 */
export function listMissingFields(ev: TbcSnapshot): string[] {
	const missing: string[] = [];
	// Tanggal duluan — kalau tanggalnya sendiri masih perkiraan, semua jadwal
	// turunannya ikut goyah (termasuk hitungan H-7/H-3 ini sendiri).
	if (ev.event_date_is_estimate) missing.push("tanggal (masih perkiraan)");
	if (!ev.venue_name) missing.push("lokasi");
	if (!ev.start_time) missing.push("jam mulai");
	if (!ev.pic_name && !ev.pic_wa && !ev.pic_contact_id) {
		missing.push("PIC lapangan");
	}
	// Paket tanpa cetak frame (Videobooth 360, Photo Stage) memang tidak punya
	// ukuran — menuntutnya cuma bikin alarm palsu tiap hari.
	const frameIrrelevant = ev.package_frame_size === "none";
	if (!ev.frame_size && !frameIrrelevant) {
		// Kalau durasinya sudah disepakati, sebut apa yang kurang persisnya:
		// paketnya belum final HANYA karena ukurannya belum dipastikan.
		missing.push(
			ev.pending_package_hours
				? `frame size — paket masih ${ev.pending_package_hours} jam tanpa ukuran`
				: "frame size",
		);
	} else if (ev.pending_package_hours) {
		// Ukuran sudah pasti tapi paket sementara belum ditukar jadi paket
		// konkret (mis. data lama). Jangan diam — harga & HPP ikut paket.
		missing.push("paket final (ukuran sudah pasti, paket belum dikunci)");
	}
	if (!ev.backdrop_id) missing.push("backdrop");
	return missing;
}

/** Ada yang belum pasti? */
export function hasTbc(ev: TbcSnapshot): boolean {
	return listMissingFields(ev).length > 0;
}
