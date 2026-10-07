/**
 * State machine wizard booking v4 — logika murni (tanpa React), dipakai
 * wizard.tsx dan test. Urutan layar, aturan lewati, label tombol bawah, dan
 * validasi isian mengikuti prototipe docs/design/booking-v4.
 */
import type { Backdrop, Fmt } from "./content";

export type Screen =
	| "intro"
	| "type"
	| "date"
	| "city"
	| "pkg"
	| "dur"
	| "fmt"
	| "backdrop"
	| "add"
	| "title"
	| "design"
	| "contact"
	| "otp"
	| "dash"
	| "review"
	| "done";

export const SEQ: Screen[] = [
	"type",
	"date",
	"city",
	"pkg",
	"dur",
	"fmt",
	"backdrop",
	"add",
	"title",
	"design",
	"contact",
	"otp",
	"dash",
	"review",
];

export const PHASE: Partial<Record<Screen, number>> = {
	type: 0,
	date: 0,
	city: 0,
	pkg: 1,
	dur: 1,
	fmt: 1,
	backdrop: 1,
	add: 2,
	title: 3,
	design: 3,
	contact: 3,
	otp: 3,
	dash: 3,
	review: 3,
};

export type YMD = { y: number; m: number; d: number };

export type Draft = {
	screen: Screen;
	event: string | null;
	date: (YMD & { full: boolean }) | null;
	cal: { y: number; m: number };
	calShut: boolean;
	/** "HH:MM" | "unsure" */
	time: string | null;
	city: string;
	venue: string;
	mapsUrl: string;
	pkg: string | null;
	dur: number | null;
	units: number;
	fmt: Fmt | "later" | null;
	backdrop: Backdrop | null;
	bdColor: string | null;
	adds: Record<string, number>;
	title: string;
	theme: string;
	name: string;
	/** Digit nasional tanpa 0/62, diformat "812 3456 7890". */
	wa: string;
	/** Digit nomor yang sudah terverifikasi (sesi portal). */
	waVerified: string;
	email: string;
	wo: "yes" | "no" | null;
	woName: string;
	woWa: string;
	consent: boolean;
	portfolio: boolean;
};

export const SAVE_KEYS: Array<keyof Draft> = [
	"screen",
	"event",
	"date",
	"cal",
	"time",
	"city",
	"venue",
	"mapsUrl",
	"pkg",
	"dur",
	"units",
	"fmt",
	"backdrop",
	"bdColor",
	"adds",
	"title",
	"theme",
	"name",
	"wa",
	"waVerified",
	"email",
	"wo",
	"woName",
	"woWa",
	"consent",
	"portfolio",
];

export function blankDraft(today: YMD): Draft {
	return {
		screen: "intro",
		event: null,
		date: null,
		cal: { y: today.y, m: today.m },
		calShut: false,
		time: null,
		city: "",
		venue: "",
		mapsUrl: "",
		pkg: null,
		dur: null,
		units: 1,
		fmt: null,
		backdrop: null,
		bdColor: null,
		adds: {},
		title: "",
		theme: "klasik",
		name: "",
		wa: "",
		waVerified: "",
		email: "",
		wo: null,
		woName: "",
		woWa: "",
		consent: false,
		portfolio: false,
	};
}

// ── Nomor WA ────────────────────────────────────────────────────────────────

/** "0812-3456 7890" / "+62 812…" / "62812…" → "81234567890". */
export function dig(v: string): string {
	let d = (v || "").replace(/\D/g, "");
	if (d.startsWith("62")) d = d.slice(2);
	if (d.startsWith("0")) d = d.slice(1);
	return d;
}
export const waOk = (v: string) => /^8\d{8,11}$/.test(dig(v));
export const waFmt = (d: string) =>
	d.replace(/^(\d{3})(\d{0,4})(\d{0,5}).*/, (_m, a, b, c) =>
		[a, b, c].filter(Boolean).join(" "),
	);
/** Untuk server: "0" + digit (format isLikelyWaPhone). */
export const waLocal = (v: string) => `0${dig(v)}`;

export const isMaps = (s: string) =>
	/(maps\.app\.goo\.gl|goo\.gl\/maps|google\.[a-z.]+\/maps)/i.test(s || "");
