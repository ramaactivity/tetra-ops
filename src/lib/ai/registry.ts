import "server-only";

import {
	feeCrewBelumDibayar,
	piutang,
	ringkasanBisnis,
	saldoKas,
} from "@/lib/ai/tools/finance";
import {
	cariEvent,
	cekKetersediaan,
	detailEvent,
} from "@/lib/ai/tools/schedule";
import { asetTetap, stok } from "@/lib/ai/tools/warehouse";
import type { AiTool, AiToolScope } from "@/lib/ai/types";
import type { UserRole } from "@/lib/auth/get-user";

/** Semua tool yang ada. Tambah tool baru cukup di sini. */
const ALL_TOOLS: AiTool[] = [
	cariEvent,
	detailEvent,
	cekKetersediaan,
	ringkasanBisnis,
	saldoKas,
	piutang,
	feeCrewBelumDibayar,
	stok,
	asetTetap,
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

/** Label ramah untuk indikator "sedang mengerjakan…" di UI. */
export const TOOL_LABELS: Record<string, string> = {
	cari_event: "Membuka jadwal event",
	detail_event: "Membaca detail event",
	cek_ketersediaan: "Mengecek ketersediaan unit",
	ringkasan_bisnis: "Menghitung performa bisnis",
	saldo_kas: "Mengecek saldo kas & bank",
	piutang: "Mengumpulkan tagihan belum lunas",
	fee_crew_belum_dibayar: "Menghitung fee crew",
	stok: "Mengecek stok gudang",
	aset_tetap: "Memeriksa daftar alat",
};

export function toolLabel(name: string): string {
	return TOOL_LABELS[name] ?? `Mengambil data (${name})`;
}
