import "server-only";

/**
 * Rekanan daftar sendiri (/rekanan/daftar) atau diundang bot WA
 * (POST /api/bot/undang-vendor), DR-050. Satu mesin dengan undangan owner di
 * Pusat Vendor (inviteVendorPerson): contacts vendor + portal_people +
 * vendor_members. Vendor baru dari jalur ini berstatus "calon"
 * (vendor_settings.partner_level) sampai owner meninjaunya.
 *
 * Idempoten per nomor: nomor yang sudah anggota vendor → vendor itu; nomor
 * yang tercatat sebagai PIC vendor lama → ikut vendor lama (tidak dobel).
 * Nama usaha yang sama TIDAK menautkan ke vendor lama — nama bukan bukti, dan
 * menautkan berarti membuka acara & komisi vendor itu. Owner dikabari
 * kemiripannya untuk ditinjau.
 */
import { appUrl } from "@/lib/app-url";
import { syncVendorBookings } from "@/lib/portal/vendor";
import {
	cleanInstagram,
	JENIS_REKANAN,
	normName,
	type SignupError,
	SignupSchema,
	samePhone,
} from "@/lib/portal/vendor-signup-core";
import { createAdminClient } from "@/lib/supabase/admin";
import { tgEscape } from "@/lib/telegram/client";
import { sendToOwnerGroup } from "@/lib/telegram/notify";
import { vendorSettings } from "@/lib/vendor-settings";
import { isLikelyWaPhone, toWaPhone } from "@/lib/whatsapp";

export type VendorSignupOk = {
	ok: true;
	contactId: string;
	personId: string;
	vendorName: string;
	/** Kontak vendor baru dibuat di panggilan ini. */
	baru: boolean;
	status: "calon" | "rekanan";
	/**
	 * Orang ini belum punya data portal lain (booking pribadi / acara vendor).
	 * Jalur tanpa verifikasi nomor (bot) hanya boleh memberi link masuk
	 * sekali-ketuk kalau true.
	 */
	akunKosong: boolean;
	events: number;
};
export type VendorSignupResult =
	| VendorSignupOk
	| { ok: false; code: SignupError; error: string };

type VendorRow = {
	id: string;
	name: string;
	phone: string | null;
	default_pic_contact: string | null;
	vendor_pics: Array<{ name: string; contact: string | null }> | null;
	vendor_settings: unknown;
};

const fail = (code: SignupError, error: string): VendorSignupResult => ({
	ok: false,
	code,
	error,
});

/** Nomor internal Tetra: system_config tim_wa + nomor WA user aktif. */
async function isTeamPhone(phone: string): Promise<boolean> {
	const admin = createAdminClient();
	const [{ data: cfg }, { data: users }] = await Promise.all([
		admin
			.from("system_config")
			.select("value")
			.eq("key", "tim_wa")
			.maybeSingle(),
		admin.from("users").select("phone_wa").is("deleted_at", null),
	]);
	const tim = Array.isArray(cfg?.value)
		? (cfg.value as Array<{ nomor?: unknown }>).map((x) =>
				String(x?.nomor ?? ""),
			)
		: [];
	return [
		...tim,
		...(users ?? []).map((u) => u.phone_wa as string | null),
	].some((n) => samePhone(n, phone));
}

