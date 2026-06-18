"use client";

import { ChevronDown } from "lucide-react";
import {
	useActionState,
	useEffect,
	useRef,
	useState,
	useTransition,
} from "react";
import { topicLabel } from "@/components/leads/leads-shared";
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

const inputClass =
	"border-border-default bg-background text-foreground focus-visible:ring-ring w-full rounded-md border px-3 py-2 text-sm placeholder:text-muted-foreground/60 focus-visible:ring-2 focus-visible:outline-none";

export function BotRuleEditor({ rules }: { rules: BotRule[] }) {
	if (rules.length === 0) {
		return (
			<p className="rounded-md border border-border-default bg-surface-2 p-4 text-sm text-muted-foreground">
				Belum ada rule. Rule di-seed otomatis dari config bot.
			</p>
		);
	}
	return (
		<div className="space-y-3">
			{rules.map((r) => (
				<BotRuleCard key={r.id} rule={r} />
			))}
		</div>
	);
}

function BotRuleCard({ rule }: { rule: BotRule }) {
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
		<div className="overflow-hidden rounded-[16px] border border-border-subtle bg-card shadow-[var(--shadow-level-2)]">
			{/* Header row */}
			<div className="flex items-center gap-3 p-4">
				<button
					type="button"
					onClick={() => setOpen((o) => !o)}
					className="flex min-w-0 flex-1 items-center gap-3 text-left"
					aria-expanded={open}
				>
					<ChevronDown
						className={cn(
							"size-4 shrink-0 text-muted-foreground transition-transform",
							open && "rotate-180",
						)}
						aria-hidden
					/>
					<span className="grid size-7 shrink-0 place-items-center rounded-full border border-border-default text-[12px] font-semibold tabular text-muted-foreground">
						{rule.priority}
					</span>
					<div className="min-w-0">
						<p className="truncate text-[15px] font-semibold text-foreground">
							{topicLabel(rule.name)}
						</p>
						<p className="truncate text-[12.5px] text-muted-foreground">
							{rule.keywords.length} keyword · {rule.reply.length} karakter
						</p>
					</div>
				</button>

				<button
					type="button"
					role="switch"
					aria-checked={active}
					aria-label={`Aktifkan rule ${rule.name}`}
					disabled={togglePending}
					onClick={toggleActive}
					className={cn(
						"relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-60",
						active ? "bg-[#059669]" : "bg-border-default",
					)}
				>
					<span
						className={cn(
							"inline-block size-4 transform rounded-full bg-white shadow transition-transform",
							active ? "translate-x-6" : "translate-x-1",
						)}
					/>
				</button>
			</div>

			{/* Editor */}
			{open && (
				<form
					action={formAction}
					className="space-y-4 border-t border-border-subtle px-4 py-4"
				>
					<input type="hidden" name="name" value={rule.name} />

					<div className="grid gap-4 sm:grid-cols-[1fr_auto]">
						<div className="space-y-1.5">
							<label htmlFor={`kw-${rule.id}`} className="text-sm font-medium">
								Keywords
							</label>
							<textarea
								id={`kw-${rule.id}`}
								name="keywords"
								rows={2}
								defaultValue={rule.keywords.join(", ")}
								placeholder="harga, pricelist, paket"
								className={inputClass}
							/>
							{err("keywords") ? (
								<p className="text-xs text-destructive">{err("keywords")}</p>
							) : (
								<p className="text-xs text-muted-foreground">
									Pisahkan dengan koma. Otomatis lowercase & dedup.
								</p>
							)}
						</div>
						<div className="space-y-1.5 sm:w-[120px]">
							<label
								htmlFor={`prio-${rule.id}`}
								className="text-sm font-medium"
							>
								Prioritas
							</label>
							<input
								id={`prio-${rule.id}`}
								type="number"
								name="priority"
								min={0}
								max={1000}
								defaultValue={rule.priority}
								className={`${inputClass} tabular`}
							/>
							<p className="text-xs text-muted-foreground">Kecil = duluan</p>
						</div>
					</div>

					<div className="space-y-1.5">
						<label htmlFor={`reply-${rule.id}`} className="text-sm font-medium">
							Balasan
						</label>
						<textarea
							id={`reply-${rule.id}`}
							name="reply"
							rows={8}
							defaultValue={rule.reply}
							className={`${inputClass} leading-relaxed`}
						/>
						{err("reply") ? (
							<p className="text-xs text-destructive">{err("reply")}</p>
						) : (
							<p className="text-xs text-muted-foreground">
								Mendukung format WhatsApp: *tebal*, _miring_, emoji.
							</p>
						)}
					</div>

					<div className="space-y-1.5">
						<label htmlFor={`file-${rule.id}`} className="text-sm font-medium">
							File lampiran (opsional)
						</label>
						<input
							id={`file-${rule.id}`}
							type="text"
							name="file_path"
							defaultValue={rule.file_path ?? ""}
							placeholder="assets/PRICELIST.pdf — kosongkan kalau tidak kirim file"
							className={`${inputClass} font-mono`}
						/>
					</div>

					<div className="flex justify-end">
						<button
							type="submit"
							disabled={pending}
							className="inline-flex h-9 items-center rounded-md bg-[#059669] px-4 text-sm font-medium text-white hover:bg-[#047857] disabled:opacity-60 dark:bg-[#0b9e6a] dark:hover:bg-[#059669]"
						>
							{pending ? "Menyimpan…" : "Simpan rule"}
						</button>
					</div>
				</form>
			)}
		</div>
	);
}
