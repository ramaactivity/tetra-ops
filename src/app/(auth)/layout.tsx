export default function AuthLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<div className="bg-background relative flex min-h-screen flex-1 items-center justify-center overflow-hidden px-4 pt-safe-or-4 pb-safe-or-4">
			{/* Subtle gradient orbs — match landing page aesthetic */}
			<div
				aria-hidden="true"
				className="pointer-events-none absolute inset-0 -z-10"
			>
				<div className="absolute -top-40 -right-32 h-[36rem] w-[36rem] rounded-full bg-gradient-to-br from-rose-100 to-amber-100 opacity-40 blur-3xl dark:from-rose-950 dark:to-amber-950 dark:opacity-25" />
				<div className="absolute -bottom-32 -left-32 h-[28rem] w-[28rem] rounded-full bg-gradient-to-tr from-sky-100 to-indigo-100 opacity-30 blur-3xl dark:from-sky-950 dark:to-indigo-950 dark:opacity-20" />
			</div>
			{children}
		</div>
	);
}
