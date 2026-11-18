import { HeartHandshake, Repeat, UserMinus, Users } from "lucide-react";
import type { ReactNode } from "react";
import { Container } from "@/components/layout/container";
import { SectionHeader } from "@/components/layout/section-header";
import { BarList, ChartCard } from "@/components/leads/analytics-charts";
import { FollowupButton } from "@/components/leads/followup-button";
import { LeadsTabs } from "@/components/leads/leads-tabs";
import { KpiRow } from "@/components/operations/_shared/kpi-row";
import { KpiCard } from "@/components/operations/kpi-card";
import { getCurrentUser } from "@/lib/auth/get-user";
import { shiftISODate, timeAgo, todayWIB } from "@/lib/dates";
import { loadFollowupsByNomor, loadRecentSapaan } from "@/lib/leads/contacts";
import {
	BULAN_HILANG,
	BULAN_RAWAT,
	type EventRetensi,
	KATEGORI_B2B,
	type KlienRetensi,
	kunciKlien,
	ringkasRetensi,
} from "@/lib/retensi";
import { fetchAllResult } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const LABEL_KATEGORI: Record<string, string> = {
	corporate: "Korporat",
	gathering: "Gathering",
	instansi: "Instansi",
	event: "Event",
	wisuda: "Wisuda",
};

const LABEL_STATUS: Record<KlienRetensi["status"], string> = {
	setia: "Setia (3+ event)",
	kembali: "Kembali (2 event)",
	baru: "Baru sekali",
	menunggu: "Perlu dirawat",
	hilang: "Menghilang",
};

const WARNA_STATUS: Record<KlienRetensi["status"], string> = {
	setia: "bg-emerald-500",
	kembali: "bg-sky-500",
	baru: "bg-foreground/40",
	menunggu: "bg-amber-500",
	hilang: "bg-rose-500",
};

function tanggal(iso: string) {
	return new Date(`${iso}T00:00:00+07:00`).toLocaleDateString("id-ID", {
		day: "numeric",
		month: "short",
		year: "numeric",
	});
}

type EventKlien = EventRetensi & {
	event_title: string | null;
	venue_name: string | null;
	venue_city: string | null;
};

/** Hari ke depan untuk "acara tahunan mendekat". */
const JENDELA_TAHUNAN = 45;

