import { redirect } from "next/navigation";
import { Container } from "@/components/layout/container";
import { BotConnectionHero } from "@/components/leads/bot-connection-panel";
import { BotEnabledToggle } from "@/components/leads/bot-enabled-toggle";
import { type BotRule, BotRuleEditor } from "@/components/leads/bot-rule-editor";
import {
	type BotSettings,
	BotSettingsForm,
} from "@/components/leads/bot-settings-form";
import { TopbarEntityPortal } from "@/components/layouts/topbar-entity-portal";
import { getCurrentUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** A titled white panel — header (title + subtitle) sits INSIDE the card so it
 *  lines up with the hero title and every other inset surface on the page
 *  (Operations detail pattern). `flushBody` drops body padding for row lists. */
function Panel({
	title,
	subtitle,
	flushBody = false,
	children,
}: {
	title: string;
	subtitle: string;
	flushBody?: boolean;
	children: React.ReactNode;
}) {
	return (
		<section className="overflow-hidden rounded-2xl border border-border-subtle bg-card shadow-[var(--shadow-level-2)]">
			<div className="px-5 py-4">
				<h2 className="type-heading text-foreground">{title}</h2>
				<p className="type-secondary mt-0.5 leading-snug">{subtitle}</p>
			</div>
			<div
				className={
					flushBody ? "border-t border-border-subtle" : "border-t border-border-subtle px-5 py-5"
				}
			>
				{children}
			</div>
		</section>
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
			<Container size="lg" className="space-y-3">
				<TopbarEntityPortal name="Setting Bot" />
				<BotConnectionHero initial={statusRow} />
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
		<Container size="lg" className="space-y-3">
			<TopbarEntityPortal name="Setting Bot" />

			<BotConnectionHero initial={statusRow} />

			<BotEnabledToggle enabled={settingsRow.enabled} />

			<Panel
				title="Jam kerja & anti-spam"
				subtitle="Jam operasional, cooldown, auto-pause, template balasan, dan notif admin."
			>
				<BotSettingsForm settings={settings} />
			</Panel>

			<Panel
				title="Rule balasan"
				subtitle="Bot mengecek rule aktif urut prioritas (kecil duluan); yang pertama cocok menang."
				flushBody
			>
				<BotRuleEditor rules={rules} />
			</Panel>
		</Container>
	);
}
