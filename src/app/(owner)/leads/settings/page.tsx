import { redirect } from "next/navigation";
import { CatalogFormCard, CatalogFormHeader } from "@/components/catalog/form-kit";
import { Container } from "@/components/layout/container";
import { BotConnectionPanel } from "@/components/leads/bot-connection-panel";
import { BotEnabledToggle } from "@/components/leads/bot-enabled-toggle";
import { type BotRule, BotRuleEditor } from "@/components/leads/bot-rule-editor";
import {
	type BotSettings,
	BotSettingsForm,
} from "@/components/leads/bot-settings-form";
import { getCurrentUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Flush section heading — shares the container's left edge with the page
 *  header so every title, label, and body block lines up on one rail. */
function SectionHeading({
	title,
	description,
}: {
	title: string;
	description: string;
}) {
	return (
		<div className="space-y-1">
			<h2 className="type-heading text-foreground">{title}</h2>
			<p className="type-secondary leading-snug">{description}</p>
		</div>
	);
}

export default async function LeadsSettingsPage() {
	const me = await getCurrentUser();
	if (!me) redirect("/login");
	if (me.profile.role !== "owner" && me.profile.role !== "super_admin") {
		redirect("/leads");
	}

	const supabase = await createClient();
	const [settingsResult, rulesResult, statusResult] = await Promise.all([
		supabase.from("bot_settings").select("*").eq("id", 1).maybeSingle(),
		supabase
			.from("bot_rules")
			.select("id, name, keywords, reply, file_path, priority, is_active")
			.order("priority", { ascending: true }),
		supabase
			.from("bot_status")
			.select("connection, qr, last_connected_at")
			.eq("id", 1)
			.maybeSingle(),
	]);

	const settingsRow = settingsResult.data as
		| ({ enabled: boolean } & BotSettings)
		| null;
	const rules = (rulesResult.data ?? []) as BotRule[];
	const statusRow = (statusResult.data as {
		connection: string;
		qr: string | null;
		last_connected_at: string | null;
	} | null) ?? { connection: "unknown", qr: null, last_connected_at: null };

	if (!settingsRow) {
		return (
			<Container size="lg" className="space-y-6">
				<CatalogFormHeader
					backHref="/leads"
					backLabel="Leads"
					eyebrow="Kontrol Bot"
					title="Setting Bot WhatsApp"
					description="Kontrol bot Tetra Photobooth tanpa SSH."
				/>
				<div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-5">
					<p className="type-body-strong text-destructive">
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
		<Container size="lg" className="space-y-6">
			<CatalogFormHeader
				backHref="/leads"
				backLabel="Leads"
				eyebrow="Kontrol Bot"
				title="Setting Bot WhatsApp"
				description="Kontrol bot Tetra Photobooth tanpa SSH. Perubahan dibaca bot dalam ±1 menit."
			/>

			<BotConnectionPanel initial={statusRow} />

			<BotEnabledToggle enabled={settingsRow.enabled} />

			<section className="space-y-3">
				<SectionHeading
					title="Jam kerja & anti-spam"
					description="Jam operasional, cooldown, auto-pause, template salam, dan notif admin."
				/>
				<CatalogFormCard>
					<BotSettingsForm settings={settings} />
				</CatalogFormCard>
			</section>

			<section className="space-y-3">
				<SectionHeading
					title="Rule balasan"
					description="Bot mengecek rule aktif urut prioritas (kecil duluan); yang pertama cocok menang."
				/>
				<BotRuleEditor rules={rules} />
			</section>
		</Container>
	);
}
