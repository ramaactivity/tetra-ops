import "server-only";

import { ownerIdOfPayer } from "@/lib/finance/emoney";
import {
	catatPrefill,
	type RekapExpenseSource,
	rekapExpenseItems,
} from "@/lib/rekap/expense-items";
import { TALANGAN_OWNER_COA } from "@/lib/rekap/uang-jalan";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Biaya rekap yang ditransfer / dibayar owner tertentu ('owner:<id>') →
 * baris antrean settle bersumber "Hutang ke owner" (Dr beban / Cr 2-310 +
 * catatan hutang-piutang owner saat settle). Dipanggil tiap kali pembayar
 * biaya bisa berubah: crew menyimpan rekap, owner mengoreksi pembayar, dan
 * tepat sebelum settle.
 *
 * Satu baris per biaya (rekap_key) selama belum diposting: pembayar /
 * nominal berubah → diganti; bukan owner tertentu lagi → dihapus. Biaya yang
 * sudah dicatat manual dengan keterangan yang sama tidak diantre (anti dobel).
 *
 * Pakai admin client: crew yang menyimpan rekap tidak punya akses ke antrean
 * (RLS owner) — isinya sepenuhnya diturunkan dari rekap, bukan input bebas.
 */
export async function syncOwnerPaidQueue(
	eventId: string,
	actorId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
	const db = createAdminClient();
	const [{ data: rekap }, { data: ev }, { data: queue }, { data: manual }] =
		await Promise.all([
			db
				.from("crew_rekap")
				.select(
					"transport_cost, transport_method, transport_proof_berangkat_url, bensin_cost, toll_cost, parking_cost, konsumsi_cost, lainnya_items, expense_paid_by, expense_nota_urls",
				)
				.eq("event_id", eventId)
				.maybeSingle(),
			db
				.from("events")
				.select("client_name, transport_reimburse_account")
				.eq("id", eventId)
				.maybeSingle(),
			db
				.from("event_settle_queue")
				.select(
					"id, rekap_key, owner_id, account_code, amount, note, posted_at",
				)
				.eq("event_id", eventId)
				.eq("kind", "expense"),
			db
				.from("journal_entries")
				.select("description")
				.eq("source_event_id", eventId)
				.eq("source_type", "manual")
				.eq("is_reversed", false),
		]);
	if (!rekap || !ev) return { ok: true };

	const rows = (queue ?? []) as Array<{
		id: string;
		rekap_key: string | null;
		owner_id: string | null;
		account_code: string;
		amount: number | string;
		note: string | null;
		posted_at: string | null;
	}>;
	const sudahDicatat = new Set([
		...(manual ?? []).map((m) =>
			String(m.description ?? "")
				.trim()
				.toLowerCase(),
		),
		// Antrean yang diisi manual (bukan dari sinkronisasi ini).
		...rows
			.filter((r) => !r.rekap_key)
			.map((r) => (r.note ?? "").trim().toLowerCase()),
	]);
	const posted = new Set(
		rows.filter((r) => r.rekap_key && r.posted_at).map((r) => r.rekap_key),
	);
	const aktif = new Map(
		rows
			.filter((r) => r.rekap_key && !r.posted_at)
			.map((r) => [r.rekap_key as string, r]),
	);

	const want = rekapExpenseItems(rekap as RekapExpenseSource)
		.map((it) => ({ it, ownerId: ownerIdOfPayer(it.rawPayer) }))
		.filter(
			(x): x is { it: (typeof x)["it"]; ownerId: string } =>
				x.ownerId !== null && !posted.has(x.it.key),
		)
		.map(({ it, ownerId }) => {
			// Sewa mobil "diganti langsung saat settle": dibayar dari rekening
			// Tetra (owner diganti di tempat) — tidak jadi hutang.
			const langsung =
				it.key === "transport"
					? ((ev.transport_reimburse_account as string | null) ?? null)
					: null;
			return {
				key: it.key,
				ownerId: langsung ? null : ownerId,
				account: langsung ?? TALANGAN_OWNER_COA,
				...catatPrefill(it, String(ev.client_name ?? "")),
			};
		})
		.filter((w) => !sudahDicatat.has(w.note.toLowerCase()));
	const wantKeys = new Set(want.map((w) => w.key));

	// Hapus yang tidak relevan lagi / berubah, lalu sisipkan yang belum ada.
	const hapus = [...aktif.values()].filter((r) => {
		const w = want.find((x) => x.key === r.rekap_key);
		return (
			!wantKeys.has(r.rekap_key as string) ||
			!w ||
			w.ownerId !== r.owner_id ||
			w.account !== r.account_code ||
			w.amount !== Number(r.amount) ||
			w.note !== r.note
		);
	});
	if (hapus.length) {
		const { error } = await db
			.from("event_settle_queue")
			.delete()
			.in(
				"id",
				hapus.map((r) => r.id),
			)
			.is("posted_at", null);
		if (error) return { ok: false, error: error.message };
	}
	const tetap = new Set(
		[...aktif.values()]
			.filter((r) => !hapus.includes(r))
			.map((r) => r.rekap_key),
	);
	const baru = want.filter((w) => !tetap.has(w.key));
	if (baru.length) {
		const { error } = await db.from("event_settle_queue").insert(
			baru.map((w) => ({
				event_id: eventId,
				kind: "expense",
				direction: "keluar",
				category_id: w.categoryId,
				note: w.note,
				amount: w.amount,
				account_code: w.account,
				owner_id: w.ownerId,
				proof_url: w.proofUrl,
				rekap_key: w.key,
				created_by: actorId,
			})),
		);
		if (error) return { ok: false, error: error.message };
	}
	return { ok: true };
}
