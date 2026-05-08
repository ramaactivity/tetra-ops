import { Compass } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default function CrewNotFound() {
	return (
		<div className="mx-auto w-full max-w-md px-4 py-10">
			<EmptyState
				icon={Compass}
				title="Halaman ngga ketemu"
				description="Link yang lo buka ngga ada. Cek lagi atau balik ke home."
				action={
					<Link
						href="/crew"
						className={buttonVariants({ variant: "default" })}
					>
						Balik ke Home
					</Link>
				}
			/>
		</div>
	);
}
