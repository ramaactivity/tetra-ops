import { ChevronRight, Inbox } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

/**
 * Pengingat di halaman Operations: booking DP dari bot yang belum jadi event.
 * Jalan masuk utama di HP (sidebar badge hanya tampil di desktop).
 */
export async function InboxBanner() {
	const supabase = await createClient();
	const { count } = await supabase
		.from("booking_inbox")
		.select("id", { count: "exact", head: true })
		.in("status", ["baru", "diproses"]);
	if (!count) return null;
	return (
		<Link
			href="/operations/booking-masuk"
			className="flex items-center gap-3 rounded-[16px] border border-sky-200 bg-sky-50 px-4 py-3 text-sky-900 transition-colors hover:bg-sky-100"
		>
			<Inbox className="size-5 shrink-0" />
			<span className="min-w-0 flex-1 text-[14px]">
				<span className="font-semibold">{count} booking masuk</span> dari bot WA
				menunggu dibuatkan event.
			</span>
			<ChevronRight className="size-4 shrink-0" />
		</Link>
	);
}
