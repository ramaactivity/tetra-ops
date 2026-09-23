import type { SupabaseClient } from "@supabase/supabase-js";
import type { UserRole } from "@/lib/auth/get-user";

/**
 * Tipe bersama untuk lapisan AI. File ini polos (bukan "use server", bukan
 * server-only) supaya boleh diimpor dari komponen klien untuk tipe event
 * streaming.
 */

// ── Skema parameter tool (subset OpenAPI yang dimengerti Gemini) ──────────

export type AiSchemaType =
	| "STRING"
	| "NUMBER"
	| "INTEGER"
	| "BOOLEAN"
	| "ARRAY"
	| "OBJECT";

export type AiSchema = {
	type: AiSchemaType;
	description?: string;
	enum?: string[];
	format?: string;
	items?: AiSchema;
	properties?: Record<string, AiSchema>;
	required?: string[];
	nullable?: boolean;
};

// ── Tool ──────────────────────────────────────────────────────────────────

/**
 * Kelompok data sebuah tool. Dipakai untuk gating peran: crew tidak pernah
 * boleh menyentuh "finance" (rahasia bisnis — lihat aturan HPP/profit).
 */
export type AiToolScope = "ops" | "finance" | "warehouse";

export type AiToolContext = {
	/** Client Supabase. Di web = ber-RLS (cookie user); di Telegram = admin. */
	supabase: SupabaseClient;
	/** Peran pemanggil. Telegram grup owner terdaftar dianggap "owner". */
	role: UserRole;
	/** Tanggal hari ini di WIB (YYYY-MM-DD) — semua tool wajib memakai ini. */
	todayISO: string;
	surface: "web" | "telegram" | "mcp";
	/**
	 * users.id yang dicatat sebagai pelaku tulisan (created_by/assigned_by).
	 * Hanya diisi permukaan yang boleh menulis (MCP); tool tulis wajib
	 * menolak kalau kosong.
	 */
	actorId?: string;
};

export type AiTool = {
	name: string;
	description: string;
	parameters: AiSchema;
	scope: AiToolScope;
	/**
	 * Tool aksi (mengubah data) tidak dieksekusi langsung: hasilnya jadi usulan
	 * yang harus dikonfirmasi owner dulu. Tool baca = false.
	 */
	mutates?: boolean;
	/**
	 * Hanya tool tulis: validasi + ringkasan apa yang AKAN terjadi, tanpa
	 * menyimpan. Lapisan MCP mengeksposnya sebagai tool baca `<nama>_usulan`
	 * dan menolak `run` sebelum owner mengonfirmasi.
	 */
	preview?: (
		args: Record<string, unknown>,
		ctx: AiToolContext,
	) => Promise<unknown>;
	run: (args: Record<string, unknown>, ctx: AiToolContext) => Promise<unknown>;
};

// ── Event streaming dari agent ke UI ──────────────────────────────────────

export type AiStreamEvent =
	/** Potongan teks jawaban. */
	| { type: "text"; value: string }
	/** Agent mulai memanggil tool — dipakai untuk indikator "sedang cek data". */
	| { type: "tool"; name: string; label: string }
	/** Selesai; sertakan tool apa saja yang terpakai untuk jejak audit. */
	| { type: "done"; toolsUsed: string[] }
	| { type: "error"; message: string };

export type AiChatMessage = {
	role: "user" | "assistant";
	content: string;
};
