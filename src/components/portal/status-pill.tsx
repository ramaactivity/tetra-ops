import type { PortalBooking } from "@/lib/portal/data";

const STATUS: Record<PortalBooking["status"], { label: string; bg: string }> = {
	draft: { label: "Menunggu DP", bg: "var(--peach)" },
	menunggu_konfirmasi: { label: "DP sedang dicek", bg: "var(--sky)" },
	resmi: { label: "Resmi", bg: "var(--mint-soft)" },
	kedaluwarsa: { label: "Kedaluwarsa", bg: "var(--neutral)" },
	batal: { label: "Batal", bg: "var(--coral)" },
};

export function StatusPill({ status }: { status: PortalBooking["status"] }) {
	const s = STATUS[status];
	return (
		<span className="pill" style={{ background: s.bg }}>
			{s.label}
		</span>
	);
}

export const dateLong = (iso: string) =>
	new Date(`${iso}T00:00:00`).toLocaleDateString("id-ID", {
		weekday: "long",
		day: "numeric",
		month: "long",
		year: "numeric",
	});
