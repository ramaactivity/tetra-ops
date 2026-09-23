"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";

async function requireOwnerLevel() {
	const me = await getCurrentUser();
	if (!me) throw new Error("Unauthorized");
	if (me.profile.role !== "super_admin" && me.profile.role !== "owner") {
		throw new Error("Forbidden — owner-level only");
	}
	return me;
}

const SignerSchema = z.object({
	id: z.string().uuid().nullish(),
	name: z.string().trim().min(2, "Nama minimal 2 karakter").max(120),
	position: z.string().trim().min(1, "Jabatan wajib diisi").max(120),
	// data URL PNG/JPEG ≤ 150 KB (sudah dikecilkan di browser)
	signature_data: z
		.string()
		.regex(
			/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/,
			"Format tanda tangan tidak valid",
		)
		.max(200_000, "Tanda tangan terlalu besar (maks ±150 KB)")
		.nullish(),
	/** true = simpan tanda tangan baru/kosongkan; false = jangan sentuh kolomnya */
	replace_signature: z.boolean().default(false),
});

export type SaveSignerInput = z.input<typeof SignerSchema>;

export async function saveSigner(
	input: SaveSignerInput,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
	await requireOwnerLevel();
	const parsed = SignerSchema.safeParse(input);
	if (!parsed.success) {
		return {
			ok: false,
			error: parsed.error.issues[0]?.message ?? "Data tidak valid",
		};
	}
	const d = parsed.data;
	const supabase = await createClient();
	const payload: Record<string, unknown> = {
		name: d.name,
		position: d.position,
	};
	if (d.replace_signature) payload.signature_data = d.signature_data ?? null;

	if (d.id) {
		const { error } = await supabase
			.from("document_signers")
			.update(payload)
			.eq("id", d.id);
		if (error) return { ok: false, error: error.message };
		revalidatePath("/settings/dokumen");
		return { ok: true, id: d.id };
	}
	const { data, error } = await supabase
		.from("document_signers")
		.insert({ ...payload, signature_data: d.signature_data ?? null })
		.select("id")
		.single();
	if (error) return { ok: false, error: error.message };
	revalidatePath("/settings/dokumen");
	return { ok: true, id: data.id as string };
}

export async function setDefaultSigner(id: string) {
	await requireOwnerLevel();
	const supabase = await createClient();
	// Indeks unik hanya mengizinkan satu default → lepas dulu, baru pasang.
	await supabase
		.from("document_signers")
		.update({ is_default: false })
		.eq("is_default", true);
	const { error } = await supabase
		.from("document_signers")
		.update({ is_default: true })
		.eq("id", id);
	revalidatePath("/settings/dokumen");
	return error
		? { ok: false as const, error: error.message }
		: { ok: true as const };
}

export async function archiveSigner(id: string) {
	await requireOwnerLevel();
	const supabase = await createClient();
	const { error } = await supabase
		.from("document_signers")
		.update({ is_active: false, is_default: false })
		.eq("id", id);
	revalidatePath("/settings/dokumen");
	return error
		? { ok: false as const, error: error.message }
		: { ok: true as const };
}
