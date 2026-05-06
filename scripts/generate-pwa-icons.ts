import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const SRC = path.resolve("public/brand/logomark-on-dark.png");
const OUT = path.resolve("public/pwa-icons");

const CRIMSON = { r: 0xdc, g: 0x29, b: 0x54, alpha: 1 };

async function makeIcon(size: number, paddingFrac: number, outName: string) {
	const padding = Math.round(size * paddingFrac);
	const inner = size - padding * 2;

	const wordmark = await sharp(SRC)
		.trim()
		.resize(inner, inner, {
			fit: "contain",
			background: { r: 0, g: 0, b: 0, alpha: 0 },
		})
		.png()
		.toBuffer();

	await sharp({
		create: {
			width: size,
			height: size,
			channels: 4,
			background: CRIMSON,
		},
	})
		.composite([{ input: wordmark, gravity: "center" }])
		.flatten({ background: CRIMSON })
		.png()
		.toFile(path.join(OUT, outName));

	console.log(`✓ ${outName}`);
}

async function generate() {
	if (!fs.existsSync(SRC)) {
		console.error(
			`✗ Source not found: ${SRC}\n  Run \`pnpm brand:place\` first.`,
		);
		process.exit(1);
	}
	if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

	await makeIcon(192, 0.12, "icon-192.png");
	await makeIcon(512, 0.12, "icon-512.png");
	// Maskable icons reserve a safe-zone of ~20% on every side for the system mask.
	await makeIcon(512, 0.2, "icon-maskable-512.png");
}

generate().catch((err) => {
	console.error(err);
	process.exit(1);
});
