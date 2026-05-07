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
				<div className="absolute -top-40 -right-32 h-[36rem] w-[36rem] rounded-full bg-gradient-sunrise-radial opacity-[0.12] blur-3xl dark:opacity-[0.18]" />
				<div className="absolute -bottom-32 -left-32 h-[28rem] w-[28rem] rounded-full bg-gradient-aurora-radial opacity-[0.08] blur-3xl dark:opacity-[0.14]" />
			</div>
			{children}
		</div>
	);
}
