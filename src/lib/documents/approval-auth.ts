/**
 * Tombol uang di Telegram ("Kirim ke klien"). Murni supaya bisa dites:
 * grup owner juga berisi desainer/crew, jadi keanggotaan grup BUKAN bukti
 * owner — pengirim tap harus ada di telegram_settings.owner_tg_ids.
 */

/** callback_data "ks:<uuid doc_send_requests>" → id, selain itu null. */
export function parseDocSendCallback(
	data: string | null | undefined,
): string | null {
	const m = /^ks:([0-9a-f-]{36})$/i.exec(data ?? "");
	return m ? m[1] : null;
}

export function isOwnerTg(
	fromId: number | null | undefined,
	ownerIds: ReadonlyArray<number | string> | null | undefined,
): boolean {
	if (!fromId || !ownerIds?.length) return false;
	return ownerIds.some((id) => Number(id) === fromId);
}

export type DraftTapAction = "kirim" | "catat" | "tolak";

/**
 * Tombol kartu bukti transfer (Billing › Uang Masuk, DR-059):
 * "dp:k:<uuid>" catat + kirim terima kasih, "dp:c:<uuid>" catat saja,
 * "dp:x:<uuid>" tolak. Selain itu null.
 */
export function parseDraftCallback(
	data: string | null | undefined,
): { action: DraftTapAction; id: string } | null {
	const m = /^dp:([kcx]):([0-9a-f-]{36})$/i.exec(data ?? "");
	if (!m) return null;
	const action = ({ k: "kirim", c: "catat", x: "tolak" } as const)[
		m[1].toLowerCase() as "k" | "c" | "x"
	];
	return { action, id: m[2] };
}
