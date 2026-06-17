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
		<div className="relative flex min-h-screen flex-1 items-center justify-center overflow-hidden bg-transparent px-4 pt-safe-or-4 pb-safe-or-4">
			{children}
		</div>
	);
}
