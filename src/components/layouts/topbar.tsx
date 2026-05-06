import Image from "next/image";
import { UserMenu } from "@/components/layouts/user-menu";

export function TopBar({
	name,
	email,
	role,
}: {
	name: string;
	email: string;
	role: string;
}) {
	return (
		<header className="bg-background/80 border-border sticky top-0 z-30 flex h-14 items-center justify-between border-b px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60 md:px-6">
			<div className="flex items-center gap-3">
				<Image
					src="/brand/logo-monochrome-light.png"
					alt="Tetra"
					width={120}
					height={36}
					className="h-7 w-auto"
					priority
				/>
				<span className="text-muted-foreground hidden text-xs uppercase tracking-wider sm:inline">
					Operations
				</span>
			</div>
			<UserMenu name={name} email={email} role={role} />
		</header>
	);
}