export const mapsQ = (q: string) =>
	`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;

// ── Urutan & navigasi ───────────────────────────────────────────────────────

export function verified(s: Draft): boolean {
	return !!s.waVerified && s.waVerified === dig(s.wa);
}

/** Urutan layar aktif: format hanya untuk paket bercetak, backdrop saja untuk yang tidak, OTP kalau belum terverifikasi. */
export function seq(s: Draft, hasFmt: boolean | null): Screen[] {
	return SEQ.filter(
		(x) =>
			(x !== "fmt" || hasFmt === null || hasFmt) &&
			(x !== "backdrop" || hasFmt === null || !hasFmt) &&
			(x !== "otp" || !verified(s) || s.screen === "otp"),
	);
}

export function nextScreen(
	s: Draft,
	hasFmt: boolean | null,
	editing: boolean,
): { screen: Screen; editing: boolean } {
	if (editing) {
		if (s.screen === "pkg") return { screen: "dur", editing };
		if (s.screen === "dur" && hasFmt && !s.fmt)
			return { screen: "fmt", editing };
		if (s.screen === "dur" && hasFmt === false && !s.backdrop)
			return { screen: "backdrop", editing };
		if (s.screen === "contact" && !verified(s))
			return { screen: "otp", editing };
		return { screen: "review", editing: false };
	}
	const q = seq(s, hasFmt);
	return { screen: q[q.indexOf(s.screen) + 1] ?? "review", editing: false };
}

export function prevScreen(
	s: Draft,
	hasFmt: boolean | null,
	editing: boolean,
): Screen {
	if (editing) return "review";
	const q = seq(s, hasFmt).filter((x) => x !== "otp" || s.screen === "otp");
	const i = q.indexOf(s.screen);
	return i <= 0 ? "intro" : q[i - 1];
}

// ── Validasi ────────────────────────────────────────────────────────────────

export function valid(s: Draft) {
	return {
		title: s.title.trim().length >= 2,
		name: s.name.trim().length >= 2,
		wa: waOk(s.wa),
		email: !s.email.trim() || /^\S+@\S+\.\S+$/.test(s.email.trim()),
		woName: s.woName.trim().length >= 2,
		woWa: waOk(s.woWa),
	};
}

export type Bar =
	| { show: false }
	| { show: true; on: boolean; label: string; skip?: boolean };

/**
 * Tombol bawah per layar. Nonaktif selalu menyebut alasannya. `busy` = jam
 * bentrok hasil cek slot; `addSum`/`durPrice` sudah dalam rupiah.
 */
export function bar(
	s: Draft,
	ctx: {
		editing: boolean;
		offline: boolean;
		busy: boolean;
		durPrice: number | null;
		addSum: number;
		sending: boolean;
		otpOk: boolean;
	},
): Bar {
	const hide: Bar = { show: false };
	const on = (l: string): Bar => ({
		show: true,
		on: true,
		label: ctx.editing ? "Simpan" : l,
	});
	const off = (l: string): Bar => ({ show: true, on: false, label: l });
	if (ctx.offline) return off("Menunggu koneksi…");
	const v = valid(s);
	switch (s.screen) {
		case "type":
			return s.event ? on("Lanjut") : hide;
		case "date":
			return !s.date
				? off("Pilih tanggal dulu")
				: s.date.full
					? off("Tanggal penuh, pilih yang lain")
					: !s.time
						? off("Pilih jam mulai")
						: ctx.busy
							? off("Jam ini penuh, pilih yang lain")
							: on("Lanjut");
		case "city":
			return s.city.trim().length >= 3 ? on("Lanjut") : off("Isi kota dulu");
		case "pkg":
			return s.pkg ? on("Lanjut pilih durasi") : hide;
		case "dur":
			return s.dur && ctx.durPrice !== null
				? on(`Lanjut · ${rp(ctx.durPrice * s.units)}`)
				: off("Pilih durasi dulu");
		case "fmt":
			return !s.fmt
				? off("Pilih format cetak")
				: !s.backdrop
					? off("Pilih backdrop")
					: s.backdrop === "tetra" && !s.bdColor
						? off("Pilih warna backdrop")
						: on("Lanjut");
		case "backdrop":
			return !s.backdrop
				? hide
				: s.backdrop === "tetra" && !s.bdColor
					? off("Pilih warna backdrop")
					: on("Lanjut");
		case "add":
			return on(ctx.addSum ? `Lanjut · +${rp(ctx.addSum)}` : "Lewati");
		case "title":
			return v.title ? on("Lanjut") : off("Isi nama di cetakan dulu");
		case "design":
			return on("Oke, lanjut");
		case "contact":
			return !v.name
				? off("Isi nama kamu dulu")
				: !v.wa
					? off("Isi nomor WhatsApp dulu")
					: !v.email
						? off("Cek lagi format email")
						: s.wo === "yes" && !(v.woName && v.woWa)
							? off("Lengkapi data WO dulu")
							: verified(s)
								? on("Lanjut")
								: on("Kirim kode verifikasi");
		case "otp":
			return ctx.otpOk ? on("Lanjut") : on("Buka WhatsApp");
		case "dash":
			return on("Lanjut ke ringkasan");
		case "review":
			return ctx.sending
				? off("Mengirim…")
				: !s.consent
					? off("Centang persetujuan dulu")
					: { show: true, on: true, label: "Kirim booking" };
	}
	return hide;
}

export const rp = (n: number) => `Rp${Math.round(n).toLocaleString("id-ID")}`;

export const iso = (d: YMD) =>
	`${d.y}-${String(d.m + 1).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
