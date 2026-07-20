import { Sparkles } from "lucide-react";
import { redirect } from "next/navigation";
import { Container } from "@/components/layout/container";
import { TanyaChat } from "@/components/tanya/tanya-chat";
import { EmptyState } from "@/components/ui/empty-state";
import { isAiConfigured } from "@/lib/ai/config";
import { getCurrentUser } from "@/lib/auth/get-user";

export const metadata = { title: "Tanya Tetra" };

// Container size="full": halaman chat berbagi lebar PERSIS dengan kartu topbar.
// size="md" (max-w-5xl) membuatnya tampak menjorok ke dalam dibanding topbar.
export default async function TanyaPage() {
	const me = await getCurrentUser();
	if (!me) redirect("/login");

	const isOwner =
		me.profile.role === "owner" || me.profile.role === "super_admin";

	if (!isAiConfigured()) {
		return (
			<Container size="full">
				<EmptyState
					icon={Sparkles}
					title="Tanya Tetra belum aktif"
					description="Fitur ini butuh kunci API Gemini. Tambahkan GEMINI_API_KEY di environment variable, lalu deploy ulang."
				/>
			</Container>
		);
	}

	return (
		<Container size="full">
			<TanyaChat isOwner={isOwner} />
		</Container>
	);
}
