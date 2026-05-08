"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { Container } from "@/components/layout/container";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

/**
 * Owner route group error boundary. Catches any error thrown during
 * SSR / client rendering inside (owner)/* routes and shows a branded
 * recovery screen instead of Next.js default error page.
 */
export default function OwnerError({
	error,
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	useEffect(() => {
		console.error("[owner.error]", error);
	}, [error]);

	return (
		<Container size="md" className="py-12">
			<EmptyState
				icon={AlertTriangle}
				title="Ada yang ngga beres"
				description={
					error.digest ? (
						<>
							Coba refresh, atau balik ke dashboard. Kalau masih error, kasih
							tau Rama dan sertakan code{" "}
							<span className="font-mono tabular text-foreground">
								{error.digest}
							</span>
							.
						</>
					) : (
						"Coba refresh, atau balik ke dashboard. Kalau masih error, kasih tau Rama."
					)
				}
				action={
					<div className="flex flex-wrap gap-2">
						<button
							type="button"
							onClick={() => reset()}
							className={buttonVariants({ variant: "default" })}
						>
							<RefreshCw className="size-4" />
							Coba lagi
						</button>
						<Link
							href="/dashboard"
							className={buttonVariants({ variant: "outline" })}
						>
							Balik ke Dashboard
						</Link>
					</div>
				}
			/>
		</Container>
	);
}
