"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
}: {
	name: string;
	email: string;
	role: string;
}) {
	const router = useRouter();
	const [pending, startTransition] = useTransition();

	function handleSignOut() {
		startTransition(async () => {
			const supabase = createClient();
			await supabase.auth.signOut();
			router.push("/login");
			router.refresh();
		});
	}

	return (
		<DropdownMenu>
			<DropdownMenuTrigger className="hover:bg-muted focus-visible:ring-ring rounded-full focus-visible:ring-2 focus-visible:outline-none">
				<Avatar className="h-9 w-9">
					<AvatarFallback className="bg-primary text-primary-foreground text-xs font-medium">
						{initialsOf(name)}
					</AvatarFallback>
				</Avatar>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-60">
				<DropdownMenuLabel className="space-y-0.5">
					<div className="text-foreground text-sm font-medium">{name}</div>
					<div className="text-muted-foreground truncate text-xs font-normal">
						{email}
					</div>
					<div className="text-primary text-xs font-medium">{role}</div>
				</DropdownMenuLabel>
				<DropdownMenuSeparator />
				<DropdownMenuItem
					onClick={handleSignOut}
					disabled={pending}
					className="cursor-pointer"
				>
					<LogOut className="mr-2 h-4 w-4" />
					{pending ? "Signing out…" : "Sign out"}
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