export async function ensureVendorSignup(
	raw: unknown,
	via: { sumber: "portal" | "wa_bot"; waJid?: string | null },
): Promise<VendorSignupResult> {
	const parsed = SignupSchema.safeParse(raw);
	if (!parsed.success)
		return fail(
			"input_tidak_valid",
			parsed.error.issues[0]?.message ?? "Isian belum lengkap.",
		);
	const input = parsed.data;
	if (!isLikelyWaPhone(input.phone))
		return fail(
			"nomor_tidak_valid",
			"Nomor WhatsApp belum benar. Contoh: 0812 3456 7890",
		);
	const phone = toWaPhone(input.phone);
	if (await isTeamPhone(phone))
		return fail(
			"nomor_tim",
			"Nomor ini terdaftar sebagai tim Tetra, bukan rekanan.",
		);

	const admin = createAdminClient();
	const { data: person0 } = await admin
		.from("portal_people")
		.select("id, name")
		.eq("phone", phone)
		.maybeSingle();
	// Verifikasi WA membuat orangnya tanpa nama → isi nama PIC.
	if (person0 && !person0.name)
		await admin
			.from("portal_people")
			.update({ name: input.nama_pic })
			.eq("id", person0.id);

	// 1) Sudah anggota vendor → vendor itu (idempoten).
	if (person0) {
		const { data: ms } = await admin
			.from("vendor_members")
			.select("contact:contacts(id, name, vendor_settings)")
			.eq("person_id", person0.id);
		const c = (ms ?? [])
			.map(
				(m) =>
					m.contact as unknown as {
						id: string;
						name: string;
						vendor_settings: unknown;
					} | null,
			)
			.find(Boolean);
		if (c) return done(c, person0.id, false);
	}

	// 2) Nomor tercatat di vendor lama (nomor kontak / PIC) → ikut vendor itu.
	const { data: vendors } = await admin
		.from("contacts")
		.select(
			"id, name, phone, default_pic_contact, vendor_pics, vendor_settings",
		)
		.eq("type", "vendor");
	const list = (vendors ?? []) as VendorRow[];
	const lama = list.find(
		(v) =>
			samePhone(v.phone, phone) ||
			samePhone(v.default_pic_contact, phone) ||
			(v.vendor_pics ?? []).some((p) => samePhone(p.contact, phone)),
	);
	if (lama && !vendorSettings(lama.vendor_settings).portal_enabled)
		return fail(
			"portal_dimatikan",
			"Akses dasbor rekanan untuk usaha ini sedang dimatikan. Hubungi admin Tetra, ya.",
		);

	let contact = lama ?? null;
	if (!contact) {
		const { data, error } = await admin
			.from("contacts")
			.insert({
				type: "vendor",
				name: input.nama_usaha,
				phone,
				default_pic_name: input.nama_pic,
				default_pic_contact: phone,
				vendor_pics: [{ name: input.nama_pic, contact: phone, role: "Owner" }],
				vendor_settings: { partner_level: "calon" },
				vendor_signup: {
					jenis: input.jenis,
					kota: input.kota || null,
					instagram: cleanInstagram(input.instagram),
					sumber: via.sumber,
					wa_jid: via.waJid ?? null,
					at: new Date().toISOString(),
				},
			})
			.select(
				"id, name, phone, default_pic_contact, vendor_pics, vendor_settings",
			)
			.single();
		if (error || !data)
			return fail("gagal", "Gagal menyimpan pendaftaran. Coba lagi, ya.");
		contact = data as VendorRow;
	}

	let personId = person0?.id as string | undefined;
	if (!personId) {
		const { data, error } = await admin
			.from("portal_people")
			.insert({ phone, name: input.nama_pic })
			.select("id")
			.single();
		if (error || !data)
			return fail("gagal", "Gagal menyimpan pendaftaran. Coba lagi, ya.");
		personId = data.id as string;
	}
	await admin
		.from("vendor_members")
		.upsert(
			{ contact_id: contact.id, person_id: personId },
			{ onConflict: "contact_id,person_id", ignoreDuplicates: true },
		);
	if (lama) await syncVendorBookings(personId);

	const twin = lama
		? null
		: list.find((v) => normName(v.name) === normName(input.nama_usaha));
	await notifyOwner({
		contactId: contact.id,
		vendorName: contact.name,
		input: { ...input, phone },
		sumber: via.sumber,
		lama: !!lama,
		twin: twin?.name ?? null,
	});
	return done(contact, personId, !lama);

	async function done(
		c: { id: string; name: string; vendor_settings: unknown },
		pid: string,
		baru: boolean,
	): Promise<VendorSignupResult> {
		const set = vendorSettings(c.vendor_settings);
		if (!set.portal_enabled)
			return fail(
				"portal_dimatikan",
				"Akses dasbor rekanan untuk usaha ini sedang dimatikan. Hubungi admin Tetra, ya.",
			);
		const [{ count: events }, { count: bookings }] = await Promise.all([
			admin
				.from("events")
				.select("id", { count: "exact", head: true })
				.eq("vendor_contact_id", c.id)
				.is("deleted_at", null),
			admin
				.from("booking_members")
				.select("booking_id", { count: "exact", head: true })
				.eq("person_id", pid),
		]);
		const calon = set.partner_level === "calon";
		return {
			ok: true,
			contactId: c.id,
			personId: pid,
			vendorName: c.name,
			baru,
			status: calon ? "calon" : "rekanan",
			akunKosong: calon && !bookings && !events,
			events: events ?? 0,
		};
	}
}

