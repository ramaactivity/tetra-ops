import {
	Activity,
	Bell,
	DollarSign,
	Pencil,
	Settings as SettingsIcon,
	Warehouse,
} from "lucide-react";
import Link from "next/link";
import { ToggleRuleEnabledButton } from "@/components/notification-rules/toggle-enabled-button";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";

type RuleRow = {
	id: string;
	code: string;
	name: string;
	description: string | null;
	category: "operational" | "financial" | "inventory" | "system";
	severity: "alert" | "warning" | "info" | "success";
	recipient_roles: string[];
	send_push: boolean;
	is_enabled: boolean;
};

const CATEGORY_META: Record<
	string,
	{ label: string; icon: typeof Bell; tone: string; hint: string }
> = {
	operational: {
		label: "Operasional",
		icon: Activity,
		tone: "text-primary",
		hint: "Kesiapan event: crew, design, jadwal.",
	},
	financial: {
		label: "Financial",
		icon: DollarSign,
		tone: "text-emerald-500",
		hint: "DP, pelunasan, overdue, profit/loss.",
	},
	inventory: {
		label: "Inventory",
		icon: Warehouse,
		tone: "text-amber-500",
		hint: "Stok kritis, equipment movement.",
	},
	system: {
		label: "System",
		icon: SettingsIcon,
		tone: "text-sky-500",
		hint: "Approval user, dependency external.",
	},
};

const SEVERITY_TONE: Record<
	string,
	{
		variant: "default" | "secondary" | "destructive" | "outline";
		className?: string;
	}
> = {
	alert: { variant: "destructive" },
	warning: {
		variant: "outline",
		className:
			"border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
	},
	info: {
		variant: "outline",
		className: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400",
	},
	success: {
		variant: "outline",
		className:
			"border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
	},
};

const ROLE_LABELS: Record<string, string> = {
	super_admin: "Super Admin",
	owner: "Owner",
	crew: "Crew",
};

export default async function NotificationRulesListPage() {
	const supabase = await createClient();
	const { data, error } = await supabase
		.from("notification_rules")
		.select(
			"id, code, name, description, category, severity, recipient_roles, send_push, is_enabled",
		)
		.order("category", { ascending: true })
		.order("severity", { ascending: true });

	if (error) {
		return (
			<div className="border-destructive bg-destructive/10 rounded-md border p-4">
				<p className="text-destructive text-sm font-medium">
					Gagal memuat rules: {error.message}
				</p>
			</div>
		);
	}

	const rules = (data ?? []) as RuleRow[];
	const enabledCount = rules.filter((r) => r.is_enabled).length;

	const grouped = new Map<string, RuleRow[]>();
	for (const r of rules) {
		const arr = grouped.get(r.category) ?? [];
		arr.push(r);
		grouped.set(r.category, arr);
	}

	const categories = ["operational", "financial", "inventory", "system"].filter(
		(c) => grouped.has(c),
	);

	return (
		<div className="space-y-6">
			<div className="space-y-1">
				<h2 className="text-xl font-semibold tracking-tight">
					Notification Rules
				</h2>
				<p className="text-muted-foreground text-sm">
					{rules.length} rule · {enabledCount} aktif. Anomaly scanner
					mengevaluasi rules aktif (cron Phase 3) plus on-demand triggers.
				</p>
			</div>

			{rules.length === 0 ? (
				<div className="border-border-default bg-surface-2 flex flex-col items-center gap-3 rounded-xl border border-dashed p-16 text-center">
					<Bell className="text-muted-foreground h-10 w-10" />
					<div className="space-y-1">
						<h3 className="font-medium">Belum ada rule</h3>
						<p className="text-muted-foreground text-sm">
							Rules biasanya di-seed saat install schema awal.
						</p>
					</div>
				</div>
			) : (
				<div className="space-y-6">
					{categories.map((cat) => {
						const meta = CATEGORY_META[cat] ?? {
							label: cat,
							icon: Bell,
							tone: "",
							hint: "",
						};
						const Icon = meta.icon;
						const items = grouped.get(cat) ?? [];
						return (
							<section key={cat} className="space-y-3">
								<div className="flex items-baseline gap-2">
									<Icon className={`${meta.tone} h-4 w-4`} />
									<h3 className="text-base font-semibold">{meta.label}</h3>
									<span className="text-muted-foreground text-xs">
										{meta.hint}
									</span>
								</div>
								<div className="space-y-2">
									{items.map((r) => {
										const sev = SEVERITY_TONE[r.severity];
										return (
											<div
												key={r.id}
												className="border-border-default bg-surface-2 flex items-start justify-between gap-3 rounded-lg border p-4"
											>
												<div className="flex-1 space-y-2">
													<div className="flex flex-wrap items-baseline gap-2">
														<h4 className="text-sm font-medium">{r.name}</h4>
														<Badge
															variant={sev.variant}
															className={sev.className}
														>
															{r.severity}
														</Badge>
														<code className="text-muted-foreground bg-muted rounded px-1.5 py-0.5 font-mono text-[10px]">
															{r.code}
														</code>
														{!r.is_enabled && (
															<span className="text-muted-foreground/70 text-xs italic">
																(disabled)
															</span>
														)}
													</div>
													{r.description && (
														<p className="text-muted-foreground text-xs">
															{r.description}
														</p>
													)}
													<div className="flex flex-wrap items-center gap-2 text-xs">
														<span className="text-muted-foreground">
															Kirim ke:
														</span>
														{r.recipient_roles.map((role) => (
															<span
																key={role}
																className="border-border-default bg-muted/50 rounded-full border px-2 py-0.5 font-medium"
															>
																{ROLE_LABELS[role] ?? role}
															</span>
														))}
														{r.send_push && (
															<span className="text-primary inline-flex items-center gap-0.5 font-medium">
																<Bell className="h-3 w-3" />
																Push
															</span>
														)}
													</div>
												</div>
												<div className="flex items-center gap-1">
													<Link
														href={`/settings/notification-rules/${r.id}/edit`}
														title="Edit"
														className="text-muted-foreground hover:bg-muted hover:text-foreground inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors"
													>
														<Pencil className="h-4 w-4" />
													</Link>
													<ToggleRuleEnabledButton
														id={r.id}
														isEnabled={r.is_enabled}
														name={r.name}
													/>
												</div>
											</div>
										);
									})}
								</div>
							</section>
						);
					})}
				</div>
			)}
		</div>
	);
}
