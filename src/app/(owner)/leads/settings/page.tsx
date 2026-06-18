import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Container } from "@/components/layout/container";
import { SectionHeader } from "@/components/layout/section-header";
import { BotEnabledToggle } from "@/components/leads/bot-enabled-toggle";
import {
	type BotRule,
	BotRuleEditor,
} from "@/components/leads/bot-rule-editor";
import {
	type BotSettings,
	BotSettingsForm,
} from "@/components/leads/bot-settings-form";
import { getCurrentUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function LeadsSettingsPage() {
	const me = await getCurrentUser();
	if (!me) redirect("/login");
	if (me.profile.role !== "owner" && me.profile.role !== "super_admin") {
		redirect("/leads");
	}

	const supabase = await createClient();
	const [settingsResult, rulesResult] = await Promise.all([
		supabase.from("bot_settings").select("*").eq("id", 1).maybeSingle(),
		supabase
			.from("bot_rules")
			.select("id, name, keywords, reply, file_path, priority, is_active")
			.order("priority", { ascending: true }),
	]);

	const settingsRow = settingsResult.data as
		| ({ enabled: boolean } & BotSettings)
		| null;
	const rules = (rulesResult.data ?? []) as BotRule[];

	if (!settingsRow) {
		return (
			<Container size="lg">
				<div className="rounded-md border border-destructive bg-destructive/10 p-4">
					<p className="text-fluid-body font-medium text-destructive">
						Setting bot belum ter-seed. Jalankan migration
						20260619_whatsapp_bot_control.sql.
					</p>
				</div>
			</Container>
		);
	}

	const settings: BotSettings = {
		business_start_hour: settingsRow.business_start_hour,
		business_end_hour: settingsRow.business_end_hour,
		timezone_offset: settingsRow.timezone_offset,
		cooldown_hours: settingsRow.cooldown_hours,
		pause_hours: settingsRow.pause_hours,
		salam_reply: settingsRow.salam_reply,
		after_hours_note: settingsRow.after_hours_note,
		admin_notify_jid: settingsRow.admin_notify_jid,
	};

	return (
		<Container size="lg" className="space-y-5">
			<div className="px-5">
				<Link
					href="/leads"
					className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
				>
					<ArrowLeft className="size-3.5" aria-hidden />
					Kembali ke Leads
				</Link>
			</div>

			<SectionHeader
				as="h2"
				title="Setting Bot WhatsApp"
				description="Kontrol bot Tetra Photobooth tanpa SSH. Perubahan dibaca bot dalam ±1 menit."
			/>

			<BotEnabledToggle enabled={settingsRow.enabled} />

			<section className="space-y-3">
				<SectionHeader
					as="h3"
					title="Jam kerja & anti-spam"
					description="Jam operasional, cooldown, auto-pause, salam, & notif admin."
				/>
				<div className="rounded-[16px] border border-border-subtle bg-card p-4 shadow-[var(--shadow-level-2)] sm:p-5">
					<BotSettingsForm settings={settings} />
				</div>
			</section>

			<section className="space-y-3">
				<SectionHeader
					as="h3"
					title="Rule balasan"
					description="Bot mengecek rule aktif urut prioritas (kecil duluan); yang pertama cocok menang."
				/>
				<BotRuleEditor rules={rules} />
			</section>
		</Container>
	);
}
