/**
 * Nama template dari nama file PNG: "floral-gold_4R (2).png" → "Floral Gold".
 * Kata ukuran (4R/2R/polaroid/1200x1800) dibuang karena ukurannya sudah
 * terbaca otomatis dari gambarnya.
 */
export function nameFromFile(filename: string): string {
	const cleaned = filename
		.replace(/\.[a-z0-9]+$/i, "")
		.replace(/\(\d+\)/g, " ")
		.replace(/[_\-.]+/g, " ")
		.replace(
			/\b(\d{3,5}\s*[x×]\s*\d{3,5}|4r|2r|polaroid|strip|final|copy|salinan)\b/gi,
			" ",
		)
		.replace(/\s+/g, " ")
		.trim();
	// Huruf kecil semua → kapital tiap kata; campuran → biarkan apa adanya.
	const titled =
		cleaned === cleaned.toLowerCase()
			? cleaned.replace(/(^|\s)(\p{L})/gu, (_, s, c) => s + c.toUpperCase())
			: cleaned;
	return titled.length >= 2 ? titled.slice(0, 80) : "Template";
}