/** Telegram grup owner + notifikasi in-app. Best-effort, tidak pernah throw. */
async function notifyOwner(x: {
	contactId: string;
	vendorName: string;
	input: {
		nama_usaha: string;
		jenis: keyof typeof JENIS_REKANAN;
		nama_pic: string;
		phone: string;
		kota?: string | null;
		instagram?: string | null;
	};
	sumber: "portal" | "wa_bot";
	lama: boolean;
	twin: string | null;
}): Promise<void> {
	try {
		const url = `${appUrl()}/vendors/${x.contactId}`;
		const asal =
			x.sumber === "wa_bot" ? "diundang bot WA" : "daftar sendiri di portal";
		const ig = cleanInstagram(x.input.instagram);
		const title = x.lama
			? `${x.input.nama_pic} masuk dasbor rekanan ${x.vendorName}`
			: `Calon rekanan baru: ${x.input.nama_usaha}`;
		const lines = [
			`🤝 <b>${tgEscape(title)}</b>`,
			`${tgEscape(JENIS_REKANAN[x.input.jenis])}${x.input.kota ? ` · ${tgEscape(x.input.kota)}` : ""} · ${asal}`,
			`👤 ${tgEscape(x.input.nama_pic)} (${tgEscape(x.input.phone)})${ig ? ` · IG @${tgEscape(ig)}` : ""}`,
		];
		if (x.lama)
			lines.push(
				"Nomornya tercatat sebagai PIC vendor ini, jadi langsung ditautkan.",
			);
		if (x.twin)
			lines.push(
				`⚠️ Namanya mirip vendor lama "${tgEscape(x.twin)}" — cek apakah orangnya sama.`,
			);
		lines.push(
			x.lama
				? `<a href="${url}">Buka di Pusat Vendor</a>`
				: `Status: calon (belum rekanan resmi). <a href="${url}">Tinjau di Pusat Vendor</a>`,
		);
		await sendToOwnerGroup(lines.join("\n"));

		const admin = createAdminClient();
		const { data: owners } = await admin
			.from("users")
			.select("id, role")
			.eq("is_active", true)
			.is("deleted_at", null);
		const rows = (owners ?? [])
			.filter((u) => u.role === "owner" || u.role === "super_admin")
			.map((u) => ({
				user_id: u.id,
				severity: "info",
				category: "operational",
				title,
				body: `${JENIS_REKANAN[x.input.jenis]} · ${x.input.nama_pic} (${x.input.phone}) · ${asal}.${x.twin ? ` Nama mirip vendor lama "${x.twin}".` : ""}`,
				entity_type: "contact",
				entity_id: x.contactId,
				action_url: `/vendors/${x.contactId}`,
			}));
		if (rows.length) await admin.from("notifications").insert(rows);
	} catch (e) {
		console.error("[vendor-signup] notify:", e);
	}
}
