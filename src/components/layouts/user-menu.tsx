"use client";

import { LogOut, Moon, Sun } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { type Theme, toggleTheme } from "@/lib/actions/theme";
import { createClient } from "@/lib/supabase/client";

function initialsOf(name: string) {
	return name
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((part) => part[0])
		.join("")
		.toUpperCase();
}

export function UserMenu({
	name,
	email,
	role,
	theme,
}: {
	name: string;
	email: string;
	role: string;
	theme: Theme;
}) {
	const router = useRouter();
	const [signingOut, startSignOut] = useTransition();
	const [, startThemeToggle] = useTransition();

	function handleSignOut() {
		startSignOut(async () => {
			const supabase = createClient();
			await supabase.auth.signOut();
			router.push("/login");
			router.refresh();
		});
	}

	function handleToggleTheme() {
		startThemeToggle(async () => {
			await toggleTheme(theme);
			router.refresh();
		});
	}

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				aria-label="Account menu"
				className="hover:bg-muted focus-visible:ring-ring inline-flex h-11 w-11 items-center justify-center rounded-full focus-visible:ring-2 focus-visible:outline-none"
			>
				<Avatar className="h-9 w-9">
					<AvatarFallback className="bg-[#059669] text-white text-xs font-medium">
						{initialsOf(name)}
					</AvatarFallback>
				</Avatar>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-60">
				<DropdownMenuGroup>
					<DropdownMenuLabel className="space-y-0.5">
						<div className="text-foreground text-sm font-medium">{name}</div>
						<div className="text-muted-foreground truncate text-xs font-normal">
							{email}
						</div>
						<div className="text-primary text-xs font-medium">{role}</div>
					</DropdownMenuLabel>
				</DropdownMenuGroup>
				<DropdownMenuSeparator />
				<DropdownMenuItem
					onClick={handleToggleTheme}
					className="cursor-pointer"
				>
					{theme === "dark" ? (
						<Sun className="mr-2 h-4 w-4" />
					) : (
						<Moon className="mr-2 h-4 w-4" />
					)}
					{theme === "dark" ? "Switch to light" : "Switch to dark"}
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuItem
					onClick={handleSignOut}
					disabled={signingOut}
					className="cursor-pointer"
				>
					<LogOut className="mr-2 h-4 w-4" />
					{signingOut ? "Signing out…" : "Sign out"}
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
