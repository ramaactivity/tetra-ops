/**
 * Label bukti transfer fee crew: satu bukti bisa untuk beberapa jenis sekaligus
 * ("fee+bonus") karena owner sering mentransfer fee & bonus dalam satu kali.
 * Urutan tetap fee, bonus, reimbursement. Modul murni (client & server).
 */
export const PROOF_ORDER = ["fee", "bonus", "reimbursement"] as const;

export const PROOF_LABEL_RE =
	/^((fee|bonus|reimbursement)(\+(fee|bonus|reimbursement))*)?$/;

export const proofParts = (label: string) => (label ? label.split("+") : []);

/** Nyalakan/matikan satu jenis di label gabungan, urutan tetap. */
export function toggleProofPart(label: string, part: string): string {
	const on = new Set(proofParts(label));
	if (on.has(part)) on.delete(part);
	else on.add(part);
	return PROOF_ORDER.filter((p) => on.has(p)).join("+");
}

/** Tebakan bukti baru: semua jenis yang dibayar & belum punya bukti. */
export function guessProofLabel(
	taken: string[],
	ada: { bonus: boolean; reimbursement: boolean },
): string {
	const sudah = new Set(taken.flatMap(proofParts));
	const dibayar: Record<string, boolean> = { fee: true, ...ada };
	return PROOF_ORDER.filter((p) => dibayar[p] && !sudah.has(p)).join("+");
}
