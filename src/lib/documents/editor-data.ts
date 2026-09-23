import "server-only";

import type {
	AddonOption,
	PackageOption,
} from "@/components/documents/document-editor";
import { createClient } from "@/lib/supabase/server";
import { loadSigners } from "./load";

/** Data pendukung editor: paket, add-on, penanda tangan, rate gross-up default. */
export async function loadEditorData() {
	const supabase = await createClient();
	const [{ data: packages }, { data: addons }, signers, { data: cfg }] =
		await Promise.all([
			supabase
				.from("packages")
				.select(
					"id, name, category, duration_hours, base_price, quotation_includes",
				)
				.eq("is_active", true)
				.is("deleted_at", null)
				.order("category")
				.order("base_price"),
			supabase
				.from("addons")
				.select("id, name, unit, price")
				.eq("is_active", true)
				.is("deleted_at", null)
				.order("category")
				.order("price"),
			loadSigners(),
			supabase
				.from("system_config")
				.select("value")
				.eq("key", "tax.default_grossup_rate_pct")
				.maybeSingle(),
		]);
	const v = cfg?.value;
	const grossupRate =
		typeof v === "number" ? v : typeof v === "string" ? Number(v) || 2 : 2;
	return {
		packages: (packages ?? []) as PackageOption[],
		addons: (addons ?? []) as AddonOption[],
		signers,
		grossupRate,
	};
}
