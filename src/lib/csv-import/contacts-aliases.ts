// Header alias map for DB_CONTACTS legacy CSV — separate from server actions
// (Next.js forbids non-async-function exports from "use server").

export const CONTACT_HEADER_ALIASES: Record<string, string> = {
	contact_id: "legacy_contact_id",
	id: "legacy_contact_id",
	type: "type",
	contact_type: "type",
	name: "name",
	contact_name: "name",
	phone: "phone",
	wa: "phone",
	whatsapp: "phone",
	mobile: "phone",
	email: "email",
	notes: "notes",
};
