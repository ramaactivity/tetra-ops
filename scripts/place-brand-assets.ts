import fs from "node:fs";
import path from "node:path";

const SRC = path.resolve("brand-assets");
const DEST_BRAND = path.resolve("public/brand");
const DEST_PUBLIC = path.resolve("public");

const mapping: Array<{ from: string; to: string; destRoot?: boolean }> = [
	{ from: "02. LOGO TETRA BLACK.png", to: "logo-full-color.png" },
	{ from: "02. LOGO TETRA BLACK.png", to: "logo-monochrome-dark.png" },
	{ from: "05. LOGO TETRA WHITE.png", to: "logo-monochrome-light.png" },
	{ from: "01. LOGO TETRA BLACK.png", to: "logomark-only.png" },
	{ from: "06. LOGO TETRA WHITE.png", to: "logomark-on-dark.png" },
	{ from: "favicon.ico", to: "favicon.ico", destRoot: true },
	{ from: "apple-touch-icon.png", to: "apple-touch-icon.png", destRoot: true },
];

if (!fs.existsSync(DEST_BRAND)) fs.mkdirSync(DEST_BRAND, { recursive: true });

let placed = 0;
let missing = 0;

for (const { from, to, destRoot } of mapping) {
	const srcPath = path.join(SRC, from);
	const destPath = path.join(destRoot ? DEST_PUBLIC : DEST_BRAND, to);
	if (fs.existsSync(srcPath)) {
		fs.copyFileSync(srcPath, destPath);
		console.log(`✓ ${from} → ${path.relative(process.cwd(), destPath)}`);
		placed++;
	} else {
		console.log(`⚠ ${from} not in brand-assets/ — skipping ${to}`);
		missing++;
	}
}

console.log(`\nDone. ${placed} placed, ${missing} missing.`);
if (missing > 0) {
	console.log(
		"Missing files are placeholders; add them to brand-assets/ to populate.",
	);
}
