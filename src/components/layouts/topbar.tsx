import Image from "next/image";
import { cookies } from "next/headers";
import { MobileNavSheet } from "@/components/layouts/mobile-nav-sheet";
import { UserMenu } from "@/components/layouts/user-menu";
import type { Theme } from "@/lib/actions/theme";

export async function TopBar({
	name,
	email,
	role,
	withMobileNav = true,
}: {
	name: string;
	email: string;
	role: string;
	withMobileNav?: boolean;
}) {
	const cookieStore = await cookies();
	const theme: Theme =
		cookieStore.get("theme")?.value === "light" ? "light" : "dark";

	return (
		<header className="bg-background/80 border-border sticky top-0 z-30 flex h-14 items-center justify-between border-b px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60 md:px-6">
			<div className="flex items-center gap-2 md:gap-3">
				{withMobileNav && <MobileNavSheet />}
				<Image
					src={
						theme === "dark"
							? "/brand/logo-monochrome-light.png"
							: "/brand/logo-monochrome-dark.png"
					}
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
			<UserMenu name={name} email={email} role={role} theme={theme} />
		</header>
	);
}
