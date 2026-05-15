/**
 * Auth route group layout — login, register, pending, onboarding,
 * crew-portal share this background.
 *
 * A2 refactor (sesi 5):
 * - Sunrise + Aurora radial gradient orbs (was hand-rolled rose/amber/sky/
 *   indigo blends with hard-coded color stops). Now uses F1 gradient
 *   tokens; consistent with design system §12.1 brand layer.
 * - Mobile padding cap p-4 enforced, py-safe stays for iOS notch.
 */
export default function AuthLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<div className="relative flex min-h-screen flex-1 items-center justify-center overflow-hidden bg-background px-4 pt-safe-or-4 pb-safe-or-4">
			<div
				aria-hidden="true"
				className="pointer-events-none absolute inset-0 -z-10"
			>
				<div className="absolute -top-40 -right-32 h-[40rem] w-[40rem] rounded-full bg-gradient-sunrise-radial opacity-[0.18] blur-3xl dark:opacity-[0.26]" />
				<div className="absolute -bottom-32 -left-32 h-[32rem] w-[32rem] rounded-full bg-gradient-aurora-radial opacity-[0.10] blur-3xl dark:opacity-[0.18]" />
				<div className="absolute top-1/2 left-1/2 h-[24rem] w-[24rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/[0.04] blur-3xl dark:bg-primary/[0.08]" />
			</div>
			{children}
		</div>
	);
}
