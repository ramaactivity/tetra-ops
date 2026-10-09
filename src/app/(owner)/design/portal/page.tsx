import { Brush } from "lucide-react";
import Link from "next/link";
import { Container } from "@/components/layout/container";
import { DesignerPanel } from "@/components/portal/designer-panel";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDateID } from "@/lib/format";
import { STAGE_LABEL, type Stage } from "@/lib/portal/design";
import {
	type DesignRequestView,
	loadDesignState,
} from "@/lib/portal/design-server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const ORDER: Stage[] = [
	"revisi",
	"dikerjakan",
	"menunggu_review",
	"brief",
	"acc",
];
const TONE: Record<Stage, string> = {
	revisi: "bg-orange-100 text-orange-800",
	dikerjakan: "bg-sky-100 text-sky-800",
	menunggu_review: "bg-amber-100 text-amber-800",
	brief: "bg-secondary text-muted-foreground",
	acc: "bg-emerald-100 text-emerald-800",
};

/**
 * Antrean desain dari portal klien (DR-031): brief, revisi, review, ACC.
 * Urutan: yang harus dikerjakan designer di atas. ACC 14 hari terakhir ikut
 * tampil supaya designer tahu yang sudah beres.
 */
export default async function DesignQueuePage() {
	const supabase = await createClient();
	const since = new Date(Date.now() - 14 * 86_400_000).toISOString();
	const { data, error } = await supabase
		.from("design_requests")
		.select(
			"id, event_id, stage, approved_at, mode, template:design_templates(name), event:events(project_id, client_name, event_title, event_date), booking:client_bookings(public_code)",
		)
		.or(`stage.neq.acc,approved_at.gte.${since}`)
		.order("updated_at", { ascending: false })
		.limit(100);
	type Row = {
		id: string;
		event_id: string;
		stage: Stage;
		mode: string | null;
		template: { name: string } | null;
		event: {
			project_id: string;
			client_name: string | null;
			event_title: string | null;
			event_date: string;
		} | null;
		booking: { public_code: string } | null;
	};
	const rows = ((data ?? []) as unknown as Row[]).sort(
		(a, b) =>
			ORDER.indexOf(a.stage) - ORDER.indexOf(b.stage) ||
			(a.event?.event_date ?? "").localeCompare(b.event?.event_date ?? ""),
	);
	// ponytail: satu loadDesignState per event (N kecil, ±8 event/bulan); gabungkan kalau antrean membesar.
	const states = new Map<string, DesignRequestView[]>();
	for (const id of new Set(rows.map((r) => r.event_id)))
		states.set(id, await loadDesignState(id));

	return (
		<Container size="lg" className="space-y-3 pb-6">
			<div className="flex flex-wrap items-end justify-between gap-2">
				<div>
					<h1 className="text-[20px] font-semibold tracking-[-0.01em]">
						Antrean Desain
					</h1>
					<p className="text-[13px] text-muted-foreground">
						Desain frame dari portal klien. Upload PNG overlay (Canva/Photoshop)
						— ukuran dicek otomatis, klien dikabari lewat WA.
					</p>
				</div>
				<Link
					href="/design/templates"
					className="text-[13px] font-medium underline"
				>
					Kelola template frame
				</Link>
			</div>
			{error && (
				<p className="rounded-xl bg-rose-50 px-4 py-3 text-[13px] text-rose-800">
					Gagal memuat: {error.message}
				</p>
			)}
			{rows.length === 0 ? (
				<EmptyState
					icon={Brush}
					title="Antrean kosong"
					description="Brief desain dari portal klien muncul di sini."
				/>
			) : (
				<ul className="space-y-2">
					{rows.map((row) => {
						const r = states.get(row.event_id)?.find((x) => x.id === row.id);
						if (!r || !row.event) return null;
						const latest = r.versions[0];
						return (
							<li
								key={row.id}
								className="space-y-3 rounded-[16px] border border-border-subtle bg-card p-4"
							>
								<div className="flex flex-wrap items-start justify-between gap-2">
									<div className="min-w-0">
										<p className="truncate text-[15px] font-semibold">
											{row.event.event_title || row.event.client_name}
											{r.spot_no > 1 ? ` · spot ${r.spot_no}` : ""}
										</p>
										<p className="text-[12.5px] text-muted-foreground">
											{formatDateID(row.event.event_date)} · pesanan{" "}
											{r.size ?? "ukuran menyusul"} ·{" "}
											<Link
												href={`/design/${row.event.project_id}`}
												className="underline"
											>
												{row.event.project_id}
											</Link>{" "}
											· revisi {r.revision_count}
										</p>
									</div>
									<span
										className={`inline-flex h-6 items-center rounded-full px-2.5 text-[12px] font-semibold ${TONE[r.stage]}`}
									>
										{STAGE_LABEL[r.stage]}
									</span>
								</div>

								<div className="grid gap-1 text-[13px]">
									<p>
										<b>
											{r.mode === "template"
												? `Template: ${row.template?.name ?? "-"}`
												: r.mode === "custom"
													? "Custom"
													: r.mode === "upload"
														? "Desain dari klien — cek sebelum dipasang di Booth"
														: "Brief belum dikirim"}
										</b>
									</p>
									{Object.entries(r.brief)
										.filter(([, v]) => v)
										.map(([k, v]) => (
											<p key={k}>
												<span className="text-muted-foreground">
													{k.replace("_", " ")}:
												</span>{" "}
												{v}
											</p>
										))}
									{r.files.map((f) => (
										<a
											key={f.id}
											href={f.url ?? "#"}
											target="_blank"
											rel="noopener"
											className="underline"
										>
											{f.kind}: {f.file_name}
										</a>
									))}
								</div>

								{latest && (
									<div className="flex gap-3">
										{latest.url && (
											// biome-ignore lint/performance/noImgElement: signed URL privat.
											<img
												src={latest.url}
												alt={`v${latest.version_no}`}
												className="h-28 rounded-lg border border-border-subtle object-contain"
											/>
										)}
										<div className="text-[12.5px] text-muted-foreground">
											<p className="font-medium text-foreground">
												v{latest.version_no}
											</p>
											<p>
												{latest.frame_size} {latest.orientation} ·{" "}
												{latest.width}×{latest.height}
											</p>
											<p>
												{latest.has_transparency
													? "Ada area transparan"
													: "Tanpa area transparan"}
											</p>
										</div>
									</div>
								)}

								{r.comments.length > 0 && (
									<div className="space-y-1 text-[13px]">
										{r.comments.slice(-4).map((c) => (
											<p
												key={c.id}
												className={
													c.is_revision_request
														? "font-medium text-orange-800"
														: ""
												}
											>
												<span className="text-muted-foreground">
													{c.author}:
												</span>{" "}
												{c.body}
											</p>
										))}
									</div>
								)}
								<DesignerPanel r={r} />
							</li>
						);
					})}
				</ul>
			)}
		</Container>
	);
}
