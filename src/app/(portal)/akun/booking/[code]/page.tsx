import { Check } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import {
	ChangeRequest,
	type OpenRequest,
} from "@/components/portal/change-request";
import {
	DesignSection,
	type TemplateCard,
} from "@/components/portal/design-section";
import { DetailForm } from "@/components/portal/detail-form";
import { DpForm, type PortalBank } from "@/components/portal/dp-form";
import { type Member, MembersCard } from "@/components/portal/members-card";
import { dateLong, StatusPill } from "@/components/portal/status-pill";
import { signedPdfQuery } from "@/lib/documents/pdf-link";
import { getPortalPerson } from "@/lib/portal/auth";
import {
	daysUntil,
	FRAME_LABELS,
	missingForDp,
	PRODUCT_LABELS,
	refundEstimate,
} from "@/lib/portal/core";
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
		typesRes,
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
		admin
			.from("event_types")
			.select("code, label")
			.eq("is_active", true)
			.order("display_order"),
		b.event_id
			? admin
					.from("events")
					.select("grand_total, total_paid, remaining_balance, due_date")
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
	const designDone =
		design.length > 0 && design.every((r) => r.stage === "acc");
	const revisionLimit = await configNumber("design.revision_limit", 3);

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

	return (
		<div className="wrap" style={{ display: "grid", gap: 18 }}>
			<a href="/akun" className="link cap">
				← Booking saya
			</a>

			<section
				className="card layered"
				style={{
					display: "grid",
					gap: 8,
					["--under" as string]: "var(--lavender)",
				}}
			>
				<div
					style={{
						display: "flex",
						justifyContent: "space-between",
						gap: 8,
						alignItems: "start",
					}}
				>
					<h1 className="h1" style={{ fontSize: 26 }}>
						{b.detail.nama_acara || "Acara kamu"}
					</h1>
					<StatusPill status={b.status} />
				</div>
				<hr className="divider" style={{ margin: "4px 0" }} />
				<div className="body">
					{dateLong(b.event_date)}
					{b.start_time
						? ` · mulai ${b.start_time.slice(0, 5)}`
						: " · jam menyusul"}
				</div>
				<div className="body">
					{product?.label ?? PRODUCT_LABELS[b.service_type]} · {b.package_hours}{" "}
					jam
					{b.frame_size
						? ` · ${FRAME_LABELS[b.frame_size] ?? b.frame_size}`
						: ""}
					{b.unit_count > 1 ? ` · ${b.unit_count} booth` : ""}
				</div>
				<div className="cap mono">Kode booking {b.public_code}</div>
			</section>

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

			{active && (
				<section style={{ display: "grid", gap: 10 }}>
					<h2 className="h2">Pembayaran</h2>
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
					{b.status === "draft" && canPay && (
						<div className="card" style={{ display: "grid", gap: 12 }}>
							<div className="h2">Bayar DP</div>
							{lastRejected && (
								<div className="note" style={{ background: "var(--coral)" }}>
									Bukti sebelumnya belum bisa kami terima:{" "}
									{lastRejected.reject_reason}
								</div>
							)}
							<DpForm
								code={b.public_code}
								banks={banks}
								dpMin={dpMin}
								total={b.quoted_total}
								missing={missingForDp(b.detail)}
							/>
						</div>
					)}
					{pendingSub && (
						<div className="note" style={{ background: "var(--sky)" }}>
							Bukti {pendingSub.kind === "dp" ? "DP" : "pembayaran"}{" "}
							{rp(Number(pendingSub.amount))} sedang dicek admin.
							{pendingSub.kind === "dp"
								? " Jadwal kamu kami tahan selama itu."
								: ""}{" "}
							Kabarnya kami kirim lewat WhatsApp.
						</div>
					)}
					{b.status === "resmi" && ev && sisa > 0 && canPay && !pendingSub && (
						<div className="card" style={{ display: "grid", gap: 12 }}>
							<div className="h2">Bayar pelunasan</div>
							{lastRejected && (
								<div className="note" style={{ background: "var(--coral)" }}>
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

			{design.length > 0 && (
				<section style={{ display: "grid", gap: 6 }}>
					<h2 className="h2">Desain frame</h2>
					<DesignSection
						code={b.public_code}
						requests={design}
						templates={templates}
						revisionLimit={revisionLimit}
					/>
				</section>
			)}

			{canPay && (docsRes.data ?? []).length > 0 && (
				<section style={{ display: "grid", gap: 10 }}>
					<h2 className="h2">Dokumen</h2>
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

			<section style={{ display: "grid", gap: 6 }}>
				<h2 className="h2">Detail acara</h2>
				<p className="cap">Boleh diisi bertahap. Semua tersimpan otomatis.</p>
				<DetailForm
					code={b.public_code}
					initial={b.detail}
					categories={
						(typesRes.data ?? []) as Array<{ code: string; label: string }>
					}
					readOnly={!active}
				/>
			</section>

			<section style={{ display: "grid", gap: 6 }}>
				<h2 className="h2">Orang di booking ini</h2>
				<MembersCard
					code={b.public_code}
					members={members}
					meId={person.id}
					canManage={active && b.role !== "pemilik"}
				/>
			</section>

			{active && (
				<section style={{ display: "grid", gap: 6 }}>
					<h2 className="h2">Ubah jadwal atau batal</h2>
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

			{adminWa && (
				<a
					className="btn btn-block"
					href={`https://wa.me/${adminWa}?text=${encodeURIComponent(`Halo Tetra, saya mau tanya soal booking ${b.public_code}`)}`}
					target="_blank"
					rel="noopener"
				>
					Tanya admin lewat WhatsApp
				</a>
			)}
		</div>
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
