import { cookies } from "next/headers";
import { Search } from "lucide-react";
import Image from "next/image";
import { NotificationBell } from "@/components/layouts/notification-bell";
import { UserMenu } from "@/components/layouts/user-menu";
import type { Theme } from "@/lib/actions/theme";

/**
 * <OwnerTopBar /> — UpGradely DNA: a floating white card holding the global
 * search (left) and the user identity + notifications (right). Sits over the
 * ambient gradient inside the content column (logo lives in the sidebar on
 * desktop; shown here only on mobile where the sidebar is hidden).
 */
export async function OwnerTopBar({
	name,
	email,
	role,
}: {
	name: string;
	email: string;
	role: string;
}) {
	const cookieStore = await cookies();
	const theme: Theme =
		cookieStore.get("theme")?.value === "dark" ? "dark" : "light";

	return (
		<header
			style={{ viewTransitionName: "site-header" }}
			className="sticky top-3 z-30 flex items-center gap-3 rounded-[24px] border border-border-subtle bg-card px-3.5 py-3 shadow-[var(--shadow-level-2)]"
		>
			{/* Mobile-only brand (desktop logo is in the sidebar) */}
			<Image
				src={
					theme === "dark"
						? "/brand/logo-monochrome-light.png"
						: "/brand/logo-monochrome-dark.png"
				}
				alt="Tetra"
				width={120}
				height={36}
				className="h-6 w-auto shrink-0 md:hidden"
				priority
			/>

			<div className="relative hidden w-full max-w-lg sm:block">
				<Search
					className="pointer-events-none absolute left-4 top-1/2 size-[17px] -translate-y-1/2 text-muted-foreground"
					strokeWidth={2}
				/>
				<input
					type="search"
					placeholder="Cari event, klien, transaksi…"
					aria-label="Cari"
					className="h-10 w-full rounded-[14px] bg-secondary pl-11 pr-4 text-[14px] text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
				/>
			</div>

			<div className="ml-auto flex shrink-0 items-center gap-1.5">
				<span className="hidden text-[14px] font-medium text-foreground lg:inline">
					{name}
				</span>
				<UserMenu name={name} email={email} role={role} theme={theme} />
				<NotificationBell />
			</div>
		</header>
	);
}
