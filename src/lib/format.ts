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

export const ADDON_CATEGORY_LABELS: Record<string, string> = {
	voucher: "Voucher",
	print_extras: "Print Extras",
	time_extras: "Time Extras",
	experience: "Experience",
	costume: "Costume",
};

export const ITEM_CATEGORY_LABELS: Record<string, string> = {
	consumable: "Consumable",
	equipment: "Equipment",
};

export const EQUIPMENT_CONDITION_LABELS: Record<string, string> = {
	normal: "Normal",
	service: "Service",
	damaged: "Damaged",
	lost: "Lost",
};

export const EQUIPMENT_LOCATION_LABELS: Record<string, string> = {
	gudang_pusat: "Gudang",
	event: "On Event",
	service_center: "Service Center",
	crew_carry: "Crew Carry",
	lost: "Lost",
};

export const USER_ROLE_LABELS: Record<string, string> = {
	super_admin: "Super Admin",
	owner: "Owner",
	crew: "Crew",
	pending_approval: "Pending",
};

export function formatDateID(iso: string): string {
	return new Date(iso).toLocaleDateString("id-ID", {
		day: "numeric",
		month: "short",
		year: "numeric",
	});
}

export const CHANNEL_TYPE_LABELS: Record<string, string> = {
	direct: "Direct",
	vendor: "Vendor",
	relasi: "Relasi",
};

export const EVENT_STATUS_LABELS: Record<string, string> = {
	draft: "Draft",
	confirmed: "Confirmed",
	design_brief: "Design Brief",
	design_approved: "Design Approved",
	upcoming: "Upcoming",
	in_progress: "In Progress",
	awaiting_settlement: "Awaiting Settlement",
	completed: "Completed",
	cancelled: "Cancelled",
	archived: "Archived",
};

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
	unpaid: "Unpaid",
	partial: "Partial",
	dp: "DP",
	paid: "Lunas",
	overpaid: "Overpaid",
	overdue: "Overdue",
};
