import {
	ArrowLeft,
	CheckCircle2,
	Image as ImageIcon,
	Printer,
	Wallet,
} from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/get-user";
import { formatRupiah } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

type RekapSummary = {
	cetak_total: number;
	proof_count: number;
	is_approved: boolean | null;
	expense_total: number;
};

export default async function CrewRekapSuccessPage({
	params,
}: {
	params: Promise<{ projectId: string }>;
}) {
	const { projectId } = await params;
	const me = await getCurrentUser();
	if (!me) redirect("/login");

	const supabase = await createClient();

	const { data: event } = await supabase
		.from("events")
		.select(
			`id, project_id, client_name, event_date, venue_name,
			crew_assignments:crew_assignments!inner(
				user:users!crew_assignments_user_id_fkey(id)
			)`,
		)
		.eq("project_id", projectId)
		.maybeSingle();

	if (!event) notFound();

	const crewAssignments = (event.crew_assignments ?? []) as Array<{
		user: { id: string } | Array<{ id: string }> | null;
	}>;
	const isAssigned = crewAssignments.some((a) => {
		const u = Array.isArray(a.user) ? a.user[0] : a.user;
		return u?.id === me.profile.id;
	});
	if (!isAssigned) notFound();

	const { data: rekapData } = await supabase
		.from("crew_rekap")
		.select(
			`cetak_total, proof_photo_urls, is_approved,
			transport_cost, bensin_cost, toll_cost, parking_cost, konsumsi_cost, lainnya_items`,
		)
		.eq("event_id", event.id)
		.maybeSingle();

	if (!rekapData) {
		redirect(`/crew/jadwal/${projectId}/rekap`);
	}

	const rekap = rekapData as {
		cetak_total: number;
		proof_photo_urls: string[];
		is_approved: boolean | null;
		transport_cost: number | string | null;
		bensin_cost: number | string | null;
		toll_cost: number | string | null;
		parking_cost: number | string | null;
		konsumsi_cost: number | string | null;
		lainnya_items: Array<{ note: string; amount: number }> | null;
	};

	const lainnyaTotal = (rekap.lainnya_items ?? []).reduce(
		(s, r) => s + (Number(r.amount) || 0),
		0,
	);

	const summary: RekapSummary = {
		cetak_total: rekap.cetak_total,
		proof_count: rekap.proof_photo_urls.length,
		is_approved: rekap.is_approved,
		expense_total:
			(Number(rekap.transport_cost) || 0) +
			(Number(rekap.bensin_cost) || 0) +
			(Number(rekap.toll_cost) || 0) +
			(Number(rekap.parking_cost) || 0) +
			(Number(rekap.konsumsi_cost) || 0) +
			lainnyaTotal,
	};

	return (
		<div className="mx-auto w-full max-w-md space-y-6 px-4 py-10">
			<div className="flex flex-col items-center gap-3 text-center">
				<div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15">
					<CheckCircle2 className="h-9 w-9 text-emerald-600 dark:text-emerald-400" />
				</div>
				<div className="space-y-1">
					<h1 className="text-fluid-h1 font-semibold tracking-tight">
						Rekap berhasil disubmit
					</h1>
					<p className="text-muted-foreground text-sm">
						{event.client_name} · {event.project_id}
					</p>
				</div>
			</div>

			<dl className="space-y-2 rounded-lg border border-border-default bg-surface-2 p-4">
				<SummaryRow
					icon={Printer}
					label="Total cetak"
					value={`${summary.cetak_total.toLocaleString("id-ID")} pcs`}
				/>
				<SummaryRow
					icon={Wallet}
					label="Total pengeluaran"
					value={formatRupiah(summary.expense_total)}
				/>
				<SummaryRow
					icon={ImageIcon}
					label="Foto bukti"
					value={`${summary.proof_count} foto`}
				/>
			</dl>

			<div className="space-y-2 rounded-lg border border-blue-200 bg-blue-50/60 p-4 dark:border-blue-900 dark:bg-blue-950/30">
				<p className="text-blue-900 dark:text-blue-200 text-sm font-medium">
					Owner akan review & finalize
				</p>
				<p className="text-blue-900/80 dark:text-blue-200/80 text-xs leading-relaxed">
					Lo akan dapat notif kalau ada update — approve, butuh revisi, atau
					settle. Sampe situ, lo bisa cek status di halaman event.
				</p>
			</div>

			<div className="space-y-2">
				<Link
					href={`/crew/jadwal/${projectId}`}
					className="press-down inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-primary px-6 text-fluid-body font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
				>
					<ArrowLeft className="h-4 w-4" />
					Kembali ke detail event
				</Link>
				<Link
					href="/crew/jadwal"
					className="press-down inline-flex h-11 w-full items-center justify-center gap-2 rounded-full border border-border-default bg-surface-2 px-6 text-fluid-body font-medium transition-colors hover:bg-muted"
				>
					Lihat semua jadwal
				</Link>
			</div>
		</div>
	);
}

function SummaryRow({
	icon: Icon,
	label,
	value,
}: {
	icon: typeof Printer;
	label: string;
	value: string;
}) {
	return (
		<div className="flex items-center justify-between gap-3 text-sm">
			<dt className="text-muted-foreground flex items-center gap-2">
				<Icon className="h-3.5 w-3.5" />
				{label}
			</dt>
			<dd className="text-foreground tabular font-semibold">{value}</dd>
		</div>
	);
}
