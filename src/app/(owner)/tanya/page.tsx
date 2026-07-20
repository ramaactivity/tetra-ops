import { Sparkles } from "lucide-react";
import { redirect } from "next/navigation";
import { Container } from "@/components/layout/container";
import { TanyaChat } from "@/components/tanya/tanya-chat";
import { EmptyState } from "@/components/ui/empty-state";
import { isAiConfigured } from "@/lib/ai/config";
import { getCurrentUser } from "@/lib/auth/get-user";

export const metadata = { title: "Tanya Tetra" };

export default async function TanyaPage() {
	const me = await getCurrentUser();
	if (!me) redirect("/login");

	const isOwner =
		me.profile.role === "owner" || me.profile.role === "super_admin";

	if (!isAiConfigured()) {
		return (
			<Container size="md">
				<EmptyState
					icon={Sparkles}
					title="Tanya Tetra belum aktif"
					description="Fitur ini butuh kunci API Gemini. Tambahkan GEMINI_API_KEY di environment variable, lalu deploy ulang."
				/>
			</Container>
		);
	}

	return (
		<Container size="md">
			<TanyaChat isOwner={isOwner} />
		</Container>
	);
}
