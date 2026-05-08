"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

/**
 * Root error boundary. Triggers when an error escapes the route-group
 * boundaries (e.g. error in the root layout / auth callback). Auto-
 * scoped to the public surface; styled minimally so the shell doesn't
 * matter.
 */
export default function GlobalError({
	error,
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	useEffect(() => {
		console.error("[global.error]", error);
	}, [error]);

	return (
		<div className="flex min-h-dvh items-center justify-center bg-background px-4 py-12">
			<EmptyState
				className="max-w-md"
				icon={AlertTriangle}
				title="Tetra Ops ngga bisa load"
				description={
					error.digest ? (
						<>
							Sistem mengalami error. Coba refresh.
							{" · "}
							<span className="font-mono tabular text-foreground">
								{error.digest}
							</span>
						</>
					) : (
						"Sistem mengalami error. Coba refresh halaman."
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
							Refresh
						</button>
						<Link href="/" className={buttonVariants({ variant: "outline" })}>
							Halaman utama
						</Link>
					</div>
				}
			/>
		</div>
	);
}
