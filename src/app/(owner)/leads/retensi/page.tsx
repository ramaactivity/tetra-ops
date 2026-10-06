import { HeartHandshake, Repeat, UserMinus, Users } from "lucide-react";
import { Container } from "@/components/layout/container";
import { SectionHeader } from "@/components/layout/section-header";
import { BarList, ChartCard } from "@/components/leads/analytics-charts";
import { LeadsTabs } from "@/components/leads/leads-tabs";
import { KpiRow } from "@/components/operations/_shared/kpi-row";
import { KpiCard } from "@/components/operations/kpi-card";
import {
	BULAN_HILANG,
	BULAN_RAWAT,
	KATEGORI_B2B,
	type KlienRetensi,
	ringkasRetensi,
} from "@/lib/retensi";
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

function TabelKlien({
	rows,
	kosong,
}: {
	rows: KlienRetensi[];
	kosong: string;
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
						<th className="px-1 py-1.5 font-medium">Kategori</th>
						<th className="px-1 py-1.5 text-right font-medium">Event</th>
						<th className="px-1 py-1.5 font-medium">Terakhir</th>
					</tr>
				</thead>
				<tbody>
					{rows.map((k) => (
						<tr key={k.kunci} className="border-t border-border/60">
							<td className="px-1 py-2">
								<span className="font-medium text-foreground">
									{k.nama || "-"}
								</span>
								{k.pic ? (
									<span className="block text-[12px] text-muted-foreground">
										{k.pic}
									</span>
								) : null}
							</td>
							<td className="px-1 py-2">
								{LABEL_KATEGORI[k.kategori] ?? k.kategori}
							</td>
							<td className="tabular px-1 py-2 text-right">{k.jumlah_event}</td>
							<td className="px-1 py-2 whitespace-nowrap">
								{tanggal(k.terakhir)}
								<span className="block text-[12px] text-muted-foreground">
									{k.mendatang
										? "ada jadwal"
										: `${k.bulan_sejak_terakhir} bln lalu`}
								</span>
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

export default async function RetensiPage() {
	const supabase = await createClient();
	const today = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
	const { data } = await supabase
		.from("events")
		.select(
			"client_wa, client_org, client_name, pic_name, event_category, event_date, status, channel",
		)
		.in("event_category", [...KATEGORI_B2B])
		.is("deleted_at", null)
		.limit(10000);
	const r = ringkasRetensi(data ?? [], today);
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
				title="Retensi Klien B2B"
				description="Klien korporat, instansi, sekolah, dan event (tanpa pernikahan dan klien lewat vendor): siapa yang kembali, siapa yang perlu dirawat, siapa yang menghilang."
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
				title="Perlu dirawat"
				subtitle="Baru sekali memakai Tetra dan mulai lama tidak ada kabar. Bruno menyapa mereka tiap Selasa."
			>
				<TabelKlien rows={rawat} kosong="Tidak ada klien yang perlu dirawat." />
			</ChartCard>

			<div className="grid gap-3 lg:grid-cols-2">
				<ChartCard title="Klien setia" subtitle="Paling sering memakai Tetra.">
					<TabelKlien rows={setia} kosong="Belum ada klien yang kembali." />
				</ChartCard>
				<ChartCard
					title="Menghilang"
					subtitle={`Tanpa event lebih dari ${BULAN_HILANG} bulan.`}
				>
					<TabelKlien rows={hilang} kosong="Tidak ada klien yang menghilang." />
				</ChartCard>
			</div>
		</Container>
	);
}
