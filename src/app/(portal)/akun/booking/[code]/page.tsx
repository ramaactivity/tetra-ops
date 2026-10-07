import { Check } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import {
	type Fmt,
	MON3,
	MONTHS,
	PKG,
} from "@/components/portal/booking/content";
import {
	type Feature,
	PortalView,
	type PortalViewProps,
} from "@/components/portal/booking/portal-view";
import {
	ChangeRequest,
	type OpenRequest,
} from "@/components/portal/change-request";
import {
	DesignSection,
	type TemplateCard,
} from "@/components/portal/design-section";
import { DpForm, type PortalBank } from "@/components/portal/dp-form";
import { type Member, MembersCard } from "@/components/portal/members-card";
import { dateLong } from "@/components/portal/status-pill";
import { modulesFor } from "@/lib/booth-api";
import { fetchBoothEvents } from "@/lib/booth-sync";
import { signedPdfQuery } from "@/lib/documents/pdf-link";
import { getPortalPerson } from "@/lib/portal/auth";
import { daysUntil, PRODUCT_LABELS, refundEstimate } from "@/lib/portal/core";
import {
	configNumber,
	loadCatalog,
	loadMyBooking,
	paidBeyondDp,
} from "@/lib/portal/data";
import {
	type DesignRequestView,
	ensureDesignRequests,
	loadDesignState,
	signedUrls,
} from "@/lib/portal/design-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { toWaPhone } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";
export const metadata = { title: "Booking kamu" };

const rp = (n: number) => `Rp${n.toLocaleString("id-ID")}`;
const DOC_LABEL: Record<string, string> = {
	invoice: "Invoice",
	receipt: "Kuitansi",
	nota_lunas: "Nota lunas",
	quotation: "Penawaran",
	bast: "Berita acara",
};

