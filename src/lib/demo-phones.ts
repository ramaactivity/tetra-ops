/** Nomor akun Mode Demo (DR-047) — murni, aman diimpor di mana saja. */
export const DEMO_PHONES = ["6289900009901", "6289900009902"];
export const isDemoPhone = (phone: string | null | undefined) =>
	!!phone && DEMO_PHONES.includes(phone);
