"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default function CrewError({
	error,
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	useEffect(() => {
		console.error("[crew.error]", error);
	}, [error]);

	return (
		<div className="mx-auto w-full max-w-md px-4 py-10">
			<EmptyState
				icon={AlertTriangle}
				title="Ada yang ngga beres"
				description={
					error.digest ? (
						<>
							Coba refresh dulu. Kalau masih error, kasih tau owner dan
							sertakan code{" "}
							<span className="font-mono tabular text-foreground">
								{error.digest}
							</span>
							.
						</>
					) : (
						"Coba refresh dulu. Kalau masih error, kasih tau owner."
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
							href="/crew"
							className={buttonVariants({ variant: "outline" })}
						>
							Balik ke Home
						</Link>
					</div>
				}
			/>
		</div>
	);
}
