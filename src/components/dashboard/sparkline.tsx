import { cn } from "@/lib/utils";

/**
 * <Sparkline /> — tiny, dependency-free trend line (SVG). Normalizes `data` to a
 * fixed viewBox and renders a stroked polyline + a soft area fill below it.
 * `preserveAspectRatio="none"` lets it stretch full-width; `non-scaling-stroke`
 * keeps the line crisp. Safe with empty / single-point data (flat baseline).
 */
export function Sparkline({
	data,
	className,
	stroke = "currentColor",
	fill = "currentColor",
	strokeWidth = 2,
}: {
	data: number[];
	className?: string;
	stroke?: string;
	fill?: string;
	strokeWidth?: number;
}) {
	const W = 100;
	const H = 32;
	const pts = data.length >= 2 ? data : [0, ...data, 0];
	const max = Math.max(...pts, 1);
	const min = Math.min(...pts, 0);
	const span = max - min || 1;
	const n = pts.length;
	const coords = pts.map((v, i) => {
		const x = (i / (n - 1)) * W;
		const y = H - ((v - min) / span) * H;
		return `${x.toFixed(2)},${y.toFixed(2)}`;
	});
	const line = coords.join(" ");
	const area = `0,${H} ${line} ${W},${H}`;

	return (
		<svg
			viewBox={`0 0 ${W} ${H}`}
			preserveAspectRatio="none"
			className={cn("h-8 w-full", className)}
			aria-hidden="true"
			role="presentation"
		>
			<polygon points={area} fill={fill} opacity={0.16} />
			<polyline
				points={line}
				fill="none"
				stroke={stroke}
				strokeWidth={strokeWidth}
				strokeLinecap="round"
				strokeLinejoin="round"
				vectorEffect="non-scaling-stroke"
			/>
		</svg>
	);
}
