/** Jeda minimum antar follow-up ke kontak yang sama (spek Hermes §4). */
export const FOLLOWUP_JEDA_JAM = 48;

export type FollowupStatus =
	| "menunggu_draf"
	| "draf"
	| "mengirim"
	| "terkirim"
	| "batal"
	| "gagal";

export type FollowupState = {
	id: string;
	status: FollowupStatus;
	draf: string | null;
	pesan: string | null;
	hasil: string | null;
	createdAt: string;
	updatedAt: string;
};
