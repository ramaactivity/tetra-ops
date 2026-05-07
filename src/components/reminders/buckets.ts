export type ReminderBucket =
	| "h3_pelunasan"
	| "h7_dp"
	| "h1_konfirmasi"
	| "overdue";

export const BUCKET_LABELS: Record<ReminderBucket, string> = {
	h3_pelunasan: "H-3 Pelunasan",
	h7_dp: "H-7 belum DP",
	h1_konfirmasi: "H-1 Konfirmasi",
	overdue: "Overdue invoice",
};

export const BUCKET_DESCRIPTIONS: Record<ReminderBucket, string> = {
	h3_pelunasan: "Event 3 hari lagi, sisa pembayaran belum lunas",
	h7_dp: "Event 7 hari lagi, DP belum masuk",
	h1_konfirmasi: "Event besok, konfirmasi setup time + crew",
	overdue: "Event sudah lewat, masih ada outstanding",
};

export const BUCKET_TEMPLATE_HINT: Record<ReminderBucket, string> = {
	h3_pelunasan: "reminder_pelunasan",
	h7_dp: "reminder_dp",
	h1_konfirmasi: "konfirmasi_h_minus_1",
	overdue: "reminder_overdue",
};
