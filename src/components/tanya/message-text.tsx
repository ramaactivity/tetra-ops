"use client";

import { Fragment } from "react";

/**
 * Renderer markdown-mini untuk jawaban AI. Sengaja BUKAN react-markdown:
 * model kita hanya diizinkan memakai **tebal** dan daftar berpoin (lihat
 * prompt.ts), jadi menambah dependensi + sanitizer HTML tidak sepadan.
 *
 * PENTING — mode privasi: setiap nominal rupiah dibungkus `.tabular` +
 * `data-nominal` supaya ikut ter-blur saat toggle mata diaktifkan. Tanpa ini
 * jawaban AI jadi kebocoran angka di layar yang harusnya tersamar.
 */

const RUPIAH = /(Rp\s?-?[\d.,]+(?:\s?(?:jt|rb|M|juta|ribu))?)/g;
/** Versi non-global: `.test()` pada regex /g menyimpan lastIndex antar panggilan
 *  sehingga sebagian nominal lolos tak terbungkus. Jangan gabungkan keduanya. */
const RUPIAH_TEST = /^Rp\s?-?[\d.,]/;
const BOLD = /\*\*([^*]+)\*\*/g;

/** Pecah satu baris jadi potongan: **tebal** dan nominal Rp diberi markup. */
function renderInline(text: string, keyPrefix: string) {
	// Bold dulu, lalu tiap potongan non-bold dicek nominalnya.
	const out: React.ReactNode[] = [];
	let last = 0;
	let i = 0;
	for (const m of text.matchAll(BOLD)) {
		if (m.index === undefined) continue;
		if (m.index > last) {
			out.push(...renderMoney(text.slice(last, m.index), `${keyPrefix}-t${i}`));
		}
		out.push(
			<strong key={`${keyPrefix}-b${i}`} className="font-semibold">
				{renderMoney(m[1], `${keyPrefix}-bm${i}`)}
			</strong>,
		);
		last = m.index + m[0].length;
		i++;
	}
	if (last < text.length) {
		out.push(...renderMoney(text.slice(last), `${keyPrefix}-t${i}`));
	}
	return out;
}

function renderMoney(text: string, keyPrefix: string): React.ReactNode[] {
	const parts = text.split(RUPIAH);
	return parts.map((p, idx) =>
		RUPIAH_TEST.test(p) ? (
			// biome-ignore lint/suspicious/noArrayIndexKey: potongan teks statis
			<span key={`${keyPrefix}-${idx}`} className="tabular" data-nominal>
				{p}
			</span>
		) : (
			// biome-ignore lint/suspicious/noArrayIndexKey: potongan teks statis
			<Fragment key={`${keyPrefix}-${idx}`}>{p}</Fragment>
		),
	);
}

export function MessageText({ text }: { text: string }) {
	const lines = text.split("\n");
	const blocks: React.ReactNode[] = [];
	let bullets: string[] = [];

	const flushBullets = () => {
		if (bullets.length === 0) return;
		const items = bullets;
		bullets = [];
		blocks.push(
			<ul
				key={`ul-${blocks.length}`}
				className="my-1.5 flex list-disc flex-col gap-1 pl-5 marker:text-muted-foreground"
			>
				{items.map((b, i) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: urutan baris stabil
					<li key={i}>{renderInline(b, `li-${blocks.length}-${i}`)}</li>
				))}
			</ul>,
		);
	};

	lines.forEach((raw, i) => {
		const line = raw.trimEnd();
		const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
		if (bullet) {
			bullets.push(bullet[1]);
			return;
		}
		flushBullets();
		if (line.trim() === "") return;
		blocks.push(
			// biome-ignore lint/suspicious/noArrayIndexKey: urutan baris stabil
			<p key={`p-${i}`} className="whitespace-pre-wrap">
				{renderInline(line, `p-${i}`)}
			</p>,
		);
	});
	flushBullets();

	return <div className="flex flex-col gap-1.5">{blocks}</div>;
}
