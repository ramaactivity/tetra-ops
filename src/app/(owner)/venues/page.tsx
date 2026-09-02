import { Building2, CalendarRange, MapPin, MapPinOff } from "lucide-react";
import { type StatItem, StatRow } from "@/components/catalog/stat-tile";
import { Container } from "@/components/layout/container";
import { SectionHeader } from "@/components/layout/section-header";
import {
	type VenueRow,
	VenuesExplorer,
} from "@/components/venues/venues-explorer";
import { createClient } from "@/lib/supabase/server";

/**
 * Master venue — daftar tempat yang pernah dipakai, plus alat merapikannya.
 *
 * Dua hal yang bikin master ini butuh layar sendiri:
 *   1. Link Google Maps & kota sering baru terisi belakangan; di sini owner
 *      bisa melengkapinya sekali untuk semua booking berikutnya.
 *   2. Nama gampang melenceng ("Harris CCM" vs "Harris Hotel CCM") sehingga
 *      satu tempat jadi dua baris. Penggabungan ada di sini.
 */
export default async function VenuesPage() {
	const supabase = await createClient();

	const [{ data: venues, error }, { data: events }] = await Promise.all([
		supabase
			.from("venues")
			.select(
				"id, name, address, city, province, google_maps_url, notes, is_active",
			)
			.order("name", { ascending: true }),
		supabase.from("events").select("venue_id, event_date").range(0, 4999),
	]);

	if (error) {
		return (
			<Container size="xl">
				<div className="border-destructive bg-destructive/10 rounded-md border p-4">
					<p className="text-destructive text-sm font-medium">
						Gagal memuat venue: {error.message}
					</p>
				</div>
			</Container>
		);
	}

	// Pemakaian dihitung dari event yang sudah tertaut. Angka ini yang dipakai
	// owner untuk memutuskan mana yang "asli" saat menggabungkan duplikat.
	const usage = new Map<string, { count: number; last: string | null }>();
	for (const e of events ?? []) {
		const id = e.venue_id as string | null;
		if (!id) continue;
		const date = (e.event_date as string | null) ?? null;
		const prev = usage.get(id);
		if (prev) {
			prev.count += 1;
			if (date && (!prev.last || date > prev.last)) prev.last = date;
		} else {
			usage.set(id, { count: 1, last: date });
		}
	}

	const rows: VenueRow[] = (venues ?? []).map((v) => ({
		id: v.id as string,
		name: v.name as string,
		address: (v.address as string | null) ?? null,
		city: (v.city as string | null) ?? null,
		province: (v.province as string | null) ?? null,
		googleMapsUrl: (v.google_maps_url as string | null) ?? null,
		notes: (v.notes as string | null) ?? null,
		isActive: Boolean(v.is_active),
		eventCount: usage.get(v.id as string)?.count ?? 0,
		lastEventDate: usage.get(v.id as string)?.last ?? null,
	}));

	const active = rows.filter((r) => r.isActive);
	const withMaps = active.filter((r) => r.googleMapsUrl).length;
	const repeat = active.filter((r) => r.eventCount > 1).length;

	const stats: StatItem[] = [
		{
			label: "Venue Aktif",
			value: String(active.length),
			hint: `${rows.length - active.length} diarsipkan`,
			icon: Building2,
		},
		{
			label: "Pernah Diulang",
			value: String(repeat),
			hint: "dipakai lebih dari sekali",
			icon: CalendarRange,
			accent: "emerald",
		},
		{
			label: "Punya Link Maps",
			value: `${withMaps}/${active.length}`,
			hint: "auto-terisi saat venue dipilih",
			icon: MapPin,
			accent: "info",
		},
		{
			label: "Belum Ada Maps",
			value: String(active.length - withMaps),
			hint: "lengkapi sekali, kepakai selamanya",
			icon: MapPinOff,
			accent: active.length - withMaps > 0 ? "amber" : undefined,
		},
	];

	return (
		<Container size="xl" className="space-y-3">
			<SectionHeader
				as="h1"
				eyebrow="Operations"
				title="Venue"
				description="Tempat yang pernah dipakai. Lengkapi alamat & link Maps sekali — booking berikutnya ikut terisi sendiri."
			/>

			<StatRow stats={stats} />

			<VenuesExplorer venues={rows} />
		</Container>
	);
}
