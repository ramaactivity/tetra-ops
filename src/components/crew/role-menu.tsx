"use client";

import { ChevronDown } from "lucide-react";
import { useState, useTransition } from "react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { updateUserRole } from "@/lib/actions/crew";

type Role = "super_admin" | "owner" | "crew" | "pending_approval";

const ROLE_OPTIONS: Array<{
	role: Role;
	tier: "senior" | "junior" | null;
	label: string;
}> = [
	{ role: "owner", tier: null, label: "Promote to Owner" },
	{ role: "crew", tier: "senior", label: "Set as Crew · Senior" },
	{ role: "crew", tier: "junior", label: "Set as Crew · Junior" },
	{ role: "pending_approval", tier: null, label: "Reset to Pending" },
];

export function CrewRoleMenu({
	userId,
	userName,
	currentRole,
	currentTier,
	disabled,
}: {
	userId: string;
	userName: string;
	currentRole: Role;
	currentTier: string | null;
	disabled?: boolean;
}) {
	const [pending, startTransition] = useTransition();
	const [error, setError] = useState<string | null>(null);

	function handleChange(
		role: Role,
		tier: "senior" | "junior" | null,
		label: string,
	) {
		if (role === currentRole && tier === currentTier) return;
		if (!confirm(`${label} untuk ${userName}?`)) return;

		setError(null);
		startTransition(async () => {
			const result = await updateUserRole(userId, role, tier);
			if (result.error) setError(result.error);
		});
	}

	if (disabled) {
		return (
			<span className="text-muted-foreground text-xs">— (akun lu)</span>
		);
	}

	return (
		<div className="space-y-1">
			<DropdownMenu>
				<DropdownMenuTrigger
					disabled={pending}
					className="border-border bg-card hover:bg-muted inline-flex h-8 items-center gap-1 rounded-md border px-2 text-xs font-medium disabled:opacity-50"
				>
					{pending ? "Updating…" : "Change role"}
					<ChevronDown className="h-3.5 w-3.5" />
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="w-52">
					<DropdownMenuLabel className="text-muted-foreground text-xs">
						Set role for {userName}
					</DropdownMenuLabel>
					<DropdownMenuSeparator />
					{ROLE_OPTIONS.map((opt) => {
						const isCurrent =
							opt.role === currentRole && opt.tier === currentTier;
						return (
							<DropdownMenuItem
								key={`${opt.role}-${opt.tier ?? "none"}`}
								onClick={() => handleChange(opt.role, opt.tier, opt.label)}
								disabled={isCurrent}
								className="cursor-pointer text-xs"
							>
								{opt.label}
								{isCurrent && (
									<span className="text-muted-foreground ml-auto">
										current
									</span>
								)}
							</DropdownMenuItem>
						);
					})}
				</DropdownMenuContent>
			</DropdownMenu>
			{error && <p className="text-destructive text-xs">{error}</p>}
		</div>
	);
}
