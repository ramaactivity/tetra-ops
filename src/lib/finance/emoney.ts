/**
 * Kartu e-money (e-toll) — konstanta & penerjemah penanda pembayar.
 *
 * Kartu e-toll diperlakukan seperti rekening bank: satu baris `bank_accounts`
 * + satu kode COA di golongan Kas & Bank. Karena semua pemilih "uang keluar
 * dari rekening" menyaring lewat pola 1-1xx (lihat isCashOrBank), kartu ikut
 * muncul di sana tanpa layar mana pun perlu diubah.
 *
 * Modul ini SENGAJA bebas dependensi server (tanpa Supabase) supaya bisa
 * dipakai dari komponen klien. Pemuatan data ada di `emoney-data.ts`.
 */

/** Kartu e-money menempati blok kode sendiri, terpisah dari bank. */
export const EMONEY_COA_FIRST = 140;
export const EMONEY_COA_LAST = 159;
/** Bank berhenti di 1-139 supaya penomoran otomatisnya tak masuk blok kartu. */
export const BANK_COA_FIRST = 110;
export const BANK_COA_LAST = 139;

export type AccountKind = "cash" | "bank" | "emoney";

export const ACCOUNT_KIND_LABEL: Record<AccountKind, string> = {
	cash: "Kas tunai",
	bank: "Bank",
	emoney: "Kartu e-money",
};

/** Penerbit kartu yang umum dipakai — sekadar saran isian, bukan daftar tertutup. */
export const CARD_PROVIDERS = [
	"Mandiri e-Money",
	"BCA Flazz",
	"BRI Brizzi",
	"BNI TapCash",
	"DKI JakCard",
] as const;

/**
 * Penanda pembayar di `crew_rekap.expense_paid_by`.
 *
 * Nilai yang mungkin:
 *   'crew'              ditalangi crew (belum ditentukan siapa)
 *   <uuid crew>         ditalangi crew tertentu
 *   'owner'             dibayar owner pakai uang pribadi
 *   'acct:<uuid akun>'  dibayar langsung dari saldo perusahaan  ← ini
 *
 * Bentuk terakhir yang membedakan: tidak ada manusia yang menalangi, jadi
 * settle mengkredit rekeningnya — bukan Hutang Crew.
 */
export const PAID_FROM_PREFIX = "acct:";

const UUID_RE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Id rekening dari penanda pembayar, atau null kalau bukan bentuk 'acct:'. */
export function paidFromAccountId(value: unknown): string | null {
	if (typeof value !== "string") return null;
	if (!value.startsWith(PAID_FROM_PREFIX)) return null;
	const id = value.slice(PAID_FROM_PREFIX.length).trim();
	return UUID_RE.test(id) ? id : null;
}

/** Penanda pembayar untuk sebuah rekening. */
export function encodePaidFromAccount(accountId: string): string {
	return `${PAID_FROM_PREFIX}${accountId}`;
}

/** Biaya ini keluar dari kantong seseorang (crew), bukan dari rekening. */
export function isFrontedByPerson(value: unknown): boolean {
	if (value === "owner") return false;
	return paidFromAccountId(value) === null;
}
