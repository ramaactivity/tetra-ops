import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CutoffWizard } from "@/components/cutoff/wizard";
import { buttonVariants } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth/get-user";
import type { CutoffBankOption, CutoffItemOption } from "@/lib/cutoff/types";
import { isDriveConfigured } from "@/lib/drive/client";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Cutoff Keuangan" };

/** Today in Asia/Jakarta as YYYY-MM-DD (default cutoff date). */
function jakartaToday(): string {
	return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
}

export default async function CutoffPage() {
	const me = await getCurrentUser();
	if (!me) redirect("/login");
	if (me.profile.role !== "owner" && me.profile.role !== "super_admin") {
		redirect("/");
	}

	const sb = await createClient();

	// Already done? → show summary instead of the wizard.
	const { data: cfg } = await sb
		.from("system_config")
		.select("value")
		.eq("key", "finance_cutoff_date")
		.maybeSingle();
	const cutoffValue =
		typeof cfg?.value === "string" && cfg.value.length > 0 ? cfg.value : null;

	if (cutoffValue) {
		return (
			<div className="rounded-2xl border border-border-subtle bg-card p-6 text-center sm:p-10">
				<div className="mx-auto flex size-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
					<CheckCircle2 className="size-6" />
				</div>
				<h2 className="mt-4 text-lg font-semibold">Cutoff sudah dijalankan</h2>
				<p className="mt-1 text-sm text-muted-foreground">
					Pembukuan keuangan dimulai bersih dari{" "}
					<span className="font-medium text-foreground">{cutoffValue}</span>.
					Cutoff hanya bisa dijalankan sekali.
				</p>
				<div className="mt-5 flex justify-center gap-2">
					<Link
						href="/finance"
						className={buttonVariants({ variant: "default" })}
					>
						Buka Neraca
					</Link>
				</div>
			</div>
		);
	}

	// Bank accounts (active) + inventory items (active) for the wizard inputs.
	const [{ data: bankRows }, { data: itemRows }] = await Promise.all([
		sb
			.from("bank_accounts")
			.select("coa_code, account_name, bank_name")
			.eq("is_active", true)
			// 1-100 Kas Tunai punya field khusus (cash) — jangan dobel di daftar bank.
			.neq("coa_code", "1-100")
			.order("coa_code"),
		sb
			.from("inventory_items")
			.select("id, sku, name, unit")
			.eq("category", "inventory")
			.eq("is_active", true)
			.is("deleted_at", null)
			.order("sku"),
	]);

	const banks: CutoffBankOption[] = (bankRows ?? []).map((b) => ({
		coa_code: b.coa_code as string,
		accountName: (b.account_name as string) ?? "",
		bankName: (b.bank_name as string) ?? "",
	}));
	const items: CutoffItemOption[] = (itemRows ?? []).map((i) => ({
		item_id: i.id as string,
		sku: (i.sku as string) ?? "",
		name: (i.name as string) ?? "",
		unit: (i.unit as string) ?? "unit",
	}));

	return (
		<div className="space-y-4">
			<div>
				<h1 className="text-lg font-semibold">Cutoff Keuangan</h1>
				<p className="text-sm text-muted-foreground">
					Mulai pembukuan dari titik nol dengan saldo awal yang benar.
				</p>
			</div>
			<CutoffWizard
				today={jakartaToday()}
				banks={banks}
				items={items}
				driveConfigured={isDriveConfigured()}
			/>
		</div>
	);
}
