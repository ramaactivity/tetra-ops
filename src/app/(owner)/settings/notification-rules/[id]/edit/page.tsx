import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { NotificationRuleForm } from "@/components/notification-rules/rule-form";
import { createClient } from "@/lib/supabase/server";

export default async function EditNotificationRulePage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	const supabase = await createClient();

	const { data: rule } = await supabase
		.from("notification_rules")
		.select(
			"id, code, name, description, category, severity, trigger_condition, recipient_roles, send_push, is_enabled",
		)
		.eq("id", id)
		.maybeSingle();

	if (!rule) notFound();

	const defaults = {
		name: rule.name,
		description: rule.description ?? "",
		severity: rule.severity as "alert" | "warning" | "info" | "success",
		recipient_roles: (rule.recipient_roles ?? []) as Array<
			"super_admin" | "owner" | "crew"
		>,
		send_push: !!rule.send_push,
		is_enabled: !!rule.is_enabled,
	};

	return (
		<div className="space-y-4">
			<Link
				href="/settings/notification-rules"
				className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
			>
				<ChevronLeft className="h-4 w-4" />
				Notification Rules
			</Link>
			<div>
				<h2 className="text-xl font-semibold tracking-tight">
					Edit: {rule.name}
				</h2>
				<p className="text-muted-foreground tabular text-sm">
					{rule.code} · {rule.category}
				</p>
			</div>
			<div className="border-border-default bg-surface-2 max-w-2xl rounded-xl border p-5">
				<NotificationRuleForm
					id={rule.id}
					defaults={defaults}
					triggerCondition={
						rule.trigger_condition as Record<string, unknown> | null
					}
				/>
			</div>
		</div>
	);
}
