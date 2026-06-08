"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";

const FeeRow = z.object({
	assignment_id: z.string().uuid(),
	fee_amount: z.coerce.number().int().nonnegative(),
	bonus_amount: z.coerce.number().int().nonnegative(),
	reimbursement_amount: z.coerce.number().int().nonnegative(),
	payment_notes: z.string().trim().max(500).optional().nullable(),
	payment_proof_url: z.string().url().max(2000).optional().nullable(),
});

const SaveCrewFeesSchema = z.object({
	rows: z.array(FeeRow).min(1, "Minimal 1 crew"),
});

export type SaveCrewFeesResponse =
	| { ok: true; updated: number }
	| { ok: false; error: string };

export async function saveCrewFees(
	eventId: string,
	projectId: string,
	rows: Array<{
		assignment_id: string;
		fee_amount: number | string;
		bonus_amount: number | string;
		reimbursement_amount: number | string;
		payment_notes?: string | null;
		payment_proof_url?: string | null;
	}>,
): Promise<SaveCrewFeesResponse> {
	const me = await getCurrentUser();
	if (!me) return { ok: false, error: "Unauthorized" };
	if (me.profile.role !== "super_admin" && me.profile.role !== "owner") {
		return {
			ok: false,
			error: "Hanya owner/super_admin yang bisa update fee crew",
		};
	}

	const parsed = SaveCrewFeesSchema.safeParse({ rows });
	if (!parsed.success) {
		return {
			ok: false,
			error: parsed.error.issues.map((i) => i.message).join("; "),
		};
	}

	const supabase = await createClient();

	// Ensure crew_assignment belongs to this event (defence in depth)
	const ids = parsed.data.rows.map((r) => r.assignment_id);
	const { data: existing, error: fetchErr } = await supabase
		.from("crew_assignments")
		.select("id, event_id, payment_proof_url")
		.in("id", ids);
	if (fetchErr) return { ok: false, error: fetchErr.message };

	const mismatch = (existing ?? []).find((r) => r.event_id !== eventId);
	if (mismatch) {
		return {
			ok: false,
			error: "Salah satu crew_assignment tidak match event_id",
		};
	}

	// Each row updates a distinct crew_assignment, so run the updates
	// concurrently (≈1 round-trip wall-clock instead of N sequential) and
	// surface the first failure.
	const feeUpdateResults = await Promise.all(
		parsed.data.rows.map((row) => {
			// Look up existing payment_proof_url to detect new uploads (set uploaded_at)
			const existingRow = (existing ?? []).find(
				(e) => e.id === row.assignment_id,
			);
			const existingProof =
				(existingRow as { payment_proof_url?: string | null } | undefined)
					?.payment_proof_url ?? null;
			const newProof = row.payment_proof_url ?? null;
			const uploadedAt =
				newProof && newProof !== existingProof
					? new Date().toISOString()
					: undefined;

			return supabase
				.from("crew_assignments")
				.update({
					fee_amount: row.fee_amount,
					bonus_amount: row.bonus_amount,
					reimbursement_amount: row.reimbursement_amount,
					payment_notes: row.payment_notes ?? null,
					payment_proof_url: newProof,
					...(uploadedAt ? { payment_proof_uploaded_at: uploadedAt } : {}),
					updated_at: new Date().toISOString(),
				})
				.eq("id", row.assignment_id);
		}),
	);
	const feeUpdateErr = feeUpdateResults.find((r) => r.error)?.error;
	if (feeUpdateErr) return { ok: false, error: feeUpdateErr.message };
	const updated = parsed.data.rows.length;

	revalidatePath(`/operations/${projectId}/rekap`);
	revalidatePath(`/operations/${projectId}`);
	return { ok: true, updated };
}

const AddonSplitSchema = z.object({
	photomagnet_paid: z.coerce.number().int().nonnegative(),
	photomagnet_bonus: z.coerce.number().int().nonnegative(),
	keychain_paid: z.coerce.number().int().nonnegative(),
	keychain_bonus: z.coerce.number().int().nonnegative(),
});

export type SaveAddonSplitResponse =
	| { ok: true }
	| { ok: false; error: string };

export async function saveAddonSplit(
	recapId: string,
	eventId: string,
	projectId: string,
	input: {
		photomagnet_paid: number | string;
		photomagnet_bonus: number | string;
		keychain_paid: number | string;
		keychain_bonus: number | string;
	},
): Promise<SaveAddonSplitResponse> {
	const me = await getCurrentUser();
	if (!me) return { ok: false, error: "Unauthorized" };
	if (me.profile.role !== "super_admin" && me.profile.role !== "owner") {
		return {
			ok: false,
			error: "Hanya owner/super_admin yang bisa update split addon",
		};
	}

	const parsed = AddonSplitSchema.safeParse(input);
	if (!parsed.success) {
		return {
			ok: false,
			error: parsed.error.issues.map((i) => i.message).join("; "),
		};
	}

	const supabase = await createClient();

	// Block update if recap already locked
	const { data: recap, error: fetchErr } = await supabase
		.from("crew_rekap")
		.select("id, locked, event_id")
		.eq("id", recapId)
		.maybeSingle();
	if (fetchErr) return { ok: false, error: fetchErr.message };
	if (!recap) return { ok: false, error: "Recap tidak ditemukan" };
	if (recap.event_id !== eventId)
		return { ok: false, error: "Recap tidak match event" };
	if (recap.locked) {
		return {
			ok: false,
			error: "Recap sudah locked. Reopen settlement dulu kalau perlu edit.",
		};
	}

	const { error } = await supabase
		.from("crew_rekap")
		.update({
			photomagnet_paid: parsed.data.photomagnet_paid,
			photomagnet_bonus: parsed.data.photomagnet_bonus,
			keychain_paid: parsed.data.keychain_paid,
			keychain_bonus: parsed.data.keychain_bonus,
			updated_at: new Date().toISOString(),
		})
		.eq("id", recapId);
	if (error) return { ok: false, error: error.message };

	revalidatePath(`/operations/${projectId}/rekap`);
	revalidatePath(`/operations/${projectId}`);
	return { ok: true };
}
