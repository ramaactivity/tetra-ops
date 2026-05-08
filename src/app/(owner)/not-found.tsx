import { Compass } from "lucide-react";
import Link from "next/link";
import { Container } from "@/components/layout/container";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default function OwnerNotFound() {
	return (
		<Container size="md" className="py-12">
			<EmptyState
				icon={Compass}
				title="Halaman ngga ketemu"
				description="URL yang lo akses ngga ada di Tetra Ops. Mungkin udah pindah, atau salah ketik."
				action={
					<Link
						href="/dashboard"
						className={buttonVariants({ variant: "default" })}
					>
						Balik ke Dashboard
					</Link>
				}
			/>
		</Container>
	);
}
