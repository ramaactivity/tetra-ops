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

/** Kode COA ini kartu e-money? (blok 1-140..1-159) */
export function isEmoneyCoa(code: string | null | undefined): boolean {
	if (typeof code !== "string") return false;
	const m = /^1-1(\d{2})$/.exec(code.trim());
	if (!m) return false;
	const n = Number(`1${m[1]}`);
	return n >= EMONEY_COA_FIRST && n <= EMONEY_COA_LAST;
}

/**
 * Beban transportasi: 5-210 BBM · 5-211 online · 5-212 sewa mobil ·
 * 5-213 toll · 5-214 parkir.
 *
 * Dipakai untuk membatasi kartu e-toll: kartunya cuma boleh jadi alat bayar
 * kebutuhan transportasi. Menawarkannya untuk bayar supplier, fee crew, atau
 * komisi cuma memperbesar peluang salah pilih — dan kalau tercatat, saldo
 * kartu di buku langsung meleset dari kartu fisiknya.
 */
export function isTransportCoa(coa: string | null | undefined): boolean {
	return typeof coa === "string" && /^5-21[0-4]$/.test(coa.trim());
}

/**
 * Saring kartu e-money dari daftar rekening.
 *
 * Bawaannya membuang: sebagian besar alur uang keluar (belanja, fee crew,
 * hutang, komisi) tidak boleh dibayar pakai kartu tol. Alur transportasi
 * memanggilnya dengan `allow` = true.
 */
export function filterEmoneyAccounts<T extends { code: string }>(
	accounts: ReadonlyArray<T>,
	allow: boolean,
): T[] {
	return allow ? [...accounts] : accounts.filter((a) => !isEmoneyCoa(a.code));
}

/**
 * Biaya ditransfer / dibayar owner tertentu: 'owner:<users.id>'. Bukan
 * talangan crew — jadi hutang Tetra ke owner itu (lewat antrean settle).
 */
export const OWNER_PAYER_PREFIX = "owner:";

export function ownerIdOfPayer(value: unknown): string | null {
	if (typeof value !== "string" || !value.startsWith(OWNER_PAYER_PREFIX))
		return null;
	const id = value.slice(OWNER_PAYER_PREFIX.length).trim();
	return UUID_RE.test(id) ? id : null;
}

/** Dibayar owner: 'owner' (lama, belum jelas siapa) atau 'owner:<id>'. */
export function isOwnerPaid(value: unknown): boolean {
	return value === "owner" || ownerIdOfPayer(value) !== null;
}

/**
 * Satu-satunya pembaca nilai pembayar biaya lapangan (form crew, server,
 * halaman owner): 'owner' | 'owner:<id>' | 'acct:<id>' (kartu/rekening) |
 * <users.id crew> | 'crew' (belum dipilih). Nilai lain → 'crew'.
 */
export function normalizePayer(value: unknown): string {
	if (value === "owner") return "owner";
	const owner = ownerIdOfPayer(value);
	if (owner) return `${OWNER_PAYER_PREFIX}${owner}`;
	const acct = paidFromAccountId(value);
	if (acct) return `${PAID_FROM_PREFIX}${acct}`;
	if (typeof value === "string" && UUID_RE.test(value.trim()))
		return value.trim();
	return "crew";
}

/** Biaya ini keluar dari kantong seseorang (crew), bukan dari rekening. */
export function isFrontedByPerson(value: unknown): boolean {
	if (isOwnerPaid(value)) return false;
	return paidFromAccountId(value) === null;
}
