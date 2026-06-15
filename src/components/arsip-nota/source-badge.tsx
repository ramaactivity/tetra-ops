import { Badge } from "@/components/ui/badge";
import { type NotaSistemSource, SOURCE_META } from "@/lib/arsip-nota/types";

const TONE_VARIANT: Record<
	"blue" | "green" | "slate",
	"info" | "success" | "neutral"
> = {
	blue: "info",
	green: "success",
	slate: "neutral",
};

export function SourceBadge({ source }: { source: NotaSistemSource }) {
	const meta = SOURCE_META[source] ?? { label: source, tone: "slate" as const };
	return <Badge variant={TONE_VARIANT[meta.tone]}>{meta.label}</Badge>;
}
