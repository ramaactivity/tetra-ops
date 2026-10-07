import { notFound, redirect } from "next/navigation";
import { MON3, PKG } from "@/components/portal/booking/content";
import {
	type BankInfo,
	DataAcara,
	DpCard,
} from "@/components/portal/booking/portal-view";
import {
	ChangeRequest,
	type OpenRequest,
} from "@/components/portal/change-request";
import { DashShell, type NavItem } from "@/components/portal/dash/shell";
import {
	ChatButton,
	GalleryCard,
	type NextStep,
	NextStepCard,
	PageHead,
	Section,
	StatGrid,
} from "@/components/portal/dash/ui";
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
import {
	daysUntil,
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
						"project_id, grand_total, total_paid, remaining_balance, due_date, design_status",
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
		design_status: string | null;
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
	// Event yang desainnya sudah di-ACC lewat Design Hub, atau acaranya sudah
	// lewat (mis. dashboard dibuka admin untuk event lama), tidak dibuatkan
	// permintaan desain portal — klien tidak disuruh memilih desain lagi.
	const hubApproved = ev?.design_status === "approved";
	if (
		b.status === "resmi" &&
		b.event_id &&
		!hubApproved &&
		b.event_date >= today
	) {
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
		hubApproved ||
		(design.length > 0 && design.every((r) => r.stage === "acc"));
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

	const DAY3 = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
	const [yy, mm, dd] = b.event_date.split("-").map(Number);
	const dShort = `${DAY3[new Date(Date.UTC(yy, mm - 1, dd)).getUTCDay()]}, ${dd} ${MON3[mm - 1]} ${yy}`;
	const pkgName =
		PKG[b.service_type]?.name ??
		product?.label ??
		PRODUCT_LABELS[b.service_type];
	const dpAmount = Math.min(dpMin, b.quoted_total);
	const resmi = b.status === "resmi";
	const draft = b.status === "draft";
	const missing = missingForDp(b.detail);
	const dpPending = !!pendingSub && pendingSub.kind === "dp";
	const days = daysUntil(b.event_date, today);
	const hasDocs = canPay && (docsRes.data ?? []).length > 0;
	const gal = (boothEvents ?? []).find((e) => e.gallery_url) ?? null;
	const photos = (boothEvents ?? []).reduce(
		(t, e) => t + (e.photo_count ?? 0),
		0,
	);
	const chat = adminWa
		? `https://wa.me/${adminWa}?text=${encodeURIComponent(`Halo Tetra, saya mau tanya soal booking ${b.public_code}`)}`
		: null;

	// Status desain (portal): brief → dikerjakan → menunggu_review/revisi → acc.
	const stages = design.map((r) => r.stage);
	const designLabel = !resmi
		? "Setelah DP"
		: designDone
			? "Disetujui"
			: stages.includes("menunggu_review")
				? "Cek draf"
				: stages.includes("brief")
					? "Pilih desain"
					: "Dikerjakan";

	const STATUS: Record<string, { label: string; bg: string }> = {
		draft: dpPending
			? { label: "Menunggu verifikasi DP", bg: "#D6EEF8" }
			: { label: "Draf · tanggal belum terkunci", bg: "#FCE3C6" },
		menunggu_konfirmasi: { label: "Menunggu verifikasi DP", bg: "#D6EEF8" },
		resmi: { label: "Resmi · tanggal terkunci", bg: "#D6F1EA" },
		kedaluwarsa: { label: "Kedaluwarsa", bg: "#F7D5CC" },
		batal: { label: "Dibatalkan", bg: "#F7D5CC" },
	};

	// Satu langkah berikutnya yang paling penting untuk klien.
	const next: NextStep = !active
		? {
				title:
					b.status === "batal"
						? "Booking ini dibatalkan"
						: "Booking ini kedaluwarsa",
				body: "Kalau masih ingin memakai Tetra, buat booking baru atau chat admin.",
				cta: { label: "Booking baru", href: "/booking" },
				tone: "coral",
				stage: 0,
			}
		: draft && !dpPending && missing.length && canPay
			? {
					title: `Lengkapi ${missing.length} data acara`,
					body: `${missing.join(", ")}. Setelah lengkap, tombol bayar DP aktif.`,
					cta: { label: "Lengkapi data", href: "#data-acara" },
					tone: "butter",
					stage: 1,
				}
			: draft && !dpPending && canPay
				? {
						title: `Bayar DP ${rp(dpAmount)}`,
						body: "Transfer ke rekening Tetra, lalu unggah buktinya. Tanggalmu terkunci setelah admin memverifikasi.",
						cta: { label: "Bayar DP", href: "#pembayaran" },
						tone: "butter",
						stage: 1,
					}
				: !resmi
					? {
							title: "Bukti DP sedang dicek admin",
							body: "Jadwalmu kami tahan selama pengecekan. Kabarnya dikirim lewat WhatsApp.",
							tone: "sky",
							stage: 1,
						}
					: !designDone &&
							(stages.includes("brief") || stages.includes("menunggu_review"))
						? {
								title: stages.includes("menunggu_review")
									? "Draf desain siap dicek"
									: "Pilih desain frame",
								body: stages.includes("menunggu_review")
									? "Setujui atau minta revisi dari halaman desain."
									: "Pilih template dari katalog atau ajukan desain custom.",
								cta: { label: "Buka desain", href: "#desain-frame" },
								tone: "butter",
								stage: 2,
							}
						: ev && sisa > 0 && canPay && !pendingSub
							? {
									title: `Pelunasan ${rp(sisa)}`,
									body: ev.due_date
										? `Paling lambat ${dateLong(ev.due_date)}.`
										: "Lunasi sebelum hari acara.",
									cta: { label: "Bayar pelunasan", href: "#pembayaran" },
									tone: "butter",
									stage: designDone ? 3 : 2,
								}
							: gal && days < 0
								? {
										title: "Galeri foto sudah siap",
										body: `${photos} foto dari acaramu bisa dilihat dan diunduh.`,
										cta: {
											label: "Buka galeri",
											href: gal.gallery_url as string,
											external: true,
										},
										tone: "mint",
										stage: 5,
									}
								: {
										title:
											days > 0
												? `Sampai jumpa ${days} hari lagi!`
												: days === 0
													? "Hari ini acaramu!"
													: "Terima kasih sudah memakai Tetra",
										body: !designDone
											? "Tim desain sedang menyiapkan frame-mu. Kami kabari lewat WhatsApp."
											: "Semua sudah siap. Kalau ada perubahan, chat admin, ya.",
										tone: "mint",
										stage: days <= 0 ? 4 : designDone ? 4 : 2,
									};

	const nav: NavItem[] = [
		{ href: "/akun", label: "Booking saya", icon: "list" },
		{ href: "#ringkasan", label: "Ringkasan", icon: "home", sub: true },
		...(canPay
			? [
					{
						href: "#pembayaran",
						label: "Pembayaran",
						icon: "pay" as const,
						sub: true,
					},
				]
			: []),
		{ href: "#data-acara", label: "Data acara", icon: "data", sub: true },
		{ href: "#desain-frame", label: "Desain frame", icon: "design", sub: true },
		{ href: "#galeri", label: "Galeri foto", icon: "gallery", sub: true },
		...(canPay
			? [
					{
						href: "#dokumen",
						label: "Dokumen",
						icon: "docs" as const,
						sub: true,
					},
				]
			: []),
		{ href: "#orang", label: "Orang & akses", icon: "people", sub: true },
		...(active
			? [
					{
						href: "#ubah",
						label: "Ubah jadwal",
						icon: "change" as const,
						sub: true,
					},
				]
			: []),
		{ href: "/booking", label: "Booking baru", icon: "plus" },
	];
	const title = b.detail.nama_acara || "Booking kamu";
	const muted = {
		margin: 0,
		fontSize: 14,
		lineHeight: 1.45,
		color: "#3A3936",
	} as const;

	return (
		<DashShell
			nav={nav}
			groupTitle={title}
			person={{ name: person.name, phone: person.phone }}
			chatUrl={chat}
		>
			<PageHead
				back={{ href: "/akun", label: "Booking saya" }}
				title={title}
				meta={`${dShort}${b.start_time ? ` · ${b.start_time.slice(0, 5)}` : ""}${b.detail.venue_nama ? ` · ${b.detail.venue_nama}` : ""}${b.venue_city ? `, ${b.venue_city}` : ""}`}
				chip={STATUS[b.status]}
				code={b.public_code}
				actions={chat ? <ChatButton href={chat} /> : undefined}
			/>

			<NextStepCard s={next} />

			<StatGrid
				items={[
					{
						k: "cal",
						label: "Hari acara",
						value:
							days > 0
								? `${days} hari lagi`
								: days === 0
									? "Hari ini"
									: "Selesai",
						sub: `${dShort} · ${pkgName} · ${b.package_hours} jam`,
						under: "#CEC8F6",
						href: "#ringkasan",
					},
					{
						k: "pay",
						label: "Pembayaran",
						value:
							resmi && ev
								? sisa > 0
									? `Sisa ${rp(sisa)}`
									: "Lunas"
								: `DP ${rp(dpAmount)}`,
						sub:
							resmi && ev
								? `Total ${rp(total)}`
								: dpPending
									? "Bukti sedang dicek"
									: "Belum dibayar",
						under: "#F8D98B",
						href: "#pembayaran",
					},
					{
						k: "design",
						label: "Desain frame",
						value: designLabel,
						sub: !resmi
							? "Terbuka setelah DP"
							: design.length
								? `${design.length} desain`
								: designDone
									? "Siap dipakai di booth"
									: "Disiapkan tim desain",
						under: "#FCE3C6",
						href: "#desain-frame",
					},
					{
						k: "gallery",
						label: "Galeri foto",
						value: gal ? `${photos} foto` : "Setelah acara",
						sub: gal ? "Siap dilihat" : "Foto booth muncul di sini",
						under: "#D6EEF8",
						href: "#galeri",
					},
				]}
			/>

			<div className="dash-cols">
				<div
					style={{
						display: "flex",
						flexDirection: "column",
						gap: 20,
						minWidth: 0,
					}}
				>
					{canPay && (
						<Section
							id="pembayaran"
							title="Pembayaran"
							bare={draft && !dpPending}
						>
							{draft && !dpPending ? (
								<div className="bk" style={{ background: "transparent" }}>
									<DpCard
										code={b.public_code}
										dp={dpAmount}
										bank={(banks[0] as BankInfo) ?? null}
										gateOpen={missing.length === 0}
										gateLeft={missing.length}
										sent={false}
										rejectReason={lastRejected?.reject_reason ?? null}
									/>
								</div>
							) : (
								<>
									<div style={{ display: "grid", gap: 6 }}>
										<Row
											label={ev ? "Total tagihan" : "Perkiraan total"}
											value={rp(total)}
										/>
										{ev && (
											<Row
												label="Sudah dibayar"
												value={rp(Number(ev.total_paid))}
											/>
										)}
										{ev && (
											<Row
												label="Sisa"
												value={rp(Number(ev.remaining_balance))}
												strong
											/>
										)}
										{ev?.due_date && Number(ev.remaining_balance) > 0 && (
											<p style={muted}>
												Pelunasan paling lambat {dateLong(ev.due_date)}.
											</p>
										)}
									</div>
									{pendingSub && (
										<div
											className="tp"
											style={{ minHeight: 0, background: "transparent" }}
										>
											<div
												className="note"
												style={{ background: "var(--sky)" }}
											>
												Bukti {pendingSub.kind === "dp" ? "DP" : "pembayaran"}{" "}
												{rp(Number(pendingSub.amount))} sedang dicek admin.
												{pendingSub.kind === "dp"
													? " Jadwal kamu kami tahan selama itu."
													: ""}{" "}
												Kabarnya kami kirim lewat WhatsApp.
											</div>
										</div>
									)}
									{resmi && ev && sisa > 0 && !pendingSub && (
										<div
											className="tp"
											style={{
												minHeight: 0,
												background: "transparent",
												display: "grid",
												gap: 12,
											}}
										>
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
								</>
							)}
						</Section>
					)}

					<Section id="data-acara" title="Data acara" bare>
						<DataAcara
							code={b.public_code}
							detail={b.detail}
							readOnly={!active}
							stageGroups={modulesFor(b.service_type).includes("photo_stage")}
							beforeDp={draft && canPay}
						/>
					</Section>
				</div>

				<div
					style={{
						display: "flex",
						flexDirection: "column",
						gap: 20,
						minWidth: 0,
					}}
				>
					<Section
						id="desain-frame"
						title="Desain frame"
						bare={design.length > 0}
					>
						{design.length > 0 ? (
							<div
								className="tp"
								style={{ minHeight: 0, background: "transparent" }}
							>
								<DesignSection
									code={b.public_code}
									requests={design}
									templates={templates}
									revisionLimit={revisionLimit}
								/>
							</div>
						) : (
							<p style={muted}>
								{!resmi
									? "Terbuka setelah DP diterima. Kamu bisa memilih template dari katalog atau mengajukan desain custom, lalu menyetujui hasilnya di sini."
									: designDone
										? "Desain frame acara ini sudah disetujui."
										: "Tim desain Tetra sedang menyiapkan desain frame-mu. Kabarnya dikirim lewat WhatsApp."}
							</p>
						)}
					</Section>

					<Section id="galeri" title="Galeri foto">
						{gal ? (
							<GalleryCard ev={gal} today={today} />
						) : (
							<p style={muted}>
								{galleryOn && boothEvents === null
									? "Galeri belum bisa dibuka, coba lagi nanti."
									: "Semua foto dari booth bisa dilihat dan diunduh di sini setelah acara."}
							</p>
						)}
					</Section>

					{canPay && (
						<Section id="dokumen" title="Dokumen">
							{hasDocs ? (
								<div style={{ display: "flex", flexDirection: "column" }}>
									{(docsRes.data ?? []).map((d, i, a) => (
										<a
											key={d.id}
											href={`/api/pdf/document/${d.id}?${signedPdfQuery(d.id, 3600) ?? ""}&download=1`}
											style={{
												display: "flex",
												justifyContent: "space-between",
												gap: 12,
												padding: "10px 0",
												borderBottom:
													i < a.length - 1 ? "1.5px dashed #D6D3CC" : "0",
												textDecoration: "none",
											}}
										>
											<span style={{ fontWeight: 700, fontSize: 14 }}>
												{DOC_LABEL[d.doc_type] ?? d.doc_type}
											</span>
											<span
												className="mono"
												style={{ fontSize: 12, color: "#5F5E5A" }}
											>
												{d.doc_number} ↓
											</span>
										</a>
									))}
								</div>
							) : (
								<p style={muted}>
									Invoice dan kuitansi muncul di sini setelah DP diterima.
								</p>
							)}
						</Section>
					)}

					<Section id="orang" title="Orang di booking ini" bare>
						<div
							className="tp"
							style={{ minHeight: 0, background: "transparent" }}
						>
							<MembersCard
								code={b.public_code}
								members={members}
								meId={person.id}
								canManage={active && b.role !== "pemilik"}
							/>
						</div>
					</Section>

					{active && (
						<Section id="ubah" title="Ubah jadwal atau batal" bare>
							<div
								className="tp"
								style={{ minHeight: 0, background: "transparent" }}
							>
								<ChangeRequest
									code={b.public_code}
									isDraft={draft}
									canCancel={canPay}
									refundEstimate={ev ? refundEstimate(beyondDp, days) : null}
									openRequest={(requestRes.data as OpenRequest | null) ?? null}
								/>
							</div>
						</Section>
					)}
				</div>
			</div>
		</DashShell>
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
				fontSize: 14,
				fontWeight: strong ? 800 : 600,
			}}
		>
			<span>{label}</span>
			<span className="mono">{value}</span>
		</div>
	);
}
