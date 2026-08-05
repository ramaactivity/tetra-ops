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
	if (!ev.pic_name && !ev.pic_wa) missing.push("PIC lapangan");
	if (!ev.frame_size) missing.push("frame size");
	if (!ev.backdrop_id) missing.push("backdrop");
	return missing;
}

/** Ada yang belum pasti? */
export function hasTbc(ev: TbcSnapshot): boolean {
	return listMissingFields(ev).length > 0;
}