function TabelKlien({
	rows,
	kosong,
	aksi,
}: {
	rows: KlienRetensi[];
	kosong: string;
	/** Kolom tindak lanjut (owner): tombol Follow-up + catatan sapaan. */
	aksi?: (k: KlienRetensi) => ReactNode;
}) {
	if (!rows.length)
		return (
			<p className="py-6 text-center text-[13px] text-muted-foreground">
				{kosong}
			</p>
		);
	return (
		<div className="-mx-1 overflow-x-auto">
			<table className="w-full text-[13px]">
				<thead>
					<tr className="text-left text-[12px] text-muted-foreground">
						<th className="px-1 py-1.5 font-medium">Klien</th>
						{/* HP: kategori pindah ke bawah nama supaya kolom Follow-up muat. */}
						<th className="hidden px-1 py-1.5 font-medium sm:table-cell">
							Kategori
						</th>
						<th className="hidden px-1 py-1.5 text-right font-medium sm:table-cell">
							Event
						</th>
						<th className="px-1 py-1.5 font-medium">Terakhir</th>
						{aksi ? <th className="px-1 py-1.5" /> : null}
					</tr>
				</thead>
				<tbody>
					{rows.map((k) => (
						<tr key={k.kunci} className="border-t border-border/60">
							<td className="px-1 py-2">
								<span className="font-medium text-foreground">
									{k.nama || "-"}
								</span>
								<span className="block text-[12px] text-muted-foreground">
									{k.pic}
									<span className="sm:hidden">
										{k.pic ? " · " : ""}
										{LABEL_KATEGORI[k.kategori] ?? k.kategori}
									</span>
								</span>
							</td>
							<td className="hidden px-1 py-2 sm:table-cell">
								{LABEL_KATEGORI[k.kategori] ?? k.kategori}
							</td>
							<td className="tabular hidden px-1 py-2 text-right sm:table-cell">
								{k.jumlah_event}
							</td>
							<td className="px-1 py-2 whitespace-nowrap">
								{tanggal(k.terakhir)}
								<span className="block text-[12px] text-muted-foreground">
									{k.mendatang
										? "ada jadwal"
										: `${k.bulan_sejak_terakhir} bln lalu`}
								</span>
							</td>
							{aksi ? (
								<td className="px-1 py-2 text-right align-top">{aksi(k)}</td>
							) : null}
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

export default async function RetensiPage() {
	const supabase = await createClient();
	const me = await getCurrentUser();
	const canManage =
		me?.profile.role === "owner" || me?.profile.role === "super_admin";
	const today = todayWIB();
	const [{ data, error }, followups, sapaan] = await Promise.all([
		fetchAllResult<EventKlien>(
			(from, to) =>
				supabase
					.from("events")
					.select(
						"client_wa, client_org, client_name, pic_name, event_category, event_date, status, channel, event_title, venue_name, venue_city",
					)
					.in("event_category", [...KATEGORI_B2B])
					.is("deleted_at", null)
					.order("id")
					.range(from, to),
			"retensi acara",
		),
		canManage ? loadFollowupsByNomor(supabase) : new Map(),
		canManage ? loadRecentSapaan(supabase) : new Map<string, string>(),
	]);
	if (error) throw new Error(error.message);
	const r = ringkasRetensi(data ?? [], today);

	// Acara terakhir per klien → bahan konteks follow-up untuk Hermes.
	const acaraTerakhir = new Map<string, EventKlien>();
	for (const e of data ?? []) {
		const k = kunciKlien(e);
		if (!k || !e.event_date || e.status === "cancelled") continue;
		const cur = acaraTerakhir.get(k);
		if (!cur || String(cur.event_date) < e.event_date) acaraTerakhir.set(k, e);
	}

	// Acara tahunan: tahun lalu ada acara di 45 hari ke depan, tahun ini belum ada jadwal.
	const dari = shiftISODate(today, -365);
	const sampai = shiftISODate(today, -365 + JENDELA_TAHUNAN);
	const kunciTahunan = new Set(
		(data ?? [])
			.filter(
				(e) =>
					e.status !== "cancelled" &&
					e.channel !== "vendor" &&
					e.event_date &&
					e.event_date >= dari &&
					e.event_date <= sampai,
			)
			.map((e) => kunciKlien(e))
			.filter(Boolean),
	);
	const tahunan = r.klien
		.filter((k) => kunciTahunan.has(k.kunci) && !k.mendatang)
		.sort((a, b) => a.terakhir.slice(5).localeCompare(b.terakhir.slice(5)));

	const aksi = (jenis: "rawat" | "hilang" | "tahunan") =>
		canManage
			? (k: KlienRetensi) => {
					if (!k.wa?.startsWith("628"))
						return (
							<span className="text-[11.5px] text-muted-foreground">
								tanpa nomor HP
							</span>
						);
					const e = acaraTerakhir.get(k.kunci);
					const tgl = tanggal(k.terakhir);
					const alasan =
						jenis === "tahunan"
							? `acara tahunan: tahun lalu ${tgl}, tahun ini belum ada jadwal`
							: jenis === "hilang"
								? `klien lama, tidak memakai Tetra ${k.bulan_sejak_terakhir} bulan sejak ${tgl}`
								: `klien lama, baru sekali memakai Tetra (${tgl}, ${k.bulan_sejak_terakhir} bulan lalu), belum ada kabar`;
					const konteks = [
						`Klien ${LABEL_KATEGORI[k.kategori] ?? k.kategori} ${k.nama}${k.pic ? `, PIC ${k.pic}` : ""}.`,
						`Acara terakhir: ${e?.event_title ?? "-"} ${tgl}${e?.venue_name ? ` di ${e.venue_name}` : ""}${e?.venue_city ? ` (${e.venue_city})` : ""}.`,
						`Total ${k.jumlah_event} acara bersama Tetra sejak ${tanggal(k.pertama)}.`,
					].join(" ");
					const disapa = sapaan.get(k.wa);
					return (
						<div className="flex flex-col items-end gap-0.5">
							<FollowupButton
								jid={null}
								nomor={k.wa}
								nama={k.pic || k.nama}
								alasan={alasan}
								konteks={konteks}
								latest={followups.get(k.wa) ?? null}
							/>
							{disapa ? (
								<span className="whitespace-nowrap text-[11px] text-muted-foreground">
									disapa {timeAgo(disapa)}
								</span>
							) : null}
						</div>
					);
				}
			: undefined;
	const s = r.per_status;
	const rawat = r.klien
		.filter((k) => k.status === "menunggu")
		.sort((a, b) => b.bulan_sejak_terakhir - a.bulan_sejak_terakhir);
	const hilang = r.klien.filter((k) => k.status === "hilang").slice(0, 15);
	const setia = r.klien
		.filter((k) => k.jumlah_event >= 2 && k.status !== "hilang")
		.sort((a, b) => b.jumlah_event - a.jumlah_event)
		.slice(0, 15);

	return (
		<Container size="xl" className="space-y-3">
			<SectionHeader
				title="Klien Lama"
				description="Klien korporat, instansi, sekolah, dan event (tanpa pernikahan dan klien lewat vendor): siapa yang kembali, siapa yang perlu disapa lagi, siapa yang menghilang."
				actions={<LeadsTabs active="retensi" />}
			/>

			<KpiRow>
				<KpiCard
					label="Klien B2B"
					value={r.total.toLocaleString("id-ID")}
					hint="Pernah memakai Tetra"
					icon={Users}
					accent="primary"
				/>
				<KpiCard
					label="Kembali Lagi"
					value={`${r.persen_kembali}%`}
					hint={`${r.pernah_kembali} klien memakai Tetra 2× atau lebih`}
					icon={Repeat}
					accent="emerald"
				/>
				<KpiCard
					label="Perlu Dirawat"
					value={s.menunggu.toLocaleString("id-ID")}
					hint={`Sekali pakai, ${BULAN_RAWAT}–${BULAN_HILANG} bulan lalu`}
					icon={HeartHandshake}
					accent="amber"
				/>
				<KpiCard
					label="Menghilang"
					value={s.hilang.toLocaleString("id-ID")}
					hint={`Tanpa event > ${BULAN_HILANG} bulan`}
					icon={UserMinus}
					accent="sky"
				/>
			</KpiRow>

			<div className="grid gap-3 lg:grid-cols-2">
				<ChartCard
					title="Status klien"
					subtitle="Satu klien = satu nomor pembooking."
				>
					<BarList
						items={(Object.keys(LABEL_STATUS) as KlienRetensi["status"][]).map(
							(k) => ({
								label: LABEL_STATUS[k],
								value: s[k],
								colorClass: WARNA_STATUS[k],
								note: r.total
									? `${Math.round((s[k] / r.total) * 100)}%`
									: undefined,
							}),
						)}
						emptyLabel="Belum ada klien B2B"
					/>
				</ChartCard>
				<ChartCard
					title="Kembali lagi per kategori"
					subtitle="Klien yang memakai Tetra 2× atau lebih."
				>
					<BarList
						items={r.per_kategori.map((k) => ({
							label: LABEL_KATEGORI[k.kategori] ?? k.kategori,
							value: k.kembali,
							note: `dari ${k.klien} (${Math.round((k.kembali / k.klien) * 100)}%)`,
						}))}
						emptyLabel="Belum ada klien B2B"
					/>
				</ChartCard>
			</div>

			<ChartCard
				title="Acara tahunan mendekat"
				subtitle={`Tahun lalu mengadakan acara dalam ${JENDELA_TAHUNAN} hari ke depan (HUT, gathering, wisuda) dan tahun ini belum ada jadwal.`}
			>
				<TabelKlien
					rows={tahunan}
					kosong="Tidak ada acara tahunan dalam waktu dekat."
					aksi={aksi("tahunan")}
				/>
			</ChartCard>

			<ChartCard
				title="Perlu dirawat"
				subtitle="Baru sekali memakai Tetra dan mulai lama tidak ada kabar. Bruno menyapa mereka tiap Selasa."
			>
				<TabelKlien
					rows={rawat}
					kosong="Tidak ada klien yang perlu dirawat."
					aksi={aksi("rawat")}
				/>
			</ChartCard>

			<div className="grid gap-3 lg:grid-cols-2">
				<ChartCard title="Klien setia" subtitle="Paling sering memakai Tetra.">
					<TabelKlien rows={setia} kosong="Belum ada klien yang kembali." />
				</ChartCard>
				<ChartCard
					title="Menghilang"
					subtitle={`Tanpa event lebih dari ${BULAN_HILANG} bulan.`}
				>
					<TabelKlien
						rows={hilang}
						kosong="Tidak ada klien yang menghilang."
						aksi={aksi("hilang")}
					/>
				</ChartCard>
			</div>
		</Container>
	);
}
