/**
 * seed-signature.mjs — pasang gambar tanda tangan ke preset penanda tangan.
 *   node scripts/seed-signature.mjs "<nama (LIKE)>" <path/gambar.png>
 * Gambar dikecilkan ke maks 600×300 px lalu disimpan sebagai data URL PNG.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import sharp from "sharp";

const [, , namePattern, file] = process.argv;
if (!namePattern || !file) {
	console.error("usage: node scripts/seed-signature.mjs <nama> <gambar.png>");
	process.exit(1);
}
const env = Object.fromEntries(
	readFileSync(".env.local", "utf8")
		.split("\n")
		.filter((l) => l.includes("=") && !l.trim().startsWith("#"))
		.map((l) => {
			const i = l.indexOf("=");
			return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
		}),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
	auth: { persistSession: false },
});
const png = await sharp(file).resize({ width: 600, height: 300, fit: "inside", withoutEnlargement: true }).png().toBuffer();
const dataUrl = `data:image/png;base64,${png.toString("base64")}`;
const { data, error } = await sb
	.from("document_signers")
	.update({ signature_data: dataUrl })
	.ilike("name", `%${namePattern}%`)
	.select("id, name");
if (error) throw error;
console.log(`ok (${png.length} bytes) →`, data);
