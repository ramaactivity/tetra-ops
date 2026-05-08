import { Compass } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default function GlobalNotFound() {
	return (
		<div className="flex min-h-dvh items-center justify-center bg-background px-4 py-12">
			<EmptyState
				className="max-w-md"
				icon={Compass}
				title="Halaman ngga ketemu"
				description="URL yang lo akses ngga ada di Tetra Ops."
				action={
					<Link href="/" className={buttonVariants({ variant: "default" })}>
						Halaman utama
					</Link>
				}
			/>
		</div>
	);
}
