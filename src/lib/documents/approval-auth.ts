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
