import { ChevronLeft, Lock } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Container } from "@/components/layout/container";
import { TutupBukuForm } from "@/components/tutup-buku/tutup-buku-form";
import { RekapHeroCard } from "@/components/rekap/rekap-hero-card";
import { getRekapContext } from "@/lib/actions/rekap";
import { getAutoHpp } from "@/lib/actions/settlement-prefill";
import { getCurrentUser } from "@/lib/auth/get-user";
import { SETTLEMENT_DEFAULTS } from "@/lib/constants/settlement";
import { createClient } from "@/lib/supabase/server";

export default async function TutupBukuPage({
	params,
}: {
	params: Promise<{ projectId: string }>;
}) {
	const { projectId } = await params;

	const me = await getCurrentUser();
	if (!me) redirect("/login");
	if (me.profile.role !== "super_admin" && me.profile.role !== "owner") {
		redirect(`/operations/${projectId}`);
	}

	const supabase = await createClient();

	const { data: event } = await supabase
		.from("events")
		.select(
			`id, project_id, status, client_name, event_date, venue_name,
			grand_total, discount_amount,
			crew_assignments:crew_assignments(role_in_event, fee_amount)`,
		)
		.eq("project_id", projectId)
		.maybeSingle();
	if (!event) notFound();

	// Already settled? show banner + link back
	const { data: existingSettlement } = await supabase
		.from("event_settlements")
		.select("id")
		.eq("event_id", event.id)
		.maybeSingle();

	const isAlreadySettled = Boolean(existingSettlement);

	// Status gate (RPC also enforces)
	const canSettle =
		event.status === "in_progress" || event.status === "awaiting_settlement";

	const [context, autoHpp, { data: rekap }] = await Promise.all([
		getRekapContext(event.id as string),
		getAutoHpp(event.id as string),
		supabase
			.from("crew_rekap")
			.select(
				`id, cetak_total, media_set_used, sleeve_used,
				flashdisk_used, pouch_used, photomagnet_used, keychain_used,
				custom_materials, proof_photo_urls, crew_notes, is_approved`,
			)
			.eq("event_id", event.id)
			.maybeSingle(),
	]);

	if ("error" in context) {
		return (
			<Container size="md">
				<div className="rounded-md border border-destructive bg-destructive/10 p-3">
					<p className="text-sm font-medium text-destructive">
						Gagal load konteks: {context.error}
					</p>
				</div>
			</Container>
		);
	}

	// Crew fee defaults
	const assignments = (event.crew_assignments ?? []) as Array<{
		role_in_event: string;
		fee_amount: number;
	}>;
	const feeBy = (role: string) =>
		assignments.find((a) => a.role_in_event === role)?.fee_amount ?? 0;

	const defaults = {
		revenue_gross: Number(event.grand_total ?? 0),
		discount_total: Number(event.discount_amount ?? 0),
		owner_pool_per_person: SETTLEMENT_DEFAULTS.OWNER_POOL_PER_PERSON,
		platform_fee: SETTLEMENT_DEFAULTS.PLATFORM_FEE_DEFAULT,
		fee_lead: feeBy("lead"),
		fee_asisten: feeBy("asisten"),
		fee_crew_c: feeBy("crew_c"),
		// Rekap consumption defaults (from existing rekap if any)
		cetak_total: rekap?.cetak_total ?? 0,
		media_set_used: rekap?.media_set_used ?? 0,
		sleeve_used: rekap?.sleeve_used ?? 0,
		flashdisk_used: rekap?.flashdisk_used ?? 0,
		pouch_used: rekap?.pouch_used ?? 0,
		photomagnet_used: rekap?.photomagnet_used ?? 0,
		keychain_used: rekap?.keychain_used ?? 0,
		custom_materials: JSON.stringify(rekap?.custom_materials ?? {}),
		proof_photo_urls: (rekap?.proof_photo_urls ?? []).join("\n"),
		crew_notes: rekap?.crew_notes ?? "",
	};

	return (
		<Container size="md" className="space-y-5 pb-32">
			<Link
				href={`/operations/${projectId}`}
				className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
			>
				<ChevronLeft className="h-4 w-4" />
				{projectId}
			</Link>

			<RekapHeroCard
				eyebrow="TUTUP BUKU"
				clientName={event.client_name}
				projectId={event.project_id}
				eventDate={event.event_date}
				venueName={event.venue_name}
				pkg={context.pkg}
				isApproved={rekap?.is_approved}
				submitted={Boolean(rekap)}
			/>

			{isAlreadySettled ? (
				<div className="flex items-start gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-5">
					<Lock className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700 dark:text-emerald-300" />
					<div className="space-y-1">
						<h2 className="text-base font-semibold text-emerald-900 dark:text-emerald-200">
							Event sudah di-Tutup Buku
						</h2>
						<p className="text-sm text-emerald-900/80 dark:text-emerald-200/80">
							Sudah ada settlement record. Edit P&L harus lewat reopen
							settlement (admin-only).
						</p>
						<Link
							href={`/operations/${projectId}`}
							className="mt-2 inline-flex h-9 items-center gap-1 rounded-md bg-emerald-600 px-3 text-sm font-medium text-white hover:bg-emerald-700"
						>
							Kembali ke event detail →
						</Link>
					</div>
				</div>
			) : !canSettle ? (
				<div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-5">
					<Lock className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-300" />
					<div className="space-y-1">
						<h2 className="text-base font-semibold">
							Tutup Buku belum bisa dibuka
						</h2>
						<p className="text-muted-foreground text-sm">
							Status event sekarang{" "}
							<code className="font-mono">{event.status}</code>. Pindah ke{" "}
							<code className="font-mono">in_progress</code> atau{" "}
							<code className="font-mono">awaiting_settlement</code> dulu via
							tombol status di event detail.
						</p>
					</div>
				</div>
			) : (
				<TutupBukuForm
					eventId={event.id}
					projectId={projectId}
					context={context}
					autoHpp={autoHpp}
					defaults={defaults}
				/>
			)}
		</Container>
	);
}
