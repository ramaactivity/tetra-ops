"use client";

import { ChevronDown } from "lucide-react";
import {
	useActionState,
	useEffect,
	useRef,
	useState,
	useTransition,
} from "react";
import { Field, fieldInputClass } from "@/components/catalog/form-kit";
import { topicLabel } from "@/components/leads/leads-shared";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toaster";
import {
	type BotRuleFormState,
	setBotRuleActive,
	updateBotRule,
} from "@/lib/actions/bot-control";
import { cn } from "@/lib/utils";

export type BotRule = {
	id: string;
	name: string;
	keywords: string[];
	reply: string;
	file_path: string | null;
	priority: number;
	is_active: boolean;
};

// Dedicated textarea chrome (height from `rows`, not the baked-in h-10).
const textareaClass =
	"w-full rounded-lg border border-border-default bg-background px-3 py-2.5 text-base md:text-sm text-foreground placeholder:text-muted-foreground/60 leading-relaxed transition-colors focus-visible:border-border-strong focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none resize-y";

export function BotRuleEditor({ rules }: { rules: BotRule[] }) {
	if (rules.length === 0) {
		return (
			<p className="px-5 py-6 type-secondary">
				Belum ada rule. Rule di-seed otomatis dari config bot.
			</p>
		);
	}
	return (
		<div className="divide-y divide-border-subtle">
			{rules.map((r) => (
				<BotRuleRow key={r.id} rule={r} />
			))}
		</div>
	);
}

function BotRuleRow({ rule }: { rule: BotRule }) {
	const [open, setOpen] = useState(false);
	const [active, setActive] = useState(rule.is_active);
	const [togglePending, startToggle] = useTransition();

	const [state, formAction, pending] = useActionState<
		BotRuleFormState,
		FormData
	>(updateBotRule.bind(null, rule.id), undefined);
	const wasPending = useRef(false);

	useEffect(() => {
		if (wasPending.current && !pending) {
			if (state?.ok) toast.success(`Rule "${rule.name}" disimpan`);
			else if (state?.errors?._form) toast.error(state.errors._form[0]);
		}
		wasPending.current = pending;
	}, [pending, state, rule.name]);

	function toggleActive() {
		const next = !active;
		setActive(next);
		startToggle(async () => {
			try {
				await setBotRuleActive(rule.id, next);
				toast.success(
					next
						? `Rule "${rule.name}" diaktifkan`
						: `Rule "${rule.name}" dinonaktifkan`,
				);
			} catch (e) {
				setActive(!next);
				toast.error(e instanceof Error ? e.message : "Gagal toggle rule");
			}
		});
	}

	const err = (k: string) =>
		(
			state?.errors?.[k as keyof typeof state.errors] as string[] | undefined
		)?.[0];

	return (
		<div className={cn("transition-opacity", !active && "opacity-60")}>
			{/* Header row — chevron · priority · name + meta · toggle */}
			<div className="flex items-center gap-3 px-5 py-4">
				<button
					type="button"
					onClick={() => setOpen((o) => !o)}
					className="flex min-w-0 flex-1 items-center gap-3 text-left"
					aria-expanded={open}
				>
					<ChevronDown
						className={cn(
							"size-4 shrink-0 text-muted-foreground/70 transition-transform",
							open && "rotate-180",
						)}
						aria-hidden
					/>
					<span className="grid size-7 shrink-0 place-items-center rounded-full border border-border-default tabular text-[12px] font-semibold text-muted-foreground">
						{rule.priority}
					</span>
					<div className="min-w-0">
						<p className="type-body-strong truncate text-foreground">
							{topicLabel(rule.name)}
						</p>
						<p className="type-caption truncate">
							{rule.keywords.length} keyword · {rule.reply.length} karakter
						</p>
					</div>
				</button>

				<Switch
					checked={active}
					onCheckedChange={toggleActive}
					disabled={togglePending}
					aria-label={`Aktifkan rule ${rule.name}`}
				/>
			</div>

			{/* Editor */}
			{open && (
				<form
					action={formAction}
					className="space-y-5 border-t border-border-subtle bg-secondary/30 px-5 py-5"
				>
					<input type="hidden" name="name" value={rule.name} />

					<div className="grid gap-5 sm:grid-cols-[1fr_140px]">
						<Field
							label="Keywords"
							name={`kw-${rule.id}`}
							hint="Pisahkan dengan koma. Otomatis lowercase & dedup."
							error={err("keywords")}
						>
							<textarea
								id={`kw-${rule.id}`}
								name="keywords"
								rows={2}
								defaultValue={rule.keywords.join(", ")}
								placeholder="harga, pricelist, paket"
								className={textareaClass}
							/>
						</Field>
						<Field
							label="Prioritas"
							name={`prio-${rule.id}`}
							hint="Kecil = duluan"
						>
							<input
								id={`prio-${rule.id}`}
								type="number"
								name="priority"
								min={0}
								max={1000}
								defaultValue={rule.priority}
								className={cn(fieldInputClass, "tabular")}
							/>
						</Field>
					</div>

					<Field
						label="Balasan"
						name={`reply-${rule.id}`}
						hint="Mendukung format WhatsApp: *tebal*, _miring_, emoji."
						error={err("reply")}
					>
						<textarea
							id={`reply-${rule.id}`}
							name="reply"
							rows={8}
							defaultValue={rule.reply}
							className={textareaClass}
						/>
					</Field>

					<Field
						label="File lampiran (opsional)"
						name={`file-${rule.id}`}
						hint="Kosongkan kalau tidak mengirim file."
					>
						<input
							id={`file-${rule.id}`}
							type="text"
							name="file_path"
							defaultValue={rule.file_path ?? ""}
							placeholder="assets/PRICELIST.pdf"
							className={cn(fieldInputClass, "font-mono")}
						/>
					</Field>

					<div className="flex justify-end">
						<Button type="submit" disabled={pending}>
							{pending ? "Menyimpan…" : "Simpan rule"}
						</Button>
					</div>
				</form>
			)}
		</div>
	);
}
