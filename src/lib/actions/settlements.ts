"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/get-user";
import { SETTLEMENT_DEFAULTS } from "@/lib/constants/settlement";
import { createClient } from "@/lib/supabase/server";

const HPP_KEYS = [
	"mediaset",
	"sleeve",
	"flashdisk",
	"pouch",
	"photomagnet",
	"keychain",
	"other",
] as const;

const OPEX_KEYS = [
	"fee_lead",
	"fee_asisten",
	"fee_crew_c",
	"fee_extra",
	"transport_bbm",
	"sewa_alat",
	"perawatan",
	"konsumsi",
	"komisi_vendor",
	"komisi_relasi",
	"komisi_sales_direct",
	"platform_fee",
	"diskon_tambahan",
] as const;

const NonNegInt = z.coerce
	.number()
	.int("Harus bilangan bulat")
	.nonnegative("Tidak boleh negatif")
	.default(0);

const SettlementInputSchema = z.object({
	revenue_gross: z.coerce.number().int().nonnegative(),
	discount_total: NonNegInt,
	owner_pool_per_person: NonNegInt,
	hpp: z.object(
		Object.fromEntries(HPP_KEYS.map((k) => [k, NonNegInt])),
	) as z.ZodObject<Record<(typeof HPP_KEYS)[number], typeof NonNegInt>>,
	opex: z.object(
		Object.fromEntries(OPEX_KEYS.map((k) => [k, NonNegInt])),
	) as z.ZodObject<Record<(typeof OPEX_KEYS)[number], typeof NonNegInt>>,
});

export type SettlementInput = z.infer<typeof SettlementInputSchema>;

type SettlementErrors = {
	_form?: string[];
	[k: string]: string[] | undefined;
};

export type SettlementFormState =
	| { errors?: SettlementErrors; values?: Record<string, string> }
	| undefined;

async function requireOwnerLevel() {
	const me = await getCurrentUser();
	if (!me) throw new Error("Unauthorized");
	if (me.profile.role !== "super_admin" && me.profile.role !== "owner") {
		throw new Error("Forbidden — owner-level only");
	}
	return me;
}

async function requireSuperAdmin() {
	const me = await getCurrentUser();
	if (!me) throw new Error("Unauthorized");
	if (me.profile.role !== "super_admin") {
		throw new Error("Forbidden — super_admin only");
	}
	return me;
}

function parseFormData(formData: FormData) {
	const hpp = Object.fromEntries(
		HPP_KEYS.map((k) => [k, formData.get(`hpp_${k}`) ?? 0]),
	);
	const opex = Object.fromEntries(
		OPEX_KEYS.map((k) => [k, formData.get(`opex_${k}`) ?? 0]),
	);
	return {
		revenue_gross: formData.get("revenue_gross") ?? 0,
		discount_total: formData.get("discount_total") ?? 0,
		owner_pool_per_person:
			formData.get("owner_pool_per_person") ??
			SETTLEMENT_DEFAULTS.OWNER_POOL_PER_PERSON,
		hpp,
		opex,
	};
}

function snapshotFormValues(formData: FormData): Record<string, string> {
	const out: Record<string, string> = {};
	for (const [key, val] of formData.entries()) {
		if (typeof val === "string") out[key] = val;
	}
	return out;
}

export async function closeSettlement(
	eventId: string,
	projectId: string,
	_prev: SettlementFormState,
	formData: FormData,
): Promise<SettlementFormState> {
	const me = await requireOwnerLevel();

	const parsed = SettlementInputSchema.safeParse(parseFormData(formData));
	if (!parsed.success) {
		return {
			errors: parsed.error.flatten().fieldErrors as SettlementErrors,
			values: snapshotFormValues(formData),
		};
	}

	const supabase = await createClient();

	// Resolve active owners (super_admin + owner roles)
	const { data: owners, error: ownersError } = await supabase
		.from("users")
		.select("id")
		.in("role", ["super_admin", "owner"])
		.eq("is_active", true);

	if (ownersError) {
		return {
			errors: { _form: [`Gagal load owner list: ${ownersError.message}`] },
			values: snapshotFormValues(formData),
		};
	}

	const ownerIds = (owners ?? []).map((o) => o.id);

	const { error: rpcError } = await supabase.rpc("close_event_settlement", {
		p_event_id: eventId,
		p_revenue_gross: parsed.data.revenue_gross,
		p_discount_total: parsed.data.discount_total,
		p_hpp: parsed.data.hpp,
		p_opex: parsed.data.opex,
		p_owner_user_ids: ownerIds,
		p_owner_pool_per_person: parsed.data.owner_pool_per_person,
		p_closed_by: me.authId,
	});

	if (rpcError) {
		return {
			errors: { _form: [rpcError.message] },
			values: snapshotFormValues(formData),
		};
	}

	revalidatePath(`/operations/${projectId}`);
	revalidatePath(`/operations/${projectId}/settle`);
	revalidatePath("/operations");
	revalidatePath("/dashboard");
	revalidatePath("/billing");
	return undefined;
}

export async function reopenSettlement(
	settlementId: string,
	projectId: string,
	reason: string,
): Promise<{ error?: string }> {
	const me = await requireSuperAdmin();

	if (!reason.trim()) {
		return { error: "Alasan reopen wajib diisi" };
	}

	const supabase = await createClient();
	const { error } = await supabase.rpc("reopen_event_settlement", {
		p_settlement_id: settlementId,
		p_reason: reason.trim(),
		p_actor_id: me.authId,
	});

	if (error) return { error: error.message };

	revalidatePath(`/operations/${projectId}`);
	revalidatePath("/operations");
	revalidatePath("/dashboard");
	return {};
}
