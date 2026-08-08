/**
 * Aturan main "frame size ↔ paket" — SATU sumber kebenaran.
 *
 * Latar: 8 Agustus 2026 sebuah event tercatat frame size "menyusul" tapi
 * paketnya "2R Unlimited 2 Jam". Klien ternyata pesan 4R. Dua kolom di baris
 * yang sama saling bertentangan sejak booking dan tidak ada yang menabraknya —
 * ketahuan pas hari-H.
 *
 * Invariannya sekarang: sebuah event TIDAK BOLEH punya paket ber-ukuran
 * sementara ukurannya sendiri belum pasti. Kalau ukuran belum pasti, yang
 * disepakati cuma DURASI-nya (pending_package_hours) — dan itu aman karena di
 * pricelist harga hanya bergantung pada durasi, bukan ukuran.
 *
 * Modul polos (bukan "use server") supaya dipakai form booking (client),
 * validasi server, gate ACC desain, dan bot Telegram dengan definisi identik.
 */

/** Paket yang memang tidak mencetak frame (videobooth, photo stage, dsb). */
export const FRAME_AGNOSTIC = "none";

export type PackageLike = {
	id: string;
	name: string;
	category: string;
	frame_size: string;
	duration_hours: number;
	base_price: number;
};

/** Paket ini bertaruh pada ukuran cetak? ("none" = tidak butuh frame size) */
export function packageNeedsFrame(
	pkg: Pick<PackageLike, "frame_size">,
): boolean {
	return pkg.frame_size !== FRAME_AGNOSTIC;
}

/**
 * Paket boleh dipasang di event dengan frame size ini?
 * - paket frame-agnostic → selalu boleh
 * - frame event kosong (menyusul) → paket ber-ukuran TIDAK boleh
 * - selain itu harus sama persis
 */
export function packageFitsFrame(
	pkgFrameSize: string | null | undefined,
	eventFrameSize: string | null | undefined,
): boolean {
	if (!pkgFrameSize || pkgFrameSize === FRAME_AGNOSTIC) return true;
	if (!eventFrameSize) return false;
	return pkgFrameSize === eventFrameSize;
}

/**
 * Service type ini butuh frame size?
 *
 * Diturunkan dari katalog paket yang sedang berlaku: kalau semua paket di
 * kategori itu frame-agnostic, memaksa owner memilih ukuran cuma bikin alarm
 * TBC palsu (mis. Videobooth 360 tidak mencetak frame sama sekali).
 */
export function serviceNeedsFrame(
	packages: PackageLike[],
	serviceType: string | null | undefined,
): boolean {
	if (!serviceType) return true;
	const inService = packages.filter((p) => p.category === serviceType);
	if (inService.length === 0) return true; // katalog tak dikenal → tetap tanya
	return inService.some(packageNeedsFrame);
}

/**
 * Katalog yang sama, dilihat sebagai DURASI saja — dipakai saat frame size
 * masih menyusul. Satu baris per durasi, plus harga (dan penanda kalau
 * ternyata harga antar-ukuran berbeda, supaya angkanya tidak diam-diam salah).
 */
export type DurationOption = {
	hours: number;
	/** Harga terendah di durasi ini. */
	price: number;
	/** true = harga antar-ukuran di durasi ini TIDAK sama. */
	priceVaries: boolean;
	/** Ukuran yang tersedia di durasi ini, mis. ["2R","4R","polaroid"]. */
	frames: string[];
};

export function durationOptions(
	packages: PackageLike[],
	serviceType: string | null | undefined,
): DurationOption[] {
	const inService = packages.filter(
		(p) => !serviceType || p.category === serviceType,
	);
	const byHours = new Map<number, PackageLike[]>();
	for (const p of inService) {
		if (!packageNeedsFrame(p)) continue; // frame-agnostic dipilih langsung
		const list = byHours.get(p.duration_hours) ?? [];
		list.push(p);
		byHours.set(p.duration_hours, list);
	}
	return [...byHours.entries()]
		.map(([hours, list]) => {
			const prices = list.map((p) => p.base_price);
			return {
				hours,
				price: Math.min(...prices),
				priceVaries: new Set(prices).size > 1,
				frames: [...new Set(list.map((p) => p.frame_size))],
			};
		})
		.sort((a, b) => a.hours - b.hours);
}

/**
 * Paket konkret untuk kombinasi (service, durasi, ukuran) — dipakai saat
 * ukuran akhirnya dipastikan, untuk menukar "durasi sementara" jadi paket
 * betulan tanpa owner harus mencari ulang di dropdown.
 */
export function resolvePackage(
	packages: PackageLike[],
	serviceType: string | null | undefined,
	hours: number | null | undefined,
	frameSize: string | null | undefined,
): PackageLike | null {
	if (!hours || !frameSize) return null;
	return (
		packages.find(
			(p) =>
				(!serviceType || p.category === serviceType) &&
				p.duration_hours === hours &&
				p.frame_size === frameSize,
		) ?? null
	);
}

/**
 * Ganti ukuran saat paket sudah terpilih → paket padanannya di ukuran baru
 * (durasi & service dipertahankan). null = tidak ada padanan, paket harus
 * dilepas supaya event tidak kembali saling bertentangan.
 */
export function swapPackageFrame(
	packages: PackageLike[],
	currentPackageId: string,
	nextFrameSize: string | null,
): PackageLike | null {
	const cur = packages.find((p) => p.id === currentPackageId);
	if (!cur) return null;
	if (!packageNeedsFrame(cur)) return cur; // frame-agnostic → tidak terpengaruh
	if (!nextFrameSize) return null;
	return resolvePackage(
		packages,
		cur.category,
		cur.duration_hours,
		nextFrameSize,
	);
}

/** "2 Jam · ukuran menyusul" — label paket sementara di seluruh aplikasi. */
export function pendingPackageLabel(
	serviceLabel: string | null,
	hours: number,
): string {
	return `${serviceLabel ? `${serviceLabel} ` : ""}${hours} Jam · ukuran menyusul`;
}
