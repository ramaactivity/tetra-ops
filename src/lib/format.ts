const RP_FORMATTER = new Intl.NumberFormat("id-ID");

export function formatRupiah(amount: number): string {
	return `Rp ${RP_FORMATTER.format(amount)}`;
}

export const SERVICE_TYPE_LABELS: Record<string, string> = {
	photobooth_classic: "Photobooth Classic",
	videobooth_360: "Videobooth 360",
	magazine_combo: "Magazine Combo",
	magazine_box_only: "Magazine Box",
	photostage_only: "Photostage",
	photostage_combo: "Photostage Combo",
};

export const FRAME_SIZE_LABELS: Record<string, string> = {
	"2R": "2R",
	"4R": "4R",
	polaroid: "Polaroid",
	none: "—",
};
