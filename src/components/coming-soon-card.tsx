import { Construction } from "lucide-react";

export function ComingSoonCard({
	title,
	when,
}: {
	title: string;
	when: string;
}) {
	return (
		<div className="border-border-default bg-surface-2 flex flex-col items-center gap-3 rounded-xl border border-dashed p-12 text-center">
			<Construction className="text-muted-foreground h-8 w-8" />
			<div className="space-y-1">
				<h3 className="font-medium">{title}</h3>
				<p className="text-muted-foreground text-sm">Coming in {when}.</p>
			</div>
		</div>
	);
}
