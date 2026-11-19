import { BanknoteArrowDown } from "lucide-react";
import { Container } from "@/components/layout/container";
import {
	DpDraftsSection,
	type DraftView,
} from "@/components/payment-drafts/dp-drafts-section";
import { EmptyState } from "@/components/ui/empty-state";
import type { DraftRow } from "@/lib/payment-drafts/core";
import { sisaTagihan } from "@/lib/payment-drafts/server";
import { draftViewsAndBanks } from "@/lib/payment-drafts/view";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const OPEN = new Set(["menunggu", "disetujui"]);

/**
 * Billing › Uang Masuk (owner 19 Nov 2026): semua bukti transfer dari WA —
 * DP maupun pelunasan, semua klien — dicek dan dikonfirmasi di satu tempat.
 * Baris & aksi = DpDraftsSection yang sama dengan Booking Masuk.
 */
export default async function UangMasukPage() {
	const supabase = await createClient();
	const since = new Date(Date.now() - 14 * 86_400_000).toISOString();
	const { data, error } = await supabase
		.from("payment_drafts")
		.select("*")
		.or(`status.in.(menunggu,disetujui),updated_at.gte.${since}`)
		.order("created_at", { ascending: false })
		.limit(100);
	const drafts = (data ?? []) as DraftRow[];

	// Untuk siapa: event > Booking Masuk > dokumen > nama dari bot.
	const ids = (k: "booking_inbox_id" | "document_id") => [
		...new Set(drafts.map((d) => d[k]).filter(Boolean) as string[]),
	];
	const [{ data: inbox }, { data: docs }] = await Promise.all([
		ids("booking_inbox_id").length
			? supabase
					.from("booking_inbox")
					.select("id, client_name, event_id")
					.in("id", ids("booking_inbox_id"))
			: Promise.resolve({ data: [] }),
		ids("document_id").length
			? supabase
					.from("documents")
					.select("id, client, event_id")
					.in("id", ids("document_id"))
			: Promise.resolve({ data: [] }),
	]);
	const inboxOf = new Map((inbox ?? []).map((r) => [r.id as string, r]));
	const docOf = new Map((docs ?? []).map((r) => [r.id as string, r]));
	const eventIdOf = (d: DraftRow) =>
		(d.event_id ??
			inboxOf.get(d.booking_inbox_id ?? "")?.event_id ??
			docOf.get(d.document_id ?? "")?.event_id ??
			null) as string | null;
	const evIds = [...new Set(drafts.map(eventIdOf).filter(Boolean) as string[])];
	const { data: events } = evIds.length
		? await supabase
				.from("events")
				.select("id, project_id, client_name")
				.in("id", evIds)
		: { data: [] };
	const evOf = new Map((events ?? []).map((e) => [e.id as string, e]));

	const { views, banks } = await draftViewsAndBanks(supabase, drafts);
	const withContext: DraftView[] = await Promise.all(
		views.map(async (v, i) => {
			const d = drafts[i];
			const evId = eventIdOf(d);
			const ev = evId ? evOf.get(evId) : undefined;
			const ib = inboxOf.get(d.booking_inbox_id ?? "");
			const doc = docOf.get(d.document_id ?? "");
			const klien = ev
				? {
						nama: ev.client_name as string,
						href: `/operations/${ev.project_id}`,
					}
				: ib
					? {
							nama: ib.client_name as string,
							href: `/operations/booking-masuk/${ib.id}`,
						}
					: doc
						? {
								nama: (doc.client as { name?: string })?.name ?? "Klien",
								href: `/finance/dokumen/${doc.id}`,
							}
						: d.nama_klien
							? { nama: d.nama_klien, href: null }
							: null;
			const sisa =
				OPEN.has(d.status) && d.nominal
					? await sisaTagihan(
							supabase,
							{
								booking_inbox_id: d.booking_inbox_id,
								document_id: d.document_id,
								event_id: evId,
							},
							d.id,
						).catch(() => null)
					: null;
			return {
				...v,
				klien,
				adaEvent: Boolean(ev),
				sisa:
					sisa == null
						? null
						: {
								sebelum: sisa,
								sesudah: Math.max(0, sisa - (d.nominal ?? 0)),
							},
			};
		}),
	);
	const open = withContext.filter((v) => OPEN.has(v.status));
	const done = withContext.filter((v) => !OPEN.has(v.status));

	return (
		<Container size="lg" className="space-y-3 pb-6">
			<div>
				<h1 className="text-[20px] font-semibold tracking-[-0.01em]">
					Uang Masuk
				</h1>
				<p className="text-[13px] text-muted-foreground">
					Bukti transfer yang dikirim klien lewat WA. Cocokkan dengan mutasi
					bank, lalu konfirmasi — pembayaran masuk Billing dan klien bisa
					langsung menerima kuitansi + ucapan terima kasih.
				</p>
			</div>

			{error ? (
				<p className="rounded-xl bg-rose-50 px-4 py-3 text-[13px] text-rose-800">
					Bukti transfer gagal dimuat: {error.message}
				</p>
			) : open.length > 0 ? (
				<DpDraftsSection
					title="Perlu dicek"
					drafts={open}
					banks={banks}
					hasEvent={false}
				/>
			) : (
				<EmptyState
					icon={BanknoteArrowDown}
					title="Tidak ada bukti transfer yang menunggu"
					description="Bukti transfer yang dikirim klien lewat WA muncul di sini untuk dicek."
				/>
			)}

			{done.length > 0 ? (
				<DpDraftsSection
					title="Sudah diproses · 14 hari terakhir"
					drafts={done}
					banks={banks}
					hasEvent
				/>
			) : null}
		</Container>
	);
}
