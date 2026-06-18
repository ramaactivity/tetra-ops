import { notFound } from "next/navigation";
import { SectionHeader } from "@/components/layout/section-header";
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
			<SectionHeader
				as="h2"
				title={`Edit: ${rule.name}`}
				description={
					<span className="tabular">
						{rule.code} · {rule.category}
					</span>
				}
			/>
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