export default async function BookingDetailPage({
	params,
}: {
	params: Promise<{ code: string }>;
}) {
	const person = await getPortalPerson();
	if (!person) redirect("/akun");
	const { code } = await params;
	const b = await loadMyBooking(person, code.toUpperCase());
	if (!b) notFound();

	const admin = createAdminClient();
	const [
		catalog,
		dpMin,
		banksRes,
		subsRes,
		evRes,
		docsRes,
		phoneRes,
		membersRes,
		requestRes,
		beyondDp,
	] = await Promise.all([
		loadCatalog(),
		configNumber("booking.dp_minimum", 500_000),
		admin
			.from("bank_accounts")
			.select("id, bank_name, account_number, account_holder")
			.eq("is_active", true)
			.eq("account_kind", "bank")
			.not("account_number", "is", null)
			.order("is_default_receive", { ascending: false }),
		admin
			.from("payment_submissions")
			.select("kind, amount, status, reject_reason, created_at")
			.eq("booking_id", b.id)
			.order("created_at", { ascending: false }),
		b.event_id
			? admin
					.from("events")
					.select(
						"project_id, grand_total, total_paid, remaining_balance, due_date",
					)
					.eq("id", b.event_id)
					.maybeSingle()
			: Promise.resolve({ data: null }),
		b.event_id
			? admin
					.from("documents")
					.select("id, doc_type, doc_number, issued_at")
					.eq("event_id", b.event_id)
					.neq("status", "void")
					.in("doc_type", ["invoice", "receipt", "nota_lunas"])
					.order("issued_at", { ascending: false })
			: Promise.resolve({ data: [] }),
		admin
			.from("system_config")
			.select("value")
			.eq("key", "business_phone")
			.maybeSingle(),
		admin
			.from("booking_members")
			.select(
				"role, person:portal_people!booking_members_person_id_fkey(id, name, phone)",
			)
			.eq("booking_id", b.id)
			.order("created_at"),
		admin
			.from("booking_requests")
			.select("kind, new_date, created_at")
			.eq("booking_id", b.id)
			.eq("status", "baru")
			.maybeSingle(),
		b.event_id ? paidBeyondDp(b.event_id) : Promise.resolve(0),
	]);
	const members: Member[] = (membersRes.data ?? []).map((m) => {
		const p = m.person as unknown as {
			id: string;
			name: string | null;
			phone: string;
		};
		return {
			id: p.id,
			name: p.name,
			phone: p.phone,
			role: m.role as Member["role"],
		};
	});
	const today = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);

	const subs = subsRes.data ?? [];
	const lastRejected = subs[0]?.status === "ditolak" ? subs[0] : null;
	const pendingSub = subs.find((s) => s.status === "menunggu");
	const ev = evRes.data as {
		project_id: string;
		grand_total: number;
		total_paid: number;
		remaining_balance: number;
		due_date: string | null;
	} | null;
	const product = catalog.products.find((p) => p.category === b.service_type);
	const canPay = b.role !== "pemilik";
	const active = b.status !== "batal" && b.status !== "kedaluwarsa";
	const adminWa =
		typeof phoneRes.data?.value === "string"
			? toWaPhone(phoneRes.data.value)
			: null;
	const total = ev ? Number(ev.grand_total) : b.quoted_total;
	const sisa = ev ? Number(ev.remaining_balance) : 0;
	const banks = (banksRes.data ?? []) as PortalBank[];

	// Desain frame dibuka setelah DP diterima (event sudah ada).
	let design: DesignRequestView[] = [];
	let templates: TemplateCard[] = [];
	if (b.status === "resmi" && b.event_id) {
		await ensureDesignRequests(b.id, b.event_id);
		const [state, tpl] = await Promise.all([
			loadDesignState(b.event_id),
			admin
				.from("design_templates")
				.select("id, name, category, frame_size, orientation, preview_path")
				.eq("is_active", true)
				.order("sort"),
		]);
		design = state;
		const urls = await signedUrls(
			(tpl.data ?? []).map((t) => t.preview_path as string),
		);
		templates = (tpl.data ?? []).map((t) => ({
			id: t.id,
			name: t.name,
			category: t.category,
			frame_size: t.frame_size,
			orientation: t.orientation,
			url: urls.get(t.preview_path as string) ?? null,
		}));
	}
	const evProject = ev?.project_id ?? null;
	const designDone =
		design.length > 0 && design.every((r) => r.stage === "acc");
	const revisionLimit = await configNumber("design.revision_limit", 3);
	// Acara & Galeri dari Tetra Booth (kontrak §5), di balik portal.gallery_enabled.
	const galleryOn =
		!!evProject &&
		(
			await admin
				.from("system_config")
				.select("value")
				.eq("key", "portal.gallery_enabled")
				.maybeSingle()
		).data?.value === true;
	const boothEvents =
		galleryOn && evProject ? await fetchBoothEvents(evProject) : null;

	const steps = [
		{ label: "Booking tersimpan", done: true },
		{
			label: "DP diterima",
			done: b.status === "resmi",
			now: b.status === "draft" || b.status === "menunggu_konfirmasi",
		},
		{
			label: "Desain frame",
			done: designDone,
			now: b.status === "resmi" && !designDone,
			hint: "Dibuka setelah DP diterima",
		},
		{ label: "Pelunasan", done: !!ev && Number(ev.remaining_balance) <= 0 },
		{ label: "Hari acara", done: false },
	];

	const DAY3 = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
	const [yy, mm, dd] = b.event_date.split("-").map(Number);
	const dt = new Date(Date.UTC(yy, mm - 1, dd));
	const dShort = `${DAY3[dt.getUTCDay()]}, ${dd} ${MON3[mm - 1]} ${yy}`;
	const fmt: Fmt =
		b.frame_size === "2R"
			? "strip"
			: b.frame_size === "4R"
				? "4r"
				: b.frame_size === "polaroid"
					? "polaroid"
					: (PKG[b.service_type]?.fmt ?? "4r");
	const pkgName =
		PKG[b.service_type]?.name ??
		product?.label ??
		PRODUCT_LABELS[b.service_type];
	const dpAmount = Math.min(dpMin, b.quoted_total);
	const STATUS: Record<string, string> = {
		draft: pendingSub
			? "Menunggu verifikasi DP"
			: "Draf · tanggal belum terkunci",
		menunggu_konfirmasi: "Menunggu verifikasi DP",
		resmi: "Resmi · tanggal terkunci",
		kedaluwarsa: "Kedaluwarsa",
		batal: "Dibatalkan",
	};
	const h2 = { fontSize: 17, fontWeight: 800, margin: 0 } as const;
	const resmi = b.status === "resmi";
	const hasDocs = canPay && (docsRes.data ?? []).length > 0;
	const galleryReady = !!boothEvents?.some((e) => e.gallery_url);
	const features: Feature[] = [
		{
			k: "desain",
			t: "Desain frame",
			s: "Pilih template atau ajukan desain custom, lalu setujui hasilnya.",
			badge: resmi ? "Terbuka" : "Setelah DP",
			open: resmi && design.length > 0,
			href: "#desain-frame",
		},
		{
			k: "data",
			t: "Lengkapi data acara",
			s: "Venue, PIC hari H, rundown. Isi bertahap, tersimpan otomatis.",
			badge: "Langsung",
			open: true,
			href: "#boleh-menyusul",
		},
		...(canPay
			? [
					{
						k: "bayar" as const,
						t: "DP & pelunasan",
						s: "Lihat tagihan dan unggah bukti transfer.",
						badge: "Langsung",
						open: true,
						href: "#pembayaran",
					},
					{
						k: "dokumen" as const,
						t: "Invoice & kuitansi",
						s: "Unduh dokumen resmi booking kamu.",
						badge: hasDocs ? "Terbuka" : "Setelah DP",
						open: hasDocs,
						href: "#dokumen",
					},
				]
			: []),
		{
			k: "galeri",
			t: "Galeri foto acara",
			s: "Semua foto booth bisa dilihat dan diunduh setelah acara.",
			badge: galleryReady ? "Terbuka" : "Setelah acara",
			open: galleryReady,
			href: "#galeri",
		},
	];

	return (
		<PortalView
			code={b.public_code}
			title={b.detail.nama_acara || "Booking kamu"}
			statusLabel={STATUS[b.status] ?? b.status}
			pv={{
				fmt,
				title: b.detail.nama_acara || "Nama acaramu",
				date: `${dd} ${MONTHS[mm - 1].toUpperCase()} ${yy}`,
				kicker:
					b.detail.kategori === "wedding"
						? "THE WEDDING OF"
						: b.detail.kategori === "engagement"
							? "ENGAGEMENT OF"
							: "",
				theme: "klasik",
			}}
			rows={[
				{ k: "Tanggal", v: dShort },
				{ k: "Paket", v: `${pkgName} · ${b.package_hours} jam` },
				{ k: "DP minimal", v: rp(dpAmount) },
			]}
			totalStr={rp(total)}
			detail={b.detail}
			readOnly={!active}
			dpOpen={b.status === "draft" && canPay}
			dp={dpAmount}
			bank={(banks[0] as PortalViewProps["bank"]) ?? null}
			dpSent={!!pendingSub && pendingSub.kind === "dp"}
			rejectReason={lastRejected?.reject_reason ?? null}
			stageGroups={modulesFor(b.service_type).includes("photo_stage")}
			adminWa={adminWa}
			features={features}
		>
			<section style={{ display: "grid", gap: 10 }}>
				<h2 style={h2}>Tahapan booking</h2>
				<ol
					className="card"
					style={{ listStyle: "none", margin: 0, display: "grid", gap: 12 }}
				>
					{steps.map((s) => (
						<li
							key={s.label}
							style={{ display: "flex", gap: 12, alignItems: "center" }}
						>
							<span
								className="tick"
								data-on={s.done}
								style={
									s.now && !s.done ? { background: "var(--butter)" } : undefined
								}
							>
								{s.done && <Check size={15} strokeWidth={3} />}
							</span>
							<span
								style={{
									fontWeight: s.now ? 800 : 600,
									color: s.done || s.now ? "var(--ink)" : "var(--text-2)",
								}}
							>
								{s.label}
								{s.now && s.hint && b.status !== "resmi" ? (
									<span className="cap"> · {s.hint}</span>
								) : null}
							</span>
						</li>
					))}
				</ol>
			</section>

			{active &&
				(b.status !== "draft" || (pendingSub && pendingSub.kind !== "dp")) && (
					<section id="pembayaran" style={{ display: "grid", gap: 10 }}>
						<h2 style={h2}>Pembayaran</h2>
						<div className="card" style={{ display: "grid", gap: 6 }}>
							<Row
								label={ev ? "Total tagihan" : "Perkiraan total"}
								value={rp(total)}
							/>
							{ev && canPay && (
								<Row label="Sudah dibayar" value={rp(Number(ev.total_paid))} />
							)}
							{ev && canPay && (
								<Row
									label="Sisa"
									value={rp(Number(ev.remaining_balance))}
									strong
								/>
							)}
							{ev?.due_date && Number(ev.remaining_balance) > 0 && (
								<div className="cap">
									Pelunasan paling lambat {dateLong(ev.due_date)}.
								</div>
							)}
						</div>
						{pendingSub && b.status !== "draft" && (
							<div className="note" style={{ background: "var(--sky)" }}>
								Bukti {pendingSub.kind === "dp" ? "DP" : "pembayaran"}{" "}
								{rp(Number(pendingSub.amount))} sedang dicek admin.
								{pendingSub.kind === "dp"
									? " Jadwal kamu kami tahan selama itu."
									: ""}{" "}
								Kabarnya kami kirim lewat WhatsApp.
							</div>
						)}
						{b.status === "resmi" &&
							ev &&
							sisa > 0 &&
							canPay &&
							!pendingSub && (
								<div className="card" style={{ display: "grid", gap: 12 }}>
									<div className="h2">Bayar pelunasan</div>
									{lastRejected && (
										<div
											className="note"
											style={{ background: "var(--coral)" }}
										>
											Bukti sebelumnya belum bisa kami terima:{" "}
											{lastRejected.reject_reason}
										</div>
									)}
									<DpForm
										kind="pelunasan"
										code={b.public_code}
										banks={banks}
										dpMin={0}
										total={sisa}
										missing={[]}
									/>
								</div>
							)}
					</section>
				)}

			{galleryOn && (
				<section id="galeri" style={{ display: "grid", gap: 10 }}>
					<h2 style={h2}>Acara & Galeri</h2>
					{boothEvents === null ? (
						<div className="note">
							Galeri belum bisa dibuka, coba lagi nanti.
						</div>
					) : boothEvents.length === 0 ? (
						<div className="note">
							Galeri foto muncul di sini setelah acara kamu berjalan.
						</div>
					) : (
						boothEvents.map((e) => (
							<div
								key={e.id}
								className="card"
								style={{ display: "grid", gap: 6 }}
							>
								<div style={{ fontWeight: 800 }}>{e.name}</div>
								<div className="cap">
									{e.phase === "done"
										? "Acara selesai"
										: e.phase === "live"
											? "Sedang berlangsung"
											: "Akan datang"}
									{typeof e.photo_count === "number"
										? ` · ${e.photo_count} foto`
										: ""}
									{e.client_expires_at
										? ` · galeri tersedia sampai ${dateLong(e.client_expires_at.slice(0, 10))}`
										: ""}
								</div>
								{e.gallery_url && (
									<a
										className="btn btn-primary btn-block"
										href={e.gallery_url}
										target="_blank"
										rel="noopener"
									>
										Buka galeri
									</a>
								)}
							</div>
						))
					)}
				</section>
			)}

			{design.length > 0 && (
				<section id="desain-frame" style={{ display: "grid", gap: 10 }}>
					<h2 style={h2}>Desain frame</h2>
					<DesignSection
						code={b.public_code}
						requests={design}
						templates={templates}
						revisionLimit={revisionLimit}
					/>
				</section>
			)}

			{canPay && (docsRes.data ?? []).length > 0 && (
				<section id="dokumen" style={{ display: "grid", gap: 10 }}>
					<h2 style={h2}>Dokumen</h2>
					{(docsRes.data ?? []).map((d) => (
						<a
							key={d.id}
							className="card"
							href={`/api/pdf/document/${d.id}?${signedPdfQuery(d.id, 3600) ?? ""}&download=1`}
							style={{
								display: "flex",
								justifyContent: "space-between",
								color: "var(--ink)",
								textDecoration: "none",
							}}
						>
							<span style={{ fontWeight: 700 }}>
								{DOC_LABEL[d.doc_type] ?? d.doc_type}
							</span>
							<span className="mono cap">{d.doc_number} ↓</span>
						</a>
					))}
				</section>
			)}

			<section style={{ display: "grid", gap: 10 }}>
				<h2 style={h2}>Orang di booking ini</h2>
				<MembersCard
					code={b.public_code}
					members={members}
					meId={person.id}
					canManage={active && b.role !== "pemilik"}
				/>
			</section>

			{active && (
				<section style={{ display: "grid", gap: 10 }}>
					<h2 style={h2}>Ubah jadwal atau batal</h2>
					<ChangeRequest
						code={b.public_code}
						isDraft={b.status === "draft"}
						canCancel={canPay}
						refundEstimate={
							ev
								? refundEstimate(beyondDp, daysUntil(b.event_date, today))
								: null
						}
						openRequest={(requestRes.data as OpenRequest | null) ?? null}
					/>
				</section>
			)}
		</PortalView>
	);
}

function Row({
	label,
	value,
	strong,
}: {
	label: string;
	value: string;
	strong?: boolean;
}) {
	return (
		<div
			style={{
				display: "flex",
				justifyContent: "space-between",
				fontWeight: strong ? 800 : 600,
			}}
		>
			<span>{label}</span>
			<span className="mono">{value}</span>
		</div>
	);
}
