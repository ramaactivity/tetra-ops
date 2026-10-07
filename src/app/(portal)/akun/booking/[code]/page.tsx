import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
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
	btn,
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

const TABS = [
	"ringkasan",
	"pembayaran",
	"data",
	"desain",
	"galeri",
	"dokumen",
	"orang",
	"ubah",
] as const;
type Tab = (typeof TABS)[number];

export default async function BookingDetailPage({
	params,
	searchParams,
}: {
	params: Promise<{ code: string }>;
	searchParams: Promise<{ tab?: string }>;
}) {
	const sp = await searchParams;
	const tab: Tab = (TABS as readonly string[]).includes(sp.tab ?? "")
		? (sp.tab as Tab)
		: "ringkasan";
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
		// Acara sudah lewat tanpa permintaan desain portal (event lama buatan admin).
		(b.event_date < today && design.length === 0) ||
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

	const base = `/akun/booking/${b.public_code}`;
	// Ubah jadwal/batal hanya untuk acara yang belum lewat.
	const canChange = active && days >= 0;
	const to = (t: Tab) => (t === "ringkasan" ? base : `${base}?tab=${t}`);

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
					cta: { label: "Lengkapi data", href: to("data") },
					tone: "butter",
					stage: 1,
				}
			: draft && !dpPending && canPay
				? {
						title: `Bayar DP ${rp(dpAmount)}`,
						body: "Transfer ke rekening Tetra, lalu unggah buktinya. Tanggalmu terkunci setelah admin memverifikasi.",
						cta: { label: "Bayar DP", href: to("pembayaran") },
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
								cta: { label: "Buka desain", href: to("desain") },
								tone: "butter",
								stage: 2,
							}
						: ev && sisa > 0 && canPay && !pendingSub
							? {
									title: `Pelunasan ${rp(sisa)}`,
									body: ev.due_date
										? `Paling lambat ${dateLong(ev.due_date)}.`
										: "Lunasi sebelum hari acara.",
									cta: { label: "Bayar pelunasan", href: to("pembayaran") },
									tone: "butter",
									stage: designDone ? 3 : 2,
								}
							: gal && days < 0
								? {
										title: "Galeri foto sudah siap",
										body: `${photos} foto dari acaramu bisa dilihat dan diunduh.`,
										cta: { label: "Lihat galeri", href: to("galeri") },
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

	const payAlert =
		canPay &&
		active &&
		((draft && !dpPending && missing.length === 0) ||
			(resmi && !!ev && sisa > 0 && !pendingSub));
	const designAlert =
		resmi &&
		!designDone &&
		(stages.includes("brief") || stages.includes("menunggu_review"));
	const nav: NavItem[] = [
		{ href: "/akun", label: "Booking saya", icon: "list" },
		{
			href: to("ringkasan"),
			label: "Ringkasan",
			icon: "home",
			sub: true,
			current: tab === "ringkasan",
		},
		...(canPay
			? [
					{
						href: to("pembayaran"),
						label: "Pembayaran",
						icon: "pay" as const,
						sub: true,
						current: tab === "pembayaran",
						alert: payAlert,
					},
				]
			: []),
		{
			href: to("data"),
			label: "Data acara",
			icon: "data",
			sub: true,
			current: tab === "data",
			...(draft && canPay
				? { badge: `${3 - missing.length}/3`, alert: missing.length > 0 }
				: {}),
		},
		{
			href: to("desain"),
			label: "Desain frame",
			icon: "design",
			sub: true,
			current: tab === "desain",
			alert: designAlert,
		},
		{
			href: to("galeri"),
			label: "Galeri foto",
			icon: "gallery",
			sub: true,
			current: tab === "galeri",
			...(gal ? { badge: String(photos) } : {}),
		},
		...(canPay
			? [
					{
						href: to("dokumen"),
						label: "Dokumen",
						icon: "docs" as const,
						sub: true,
						current: tab === "dokumen",
						...(hasDocs ? { badge: String((docsRes.data ?? []).length) } : {}),
					},
				]
			: []),
		{
			href: to("orang"),
			label: "Orang & akses",
			icon: "people",
			sub: true,
			current: tab === "orang",
			badge: String(members.length),
		},
		...(canChange
			? [
					{
						href: to("ubah"),
						label: "Ubah jadwal",
						icon: "change" as const,
						sub: true,
						current: tab === "ubah",
					},
				]
			: []),
		{ href: "/booking", label: "Booking baru", icon: "plus" },
	];
	const title = b.detail.nama_acara || "Booking kamu";
	const muted = {
		margin: 0,
		fontSize: 14,
		lineHeight: 1.5,
		color: "#3A3936",
	} as const;
	const meta = `${dShort}${b.start_time ? ` · ${b.start_time.slice(0, 5)}` : ""}${b.detail.venue_nama ? ` · ${b.detail.venue_nama}` : ""}${b.venue_city ? `, ${b.venue_city}` : ""}`;
	const TAB_TITLE: Record<Tab, string> = {
		ringkasan: title,
		pembayaran: "Pembayaran",
		data: "Data acara",
		desain: "Desain frame",
		galeri: "Galeri foto",
		dokumen: "Dokumen",
		orang: "Orang & akses",
		ubah: "Ubah jadwal atau batal",
	};

	// Ringkasan isi booking (detail acara).
	const fmtLabel =
		b.frame_size === "2R"
			? "Strip 2R"
			: b.frame_size === "polaroid"
				? "Polaroid"
				: b.frame_size === "4R"
					? "4R"
					: null;
	const addonList = (
		(b.addons ?? []) as Array<{ addon_id: string; quantity: number }>
	)
		.map((a) => {
			const row = catalog.addons.find((x) => x.id === a.addon_id);
			return row
				? `${row.name}${a.quantity > 1 ? ` ×${a.quantity}` : ""}`
				: null;
		})
		.filter(Boolean)
		.join(", ");
	const backdrop =
		b.detail.backdrop === "tetra"
			? `Kain Tetra${b.detail.backdrop_warna ? ` · ${b.detail.backdrop_warna}` : ""}`
			: b.detail.backdrop === "client"
				? "Dari klien / dekorasi venue"
				: b.detail.backdrop === "later"
					? "Belum ditentukan"
					: null;
	const facts: Array<[string, ReactNode]> = [
		[
			"Tanggal & jam",
			`${dShort}${b.start_time ? ` · ${b.start_time.slice(0, 5)}${b.end_time ? `–${b.end_time.slice(0, 5)}` : ""}` : " · jam menyusul"}`,
		],
		[
			"Lokasi",
			<>
				{[b.detail.venue_nama || "Venue menyusul", b.venue_city]
					.filter(Boolean)
					.join(", ")}
				{b.detail.maps_url && (
					<>
						{" · "}
						<a
							href={b.detail.maps_url}
							target="_blank"
							rel="noopener noreferrer"
							style={{ fontWeight: 700 }}
						>
							Maps
						</a>
					</>
				)}
			</>,
		],
		[
			"Paket",
			`${pkgName} · ${b.package_hours} jam${b.unit_count > 1 ? ` · ${b.unit_count} booth` : ""}${fmtLabel ? ` · ${fmtLabel}` : ""}`,
		],
		...(backdrop
			? ([["Backdrop", backdrop]] as Array<[string, ReactNode]>)
			: []),
		["Tambahan", addonList || "Tidak ada"],
		["Pemilik acara", b.detail.pemilik_nama || "—"],
	];

	const billRows = (
		<div style={{ display: "grid", gap: 8 }}>
			<Row label={ev ? "Total tagihan" : "Perkiraan total"} value={rp(total)} />
			{ev && <Row label="Sudah dibayar" value={rp(Number(ev.total_paid))} />}
			{ev ? (
				<Row label="Sisa" value={rp(Number(ev.remaining_balance))} strong />
			) : (
				<Row label="DP minimal" value={rp(dpAmount)} strong />
			)}
			{ev?.due_date && Number(ev.remaining_balance) > 0 && (
				<p style={{ ...muted, fontSize: 13 }}>
					Pelunasan paling lambat {dateLong(ev.due_date)}.
				</p>
			)}
		</div>
	);
	// Riwayat: pembayaran tercatat di Ops (termasuk yang dicatat admin) +
	// bukti portal yang masih dicek / ditolak.
	const paid = b.event_id
		? ((
				await admin
					.from("payments")
					.select("amount, payment_date, payment_type")
					.eq("event_id", b.event_id)
					.eq("is_reversed", false)
					.order("payment_date")
			).data ?? [])
		: [];
	const historyRows = [
		...paid.map((x) => ({
			kind: String(x.payment_type),
			amount: Number(x.amount),
			date: String(x.payment_date).slice(0, 10),
			status: "diterima",
			reason: null as string | null,
		})),
		...subs
			.filter((x) => x.status !== "diterima")
			.map((x) => ({
				kind: String(x.kind),
				amount: Number(x.amount),
				date: String(x.created_at).slice(0, 10),
				status: String(x.status),
				reason: x.reject_reason as string | null,
			})),
	].sort((a, z) => a.date.localeCompare(z.date));
	const SUB_STATUS: Record<string, [string, string]> = {
		menunggu: ["Dicek admin", "#D6EEF8"],
		diterima: ["Diterima", "#D6F1EA"],
		ditolak: ["Ditolak", "#F7D5CC"],
	};
	const KIND: Record<string, string> = {
		dp: "DP",
		pelunasan: "Pelunasan",
		partial: "Cicilan",
		full: "Pembayaran penuh",
	};
	const history = historyRows.length ? (
		<div style={{ display: "flex", flexDirection: "column" }}>
			{historyRows.map((x, i) => {
				const st = SUB_STATUS[x.status] ?? [x.status, "#fff"];
				return (
					<div
						key={`${x.date}-${x.kind}-${x.amount}-${x.status}`}
						style={{
							display: "flex",
							alignItems: "center",
							gap: 12,
							padding: "10px 0",
							borderBottom:
								i < historyRows.length - 1 ? "1.5px dashed #D6D3CC" : "0",
						}}
					>
						<div style={{ flex: 1, minWidth: 0 }}>
							<div style={{ fontSize: 14, fontWeight: 700 }}>
								{KIND[x.kind] ?? "Pembayaran"}
							</div>
							<div style={{ fontSize: 12, color: "#5F5E5A" }}>
								{dateLong(x.date)}
								{x.status === "ditolak" && x.reason ? ` · ${x.reason}` : ""}
							</div>
						</div>
						<span className="mono" style={{ fontSize: 14, fontWeight: 600 }}>
							{rp(x.amount)}
						</span>
						<span
							style={{
								borderRadius: 999,
								border: "1.5px solid #1D1D1B",
								background: st[1],
								padding: "2px 10px",
								fontSize: 12,
								fontWeight: 700,
								whiteSpace: "nowrap",
							}}
						>
							{st[0]}
						</span>
					</div>
				);
			})}
		</div>
	) : (
		<p style={muted}>Belum ada pembayaran.</p>
	);

	const payAction =
		draft && !dpPending ? (
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
				{missing.length > 0 && (
					<a
						href={to("data")}
						style={{
							display: "inline-block",
							marginTop: 10,
							fontSize: 14,
							fontWeight: 700,
						}}
					>
						Lengkapi {missing.length} data acara →
					</a>
				)}
			</div>
		) : pendingSub ? (
			<Section id="status-bayar" title="Sedang dicek">
				<p style={muted}>
					Bukti {pendingSub.kind === "dp" ? "DP" : "pembayaran"}{" "}
					<b className="mono">{rp(Number(pendingSub.amount))}</b> sedang dicek
					admin.
					{pendingSub.kind === "dp"
						? " Jadwal kamu kami tahan selama itu."
						: ""}{" "}
					Kabarnya kami kirim lewat WhatsApp.
				</p>
			</Section>
		) : resmi && ev && sisa > 0 ? (
			<Section id="pelunasan" title={`Bayar pelunasan ${rp(sisa)}`}>
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
			</Section>
		) : (
			<Section
				id="lunas"
				title={ev && sisa <= 0 ? "Sudah lunas" : "Pembayaran"}
			>
				<p style={muted}>
					{ev && sisa <= 0
						? "Terima kasih, tagihan acara ini sudah lunas."
						: "Tidak ada tagihan yang perlu dibayar sekarang."}
				</p>
			</Section>
		);

	const helpCard = (
		<Section id="bantuan" title="Butuh bantuan?">
			<p style={muted}>
				Tanya apa saja soal booking ini ke admin Tetra lewat WhatsApp.
			</p>
			<div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
				{chat && <ChatButton href={chat} />}
				{canChange && (
					<a href={to("ubah")} style={btn("#fff")}>
						Ubah jadwal
					</a>
				)}
			</div>
		</Section>
	);

	let body: ReactNode;
	switch (tab) {
		case "pembayaran":
			body = (
				<div className="dash-cols">
					<div style={col}>{payAction}</div>
					<div style={col}>
						<Section id="tagihan" title="Tagihan">
							{billRows}
						</Section>
						<Section id="riwayat" title="Riwayat pembayaran">
							{history}
						</Section>
					</div>
				</div>
			);
			break;
		case "data":
			body = (
				<div style={{ maxWidth: 760 }}>
					<DataAcara
						code={b.public_code}
						detail={b.detail}
						readOnly={!active}
						stageGroups={modulesFor(b.service_type).includes("photo_stage")}
						beforeDp={draft && canPay}
					/>
				</div>
			);
			break;
		case "desain":
			body =
				design.length > 0 ? (
					<div
						className="tp"
						style={{ minHeight: 0, background: "transparent", maxWidth: 860 }}
					>
						<DesignSection
							code={b.public_code}
							requests={design}
							templates={templates}
							revisionLimit={revisionLimit}
						/>
					</div>
				) : (
					<div className="dash-cols">
						<Section
							id="desain-status"
							title={
								!resmi
									? "Terbuka setelah DP"
									: designDone
										? "Desain sudah disetujui"
										: "Sedang disiapkan"
							}
						>
							<p style={muted}>
								{!resmi
									? "Setelah DP diterima, halaman ini terbuka. Kamu bisa memilih template dari katalog atau mengajukan desain custom."
									: designDone
										? "Desain frame acara ini sudah disetujui dan siap dipakai di booth."
										: "Tim desain Tetra sedang menyiapkan desain frame-mu. Kabarnya dikirim lewat WhatsApp."}
							</p>
						</Section>
						<Section id="desain-cara" title="Cara kerjanya">
							<Steps
								items={[
									[
										"Pilih template atau ajukan custom",
										"Ceritakan tema, warna, dan kirim logo atau referensi.",
									],
									[
										"Tim desain membuat draf",
										"Nama acara dan tanggal otomatis masuk ke frame.",
									],
									[
										`Setujui atau minta revisi (maks ${revisionLimit}×)`,
										"Setelah disetujui, frame langsung dipasang di booth.",
									],
								]}
							/>
						</Section>
					</div>
				);
			break;
		case "galeri":
			body = (
				<div className="dash-cols">
					<Section id="galeri-isi" title={gal ? gal.name : "Belum ada foto"}>
						{gal ? (
							<GalleryCard ev={gal} today={today} />
						) : (
							<p style={muted}>
								{galleryOn && boothEvents === null
									? "Galeri belum bisa dibuka, coba lagi nanti."
									: "Semua foto dari booth muncul di sini setelah acara. Kamu bisa melihat, memfavoritkan, dan mengunduh semuanya."}
							</p>
						)}
					</Section>
					<Section id="galeri-info" title="Tentang galeri">
						<Steps
							items={[
								[
									"Foto masuk otomatis",
									"Setiap sesi di booth langsung terunggah ke galeri.",
								],
								[
									"Lihat & unduh semua",
									"Filter strip, foto asli, atau animasi, lalu unduh sekaligus (ZIP).",
								],
								[
									"Tersedia ±90 hari",
									"Simpan fotomu sebelum masa galeri berakhir.",
								],
							]}
						/>
					</Section>
				</div>
			);
			break;
		case "dokumen":
			body = (
				<Section
					id="dokumen-list"
					title={hasDocs ? "Dokumen booking" : "Belum ada dokumen"}
				>
					{hasDocs ? (
						<div style={{ display: "flex", flexDirection: "column" }}>
							{(docsRes.data ?? []).map((d, i, a) => (
								<a
									key={d.id}
									href={`/api/pdf/document/${d.id}?${signedPdfQuery(d.id, 3600) ?? ""}&download=1`}
									style={{
										display: "flex",
										alignItems: "center",
										justifyContent: "space-between",
										gap: 12,
										padding: "12px 0",
										borderBottom:
											i < a.length - 1 ? "1.5px dashed #D6D3CC" : "0",
										textDecoration: "none",
									}}
								>
									<span style={{ fontWeight: 700, fontSize: 15 }}>
										{DOC_LABEL[d.doc_type] ?? d.doc_type}
									</span>
									<span style={btn("#fff")}>
										<span className="mono" style={{ fontSize: 12 }}>
											{d.doc_number}
										</span>
										Unduh
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
			);
			break;
		case "orang":
			body = (
				<div className="dash-cols">
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
					<Section id="peran" title="Siapa bisa apa">
						<Steps
							items={[
								[
									"Pemesan",
									"Melihat tagihan, membayar, dan mengatur semua isi booking.",
								],
								[
									"Pemilik acara",
									"Melengkapi data acara dan memilih desain, tanpa melihat tagihan.",
								],
								["WO / vendor", "Mengurus booking untuk kliennya."],
							]}
						/>
					</Section>
				</div>
			);
			break;
		case "ubah":
			body = canChange ? (
				<div className="dash-cols">
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
					<Section id="kebijakan" title="Kebijakan singkat">
						<Steps
							items={[
								[
									"Pindah tanggal",
									"Gratis, diajukan paling lambat 30 hari sebelum acara.",
								],
								[
									"Batal",
									"DP tidak kembali. Pembayaran di luar DP kembali penuh (>14 hari), 50% (3–14 hari), atau tidak kembali (<3 hari).",
								],
								["Diproses admin", "Kami konfirmasi lewat WhatsApp."],
							]}
						/>
						<a
							href="https://tetraphoto.com/kebijakan-refund"
							target="_blank"
							rel="noopener noreferrer"
							style={{ fontSize: 14, fontWeight: 700 }}
						>
							Baca kebijakan lengkap
						</a>
					</Section>
				</div>
			) : (
				<Section id="ubah-tutup" title="Tidak bisa diubah">
					<p style={muted}>
						{active
							? "Acara sudah lewat, jadwal tidak bisa diubah lagi."
							: "Booking ini sudah tidak aktif."}
					</p>
				</Section>
			);
			break;
		default:
			body = (
				<>
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
								sub: dShort,
								under: "#CEC8F6",
								href: to("data"),
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
								href: to("pembayaran"),
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
								href: to("desain"),
							},
							{
								k: "gallery",
								label: "Galeri foto",
								value: gal ? `${photos} foto` : "Setelah acara",
								sub: gal ? "Siap dilihat" : "Foto booth muncul di sini",
								under: "#D6EEF8",
								href: to("galeri"),
							},
						]}
					/>
					<div className="dash-cols">
						<Section
							id="detail"
							title="Detail acara"
							right={
								active ? (
									<a
										href={to("data")}
										style={{ fontSize: 13, fontWeight: 700 }}
									>
										Lengkapi data →
									</a>
								) : undefined
							}
						>
							<dl
								style={{ margin: 0, display: "flex", flexDirection: "column" }}
							>
								{facts.map(([k, v], i) => (
									<div
										key={k}
										style={{
											display: "grid",
											gridTemplateColumns: "minmax(110px, 34%) 1fr",
											gap: 12,
											padding: "10px 0",
											borderBottom:
												i < facts.length - 1 ? "1.5px dashed #D6D3CC" : "0",
											fontSize: 14,
										}}
									>
										<dt style={{ color: "#5F5E5A" }}>{k}</dt>
										<dd style={{ margin: 0, fontWeight: 700 }}>{v}</dd>
									</div>
								))}
							</dl>
						</Section>
						<div style={col}>
							{canPay && (
								<Section
									id="ringkas-tagihan"
									title="Tagihan"
									right={
										<a
											href={to("pembayaran")}
											style={{ fontSize: 13, fontWeight: 700 }}
										>
											Pembayaran →
										</a>
									}
								>
									{billRows}
								</Section>
							)}
							{helpCard}
						</div>
					</div>
				</>
			);
	}

	return (
		<DashShell
			nav={nav}
			groupTitle={title}
			person={{ name: person.name, phone: person.phone }}
			chatUrl={chat}
		>
			{tab === "ringkasan" ? (
				<PageHead
					back={{ href: "/akun", label: "Booking saya" }}
					title={title}
					meta={meta}
					chip={STATUS[b.status]}
					code={b.public_code}
					actions={chat ? <ChatButton href={chat} /> : undefined}
				/>
			) : (
				<PageHead
					back={{ href: to("ringkasan"), label: "Ringkasan" }}
					title={TAB_TITLE[tab]}
					meta={`${title} · ${dShort}`}
					chip={STATUS[b.status]}
				/>
			)}
			{body}
		</DashShell>
	);
}

const col = {
	display: "flex",
	flexDirection: "column",
	gap: 20,
	minWidth: 0,
} as const;

function Steps({ items }: { items: Array<[string, string]> }) {
	return (
		<ol
			style={{
				listStyle: "none",
				margin: 0,
				padding: 0,
				display: "flex",
				flexDirection: "column",
			}}
		>
			{items.map(([t, d], i) => (
				<li key={t} style={{ display: "flex", gap: 12 }}>
					<div
						style={{
							display: "flex",
							flexDirection: "column",
							alignItems: "center",
							flex: "none",
						}}
					>
						<span
							className="mono"
							style={{
								width: 26,
								height: 26,
								borderRadius: 13,
								border: "1.5px solid #1D1D1B",
								background: i === 0 ? "#F8D98B" : "#fff",
								fontSize: 12,
								fontWeight: 600,
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
							}}
						>
							{i + 1}
						</span>
						{i < items.length - 1 && (
							<span
								style={{
									flex: 1,
									borderLeft: "1.5px dashed #1D1D1B",
									minHeight: 10,
								}}
							/>
						)}
					</div>
					<div style={{ paddingBottom: 12 }}>
						<div style={{ fontSize: 14, fontWeight: 800 }}>{t}</div>
						<div style={{ fontSize: 13, lineHeight: 1.45, color: "#3A3936" }}>
							{d}
						</div>
					</div>
				</li>
			))}
		</ol>
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
