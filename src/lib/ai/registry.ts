import "server-only";

import {
	akunKategoriCatat,
	assignCrew,
	catatTransaksi,
	daftarCrew,
	updateStatusLead,
} from "@/lib/ai/tools/aksi";
import {
	feeCrewBelumDibayar,
	piutang,
	ringkasanBisnis,
	saldoKas,
} from "@/lib/ai/tools/finance";
import {
	bukuBulanan,
	crewMingguIni,
	digestHarian,
	komisiVendor,
	langgananApp,
	rekapBulan,
	vendorRelasi,
} from "@/lib/ai/tools/laporan";
import { leadsWa } from "@/lib/ai/tools/leads";
import {
	cariEvent,
	cekKetersediaan,
	detailEvent,
	statistikEvent,
} from "@/lib/ai/tools/schedule";
import { asetTetap, stok } from "@/lib/ai/tools/warehouse";
import type { AiTool, AiToolScope } from "@/lib/ai/types";
import type { UserRole } from "@/lib/auth/get-user";

/** Semua tool yang ada. Tambah tool baru cukup di sini. */
const ALL_TOOLS: AiTool[] = [
	cariEvent,
	statistikEvent,
	detailEvent,
	cekKetersediaan,
	ringkasanBisnis,
	saldoKas,
	piutang,
	feeCrewBelumDibayar,
	stok,
	asetTetap,
	digestHarian,
	crewMingguIni,
	rekapBulan,
	langgananApp,
	vendorRelasi,
	komisiVendor,
	bukuBulanan,
	leadsWa,
	daftarCrew,
	akunKategoriCatat,
	// Tool tulis — hanya tampil di permukaan yang punya alur konfirmasi (MCP).
	catatTransaksi,
	assignCrew,
	updateStatusLead,
];

/**
 * Scope apa yang boleh dilihat sebuah peran.
 *
 * Crew TIDAK PERNAH mendapat scope "finance" — biaya, HPP dan profit adalah
 * rahasia bisnis. Gating dilakukan dengan tidak mengirim deklarasi tool-nya
 * sama sekali ke model, bukan sekadar menolak saat dipanggil: model tak bisa
 * memanggil sesuatu yang tak pernah ia tahu ada.
 */
const SCOPES_BY_ROLE: Record<UserRole, AiToolScope[]> = {
	super_admin: ["ops", "finance", "warehouse"],
	owner: ["ops", "finance", "warehouse"],
	crew: ["ops", "warehouse"],
	pending_approval: [],
};

export function toolsForRole(role: UserRole): AiTool[] {
	const allowed = new Set(SCOPES_BY_ROLE[role] ?? []);
	return ALL_TOOLS.filter((t) => allowed.has(t.scope));
}

export function findTool(role: UserRole, name: string): AiTool | null {
	return toolsForRole(role).find((t) => t.name === name) ?? null;
}

/**
 * Nama sumber data dalam bahasa owner — sengaja KATA BENDA, bukan kalimat
 * kerja, supaya satu label bisa dipakai dua tempat: indikator berjalan
 * ("Membaca jadwal event…") dan catatan sumber di bawah jawaban
 * ("Dibaca dari: jadwal event, stok gudang"). Jangan sebut nama tool teknis.
 */
export const TOOL_LABELS: Record<string, string> = {
	cari_event: "jadwal event",
	statistik_event: "rekap angka event",
	detail_event: "detail event",
	cek_ketersediaan: "ketersediaan unit",
	ringkasan_bisnis: "performa bisnis",
	saldo_kas: "saldo kas & bank",
	piutang: "tagihan belum lunas",
	fee_crew_belum_dibayar: "fee crew",
	stok: "stok gudang",
	aset_tetap: "daftar alat",
	digest_harian: "ringkasan harian",
	crew_minggu_ini: "penugasan crew",
	rekap_bulan: "rekap bulan",
	langganan_app: "langganan aplikasi",
	vendor_relasi: "event dari vendor",
	komisi_vendor: "komisi vendor",
	buku_bulanan: "buku bulanan",
	leads_wa: "leads WhatsApp",
	daftar_crew: "daftar crew",
	akun_kategori_catat: "akun & kategori catat",
	catat_transaksi: "catat transaksi",
	assign_crew: "penugasan crew",
	update_status_lead: "status lead",
};

export function toolLabel(name: string): string {
	return TOOL_LABELS[name] ?? "data internal";
}
