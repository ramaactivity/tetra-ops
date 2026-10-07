"use client";

/**
 * Wizard booking publik v4 (docs/design/booking-v4, "Booking Tetra v4.dc.html").
 * HP: header warna fase + langkah + bar bawah. Desktop ≥1024px: panel kiri
 * kontekstual 600px + langkah di kanan. Satu state draf (logic.ts), autosave ke
 * localStorage; harga & slot dicek ulang server saat kirim (createDraftBooking).
 */
import { Calendar, CirclePlus, LockKeyhole, LockOpen } from "lucide-react";
import { useRouter } from "next/navigation";
import {
	type CSSProperties,
	type KeyboardEvent,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import {
	checkVerification,
	startEmailVerification,
	startWaVerification,
	submitEmailCode,
} from "@/lib/actions/portal-auth";
import {
	checkSlot,
	createDraftBooking,
	fullDatesOf,
} from "@/lib/actions/portal-booking";
import type { CatalogProduct, PublicAddonRow } from "@/lib/portal/core";
import "./booking.css";
import {
	ADDON,
	ADDON_ORDER,
	type AddonContent,
	BACKDROPS,
	BD_COLORS,
	DAY3,
	DAYS,
	EVENTS,
	type EventKind,
	FMT_DB,
	FMTD,
	FMTS,
	type Fmt,
	MON3,
	MONTHS,
	PCOL,
	PHASES,
	PKG,
	type PkgContent,
	THEMES,
} from "./content";
import {
	bar,
	blankDraft,
	type Draft,
	dig,
	isMaps,
	iso,
	mapsQ,
	nextScreen,
	PHASE,
	prevScreen,
	rp,
	SAVE_KEYS,
	type Screen,
	SEQ,
	valid,
	verified,
	waFmt,
	waLocal,
	type YMD,
} from "./logic";
import { DASH_TILES, Ruler, Steps } from "./steps";
import {
	B,
	Cta,
	Dot,
	IconChip,
	INK,
	layered,
	mono,
	PrintPreview,
	type PvProps,
	SEL,
} from "./ui";

const LS = "tetra-booking-v4";
const PKG_ORDER = [
	"photobooth_classic",
	"photostage_combo",
	"videobooth_360",
	"magazine_combo",
	"magazine_box_only",
	"photostage_only",
];

type Pkg = CatalogProduct & { c: PkgContent; from: string };
type Add = PublicAddonRow & { c: AddonContent; priceLine: string; min: number };
type Otp = {
	id: string | null;
	code: string | null;
	waUrl: string | null;
	mode: "wa" | "email";
	state: "" | "wrong" | "expired" | "ok";
	typed: string;
	wait: number;
	error: string;
};
const OTP0: Otp = {
	id: null,
	code: null,
	waUrl: null,
	mode: "wa",
	state: "",
	typed: "",
	wait: 0,
	error: "",
};

export type Ctx = ReturnType<typeof useBooking>;

type Props = {
	products: CatalogProduct[];
	addons: PublicAddonRow[];
	dpMin: number;
	today: YMD;
	/** Digit nomor sesi portal yang sudah terverifikasi (tanpa 0/62). */
	verifiedPhone: string | null;
	signedName: string | null;
	adminWa: string | null;
};

function useBooking(p: Props) {
	const router = useRouter();
	const [s, setS] = useState<Draft>(() => ({
		...blankDraft(p.today),
		...(p.verifiedPhone
			? {
					wa: waFmt(p.verifiedPhone),
					waVerified: p.verifiedPhone,
					name: p.signedName ?? "",
				}
			: {}),
	}));
	const [dir, setDir] = useState(1);
	const [editing, setEditing] = useState(false);
	const [resume, setResume] = useState<Draft | null>(null);
	const [offline, setOffline] = useState(false);
	const [manual, setManual] = useState(false);
	const [mT, setMTState] = useState<[number, number]>([16, 30]);
	const [mapsIn, setMapsIn] = useState("");
	const [addOpen, setAddOpen] = useState<string | null>(null);
	const [addFocus, setAddFocus] = useState<string | null>(null);
	const [pvAlt, setPvAlt] = useState<Fmt | null>(null);
	const [touched, setTouched] = useState<Record<string, 1>>({});
	const [full, setFull] = useState<Record<string, Set<string>>>({});
	const [busyMap, setBusyMap] = useState<Record<string, boolean>>({});
	const [otp, setOtp] = useState<Otp>(OTP0);
	const [verifyErr, setVerifyErr] = useState("");
	const [sending, setSending] = useState(false);
	const [submitErr, setSubmitErr] = useState("");
	const [code, setCode] = useState<string | null>(null);
	const [mounted, setMounted] = useState(false);
	const advRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const depth = useRef(0);
	/** State terbaru untuk handler async/timer (hindari efek samping di updater). */
	const sRef = useRef(s);
	sRef.current = s;

	const set = useCallback(
		(patch: Partial<Draft>) => setS((x) => ({ ...x, ...patch })),
		[],
	);

	// ── Derivasi ───────────────────────────────────────────────────────────
	const ev: EventKind | undefined = EVENTS.find((e) => e.id === s.event);
	const rec = (ev ?? EVENTS[5]).rec;
	const pkgs: Pkg[] = useMemo(() => {
		const order = [rec[0], ...PKG_ORDER.filter((c) => c !== rec[0])];
		return order
			.map((cat) => p.products.find((x) => x.category === cat))
			.filter((x): x is CatalogProduct => !!x && !!PKG[x.category])
			.map((x) => {
				const hrs = x.options.map((o) => o.hours);
				const min = Math.min(...x.options.map((o) => o.price));
				return {
					...x,
					c: PKG[x.category],
					from: `mulai ${rp(min)} · ${hrs.length > 1 ? `${hrs[0]}–${hrs[hrs.length - 1]}` : hrs[0]} jam`,
				};
			});
	}, [p.products, rec]);
	const pk = pkgs.find((x) => x.category === s.pkg) ?? null;
	const hasFmt = pk ? pk.frames.length > 0 : null;
	const adds: Add[] = useMemo(
		() =>
			[...p.addons]
				.sort(
					(a, b) =>
						(ADDON_ORDER.indexOf(a.name) + 1 || 99) -
						(ADDON_ORDER.indexOf(b.name) + 1 || 99),
				)
				.map((a) => {
					const c: AddonContent = ADDON[a.name] ?? {
						name: a.name,
						unit: a.unit ?? "unit",
						icon: CirclePlus,
						tint: "#FFFFFF",
						benefit: "",
						desc: a.name,
					};
					return {
						...a,
						c,
						priceLine: `${rp(a.price)} / ${c.unit}`,
						min: Math.max(1, a.min_qty ?? 1),
					};
				}),
		[p.addons],
	);
	const durPrice = pk?.options.find((o) => o.hours === s.dur)?.price ?? null;
	const addSum = adds.reduce((t, a) => t + (s.adds[a.id] ?? 0) * a.price, 0);
	const total = durPrice !== null ? durPrice * s.units + addSum : 0;
	const dp = Math.min(p.dpMin, total);
	const shown = useTween(total);

	const dObj = s.date ? new Date(s.date.y, s.date.m, s.date.d) : null;
	const dShort =
		s.date && !s.date.full && dObj
			? `${DAY3[dObj.getDay()]}, ${s.date.d} ${MON3[s.date.m]} ${s.date.y}`
			: "";
	const dateLong =
		s.date && dObj
			? `${DAYS[dObj.getDay()]}, ${s.date.d} ${MONTHS[s.date.m]}`
			: "";
	const pfmt: Fmt =
		pk && s.fmt && s.fmt !== "later" ? s.fmt : pk ? pk.c.fmt : "polaroid";
	const pv: PvProps = {
		fmt: pfmt,
		title: s.title || ev?.ph || "Nama acaramu",
		date:
			s.date && !s.date.full
				? `${s.date.d} ${MONTHS[s.date.m].toUpperCase()} ${s.date.y}`
				: "TANGGAL ACARAMU",
		kicker: ev?.kicker ?? "",
		theme: s.theme,
	};
	const pvKey = [s.event, s.date?.d, s.title, s.fmt, s.pkg].join("|");
	const slotKey =
		s.date && !s.date.full && s.time && s.time !== "unsure"
			? `${iso(s.date)}|${s.time}`
			: null;
	const busy = slotKey ? !!busyMap[slotKey] : false;
	const v = valid(s);
	const verifiedNow = verified(s);
	const first = s.name.trim().split(" ")[0] ?? "";
	const fmtTxt =
		s.fmt === "later"
			? "Menyusul"
			: s.fmt
				? FMTS.find((f) => f[0] === s.fmt)?.[1]
				: "";
	const bdName = BD_COLORS.find((c) => c[0] === s.bdColor)?.[1];

	// ── Efek: mount, autosave, online, history ─────────────────────────────
	useEffect(() => {
		setMounted(true);
		try {
			const saved = JSON.parse(
				localStorage.getItem(LS) ?? "null",
			) as Draft | null;
			if (saved && SEQ.includes(saved.screen)) setResume(saved);
		} catch {}
		const on = () => setOffline(!navigator.onLine);
		on();
		window.addEventListener("online", on);
		window.addEventListener("offline", on);
		return () => {
			window.removeEventListener("online", on);
			window.removeEventListener("offline", on);
		};
	}, []);

	useEffect(() => {
		if (!mounted || s.screen === "intro" || s.screen === "done") return;
		try {
			const o: Partial<Draft> = {};
			for (const k of SAVE_KEYS) (o as Record<string, unknown>)[k] = s[k];
			localStorage.setItem(LS, JSON.stringify(o));
		} catch {}
	}, [s, mounted]);

	const go = useCallback((screen: Screen, d = 1) => {
		setDir(d);
		setS((x) => ({
			...x,
			screen,
			...(screen === "date" && x.date && !x.date.full ? { calShut: true } : {}),
		}));
		if (d > 0) {
			history.pushState({ bk: screen }, "");
			depth.current++;
		}
		document.querySelectorAll(".bk-scroll").forEach((el) => {
			el.scrollTop = 0;
		});
	}, []);

	const doBack = useCallback(() => {
		const to = prevScreen(sRef.current, hasFmt, editing);
		setDir(-1);
		if (editing) setEditing(false);
		setS((x) => ({ ...x, screen: to }));
	}, [hasFmt, editing]);
	const backRef = useRef(doBack);
	backRef.current = doBack;
	useEffect(() => {
		const onPop = () => {
			depth.current = Math.max(0, depth.current - 1);
			backRef.current();
		};
		window.addEventListener("popstate", onPop);
		return () => window.removeEventListener("popstate", onPop);
	}, []);
	const back = () => {
		if (depth.current > 0) history.back();
		else doBack();
	};

	const next = useCallback(() => {
		const r = nextScreen(sRef.current, hasFmt, editing);
		if (!r.editing && editing) setEditing(false);
		go(r.screen);
	}, [hasFmt, editing, go]);
	const nextRef = useRef(next);
	nextRef.current = next;

	const pick = (patch: Partial<Draft>, adv = true) => {
		set(patch);
		if (advRef.current) clearTimeout(advRef.current);
		if (adv) advRef.current = setTimeout(() => nextRef.current(), 240);
	};

	// Fokus isian pertama di layar baru (kalau masih kosong).
	// biome-ignore lint/correctness/useExhaustiveDependencies: hanya saat layar berganti.
	useEffect(() => {
		const t = setTimeout(() => {
			const el = document.querySelector<HTMLInputElement>(".bk [data-auto]");
			if (el && !el.value && window.matchMedia("(min-width: 1024px)").matches)
				el.focus({ preventScroll: true });
		}, 30);
		return () => clearTimeout(t);
	}, [s.screen]);

	// ── Ketersediaan ───────────────────────────────────────────────────────
	const monthKey = `${s.cal.y}-${s.cal.m}`;
	useEffect(() => {
		if (s.screen !== "date" || full[monthKey]) return;
		const { y, m } = s.cal;
		const last = new Date(y, m + 1, 0).getDate();
		const tmr = new Date(p.today.y, p.today.m, p.today.d + 1);
		const start =
			y === tmr.getFullYear() && m === tmr.getMonth() ? tmr.getDate() : 1;
		if (y < p.today.y || (y === p.today.y && m < p.today.m)) return;
		fullDatesOf(iso({ y, m, d: start }), iso({ y, m, d: last }))
			.then((r) => {
				if (r.ok) setFull((f) => ({ ...f, [monthKey]: new Set(r.dates) }));
			})
			.catch(() => {});
	}, [s.screen, s.cal, monthKey, full, p.today]);

	useEffect(() => {
		if (!slotKey || slotKey in busyMap || !s.date || !s.time) return;
		checkSlot({
			category: s.pkg ?? "photobooth_classic",
			hours: s.dur ?? 2,
			frame: null,
			units: s.units,
			addons: [],
			date: iso(s.date),
			start: s.time,
			city: s.city.trim() || null,
		})
			.then((r) => {
				if (r.ok) setBusyMap((b) => ({ ...b, [slotKey]: !r.available }));
			})
			.catch(() => {});
	}, [slotKey, busyMap, s.date, s.time, s.pkg, s.dur, s.units, s.city]);

	const isFull = (y: number, m: number, d: number) =>
		!!full[`${y}-${m}`]?.has(iso({ y, m, d }));
	const isPast = (y: number, m: number, d: number) =>
		new Date(y, m, d) <= new Date(p.today.y, p.today.m, p.today.d);
	const pickDate = (d: YMD & { full: boolean }) => {
		set({ date: d, calShut: false });
		if (!d.full) setTimeout(() => set({ calShut: true }), 500);
	};

	// ── Verifikasi WA (klien kirim kode ke WA Tetra) ───────────────────────
	const startVerify = async (stay = false) => {
		setVerifyErr("");
		const r = await startWaVerification({
			phone: waLocal(s.wa),
			name: s.name.trim(),
		}).catch(() => null);
		if (!r || !r.ok) {
			const msg = r?.error ?? "Gagal menyiapkan verifikasi. Coba lagi, ya.";
			if (stay) setOtp((o) => ({ ...o, error: msg }));
			else setVerifyErr(msg);
			return;
		}
		setOtp({ ...OTP0, id: r.id, code: r.code, waUrl: r.waUrl, wait: 45 });
		if (!stay) go("otp");
	};
	const toEmail = async () => {
		const r = await startEmailVerification({
			phone: waLocal(s.wa),
			name: s.name.trim(),
			email: s.email.trim(),
		}).catch(() => null);
		if (!r || !r.ok)
			return setOtp((o) => ({
				...o,
				error: r?.error ?? "Gagal mengirim email. Coba lagi, ya.",
			}));
		setOtp({ ...OTP0, id: r.id, mode: "email", wait: 45 });
	};
	const verifiedOk = useCallback(() => {
		setOtp((o) => ({ ...o, state: "ok", error: "" }));
		setS((x) => ({ ...x, waVerified: dig(x.wa) }));
		setTimeout(() => {
			if (sRef.current.screen === "otp") nextRef.current();
		}, 600);
	}, []);

	useEffect(() => {
		if (s.screen !== "otp" || !otp.id || otp.state === "ok") return;
		const t = setInterval(() => {
			setOtp((o) => (o.wait > 0 ? { ...o, wait: o.wait - 1 } : o));
		}, 1000);
		return () => clearInterval(t);
	}, [s.screen, otp.id, otp.state]);

	useEffect(() => {
		if (s.screen !== "otp" || !otp.id || otp.mode !== "wa" || otp.state) return;
		const id = otp.id;
		const t = setInterval(async () => {
			const r = await checkVerification(id).catch(() => null);
			if (r?.status === "selesai") {
				clearInterval(t);
				verifiedOk();
			} else if (r?.status === "kedaluwarsa") {
				clearInterval(t);
				setOtp((o) => ({ ...o, state: "expired" }));
			}
		}, 3000);
		return () => clearInterval(t);
	}, [s.screen, otp.id, otp.mode, otp.state, verifiedOk]);

	const onEmailCode = async (raw: string) => {
		const c = raw.replace(/\D/g, "").slice(0, 6);
		setOtp((o) => ({ ...o, typed: c, state: c.length < 6 ? "" : o.state }));
		if (c.length < 6 || !otp.id) return;
		const r = await submitEmailCode(otp.id, c).catch(() => null);
		if (r?.ok) verifiedOk();
		else setOtp((o) => ({ ...o, state: "wrong" }));
	};

	// ── Kirim ──────────────────────────────────────────────────────────────
	const submit = async () => {
		if (!pk || !s.date || !s.dur) return;
		setSending(true);
		setSubmitErr("");
		const asWo = s.wo === "yes";
		const r = await createDraftBooking({
			selection: {
				category: pk.category,
				hours: s.dur,
				frame: hasFmt && s.fmt && s.fmt !== "later" ? FMT_DB[s.fmt] : null,
				units: s.units,
				addons: Object.entries(s.adds)
					.filter(([, q]) => q > 0)
					.map(([id, qty]) => ({ id, qty })),
				date: iso(s.date),
				start: s.time && s.time !== "unsure" ? s.time : null,
				city: s.city.trim() || null,
			},
			consent: true,
			asWo,
			client: asWo && v.woWa ? { phone: waLocal(s.woWa) } : undefined,
			detail: {
				nama_acara: s.title.trim(),
				kategori: ev?.code,
				venue_nama: s.venue.trim() || undefined,
				venue_kota: s.city.trim(),
				maps_url: s.mapsUrl || undefined,
				email: s.email.trim() || undefined,
				backdrop: s.backdrop ?? undefined,
				backdrop_warna: s.backdrop === "tetra" ? bdName : undefined,
				izin_portofolio: s.portfolio,
				...(asWo
					? { wo_nama: s.woName.trim() }
					: { pemilik_nama: s.name.trim() }),
			},
		}).catch(() => null);
		setSending(false);
		if (!r || !r.ok) {
			setSubmitErr(r?.error ?? "Gagal mengirim. Cek koneksi lalu coba lagi.");
			return;
		}
		setCode(r.code);
		try {
			localStorage.removeItem(LS);
		} catch {}
		go("done");
	};

	// ── Tombol bawah ───────────────────────────────────────────────────────
	let b = bar(s, {
		editing,
		offline,
		busy,
		durPrice,
		addSum,
		sending,
		otpOk: otp.state === "ok",
	});
	if (
		s.screen === "otp" &&
		otp.mode === "email" &&
		otp.state !== "ok" &&
		!offline
	)
		b = { show: true, on: false, label: "Masukkan kode dulu" };
	if (s.screen === "otp" && otp.mode === "wa" && otp.state === "expired")
		b = { show: true, on: false, label: "Kirim kode baru dulu" };

	const barGo = () => {
		if (s.screen === "review") return void submit();
		if (s.screen === "contact") {
			set({ wa: waFmt(dig(s.wa)) });
			if (!verifiedNow && !editing) return void startVerify();
			if (!verifiedNow && editing) return void startVerify();
		}
		if (s.screen === "otp" && otp.state !== "ok") {
			if (otp.waUrl) window.open(otp.waUrl, "_blank", "noopener");
			return;
		}
		next();
	};

	const touch = (k: string) => {
		setTouched((t) => ({ ...t, [k]: 1 }));
		if (k === "wa" && dig(s.wa)) set({ wa: waFmt(dig(s.wa)) });
	};

	const onEnter = (e: KeyboardEvent<HTMLInputElement>) => {
		if (e.key !== "Enter") return;
		e.preventDefault();
		const fd = e.currentTarget.dataset.field;
		const nx = fd
			? ({ name: "wa", wa: "email" } as Record<string, string>)[fd]
			: undefined;
		if (fd) touch(fd);
		if (nx) {
			const el = document.querySelector<HTMLInputElement>(
				`.bk [data-field="${nx}"]`,
			);
			if (el) {
				setTimeout(() => el.focus(), 30);
				return;
			}
		}
		if (b.show && b.on) barGo();
		else touch(s.screen);
	};

	const editTo = (screen: Screen) => {
		setEditing(true);
		go(screen, -1);
	};

	return {
		s,
		set,
		pick,
		dir,
		editing,
		events: EVENTS,
		ev,
		today: p.today,
		monthName: (m: number) => MONTHS[m],
		isPast,
		isFull,
		pickDate,
		dateLong,
		dShort,
		busy,
		manual,
		setManual,
		mH: mT[0],
		mM: mT[1],
		setMT: (h: number, m: number) => setMTState([h, m]),
		onEnter,
		mapsSearch: mapsQ([s.venue, s.city].filter(Boolean).join(" ") || "venue"),
		mapsIn,
		onMapsIn: (val: string) => {
			if (isMaps(val)) {
				set({ mapsUrl: val.trim() });
				setMapsIn("");
			} else setMapsIn(val);
		},
		mapsErr: !!(mapsIn && mapsIn.trim().length > 6 && !isMaps(mapsIn)),
		loadingPkgs: false,
		pkgs,
		recLabel: rec[1],
		pickPkg: (cat: string) =>
			pick(
				{
					pkg: cat,
					dur: s.pkg === cat ? s.dur : null,
					fmt: s.pkg === cat ? s.fmt : null,
				},
				false,
			),
		pk,
		hasFmt,
		rp,
		fmtOp: (k: Fmt) => (s.fmt && s.fmt !== "later" && s.fmt !== k ? 0.4 : 1),
		pv,
		pvKey,
		bumpCls: mounted ? "bump" : "",
		pvTitleFmt: pvAlt ?? pfmt,
		setPvAlt,
		adds,
		addOpen,
		setAddOpen,
		addFocus,
		setAddFocus,
		setAdd: (id: string, n: number) =>
			setS((x) => ({ ...x, adds: { ...x.adds, [id]: Math.max(0, n) } })),
		touched,
		touch,
		v,
		verifiedNow,
		verifyErr,
		otp,
		onEmailCode,
		resend: () => (otp.mode === "email" ? toEmail() : startVerify(true)),
		editWa: () => go("contact", -1),
		toEmail,
		dashTitle: s.title || "Booking kamu",
		dashCountdown:
			s.date && !s.date.full
				? `${Math.round((new Date(s.date.y, s.date.m, s.date.d).getTime() - new Date(p.today.y, p.today.m, p.today.d).getTime()) / 864e5)} hari lagi`
				: "H-?",
		pkgLine: pk
			? `${pk.c.name} · ${s.dur} jam${s.units > 1 ? ` · ${s.units} booth` : ""}${hasFmt && fmtTxt ? ` · ${fmtTxt}` : ""}`
			: "—",
		bdLine: s.backdrop
			? s.backdrop === "tetra"
				? `Kain Tetra · ${bdName ?? "warna belum dipilih"}`
				: (BACKDROPS.find((x) => x.k === s.backdrop)?.label ?? "")
			: "—",
		addLine: adds
			.filter((a) => s.adds[a.id])
			.map(
				(a) => a.c.name + ((s.adds[a.id] ?? 0) > 1 ? ` ×${s.adds[a.id]}` : ""),
			)
			.join(", "),
		editTo,
		total,
		totalShown: rp(shown || total),
		dpStr: rp(dp),
		dp,
		submitErr,
		bar: b,
		barGo,
		back,
		offline,
		resume,
		setResume,
		code,
		first,
		go,
		adminWa: p.adminWa,
		router,
	};
}

/** Angka total di-tween 280ms ease-out cubic (mati saat reduced-motion). */
function useTween(to: number): number {
	const [v, setV] = useState(to);
	const from = useRef(to);
	useEffect(() => {
		const rm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
		if (rm || !from.current) {
			from.current = to;
			setV(to);
			return;
		}
		const a = from.current;
		const t0 = performance.now();
		let raf = 0;
		const f = (now: number) => {
			const k = Math.min(1, (now - t0) / 280);
			const cur = Math.round(a + (to - a) * (1 - (1 - k) ** 3));
			from.current = cur;
			setV(cur);
			if (k < 1) raf = requestAnimationFrame(f);
		};
		raf = requestAnimationFrame(f);
		return () => cancelAnimationFrame(raf);
	}, [to]);
	return v;
}

// ── Komponen utama ──────────────────────────────────────────────────────────

export function BookingWizard(props: Props) {
	const x = useBooking(props);
	const s = x.s;
	const ph = PHASE[s.screen] ?? 0;
	const stageBg = PCOL[ph];
	const bg =
		s.screen === "intro"
			? "#F8F7F4"
			: s.screen === "done"
				? "#D6F1EA"
				: stageBg;
	return (
		<div className="bk bk-app" style={{ background: bg }}>
			{x.offline && (
				<div
					role="status"
					style={{
						flex: "none",
						margin: "6px 12px",
						padding: "10px 14px",
						border: `1.5px dashed ${INK}`,
						borderRadius: 12,
						background: "#D6EEF8",
						fontSize: 13,
						lineHeight: 1.4,
						fontWeight: 600,
						position: "relative",
						zIndex: 4,
					}}
				>
					Koneksi terputus. Isianmu tersimpan, lanjutkan saat sinyal kembali.
				</div>
			)}
			{s.screen === "intro" ? (
				<Intro x={x} />
			) : s.screen === "done" ? (
				<Done x={x} />
			) : (
				<div className="bk-grid">
					<aside className="bk-left" style={{ background: stageBg }}>
						<LeftPanel x={x} ph={ph} />
					</aside>
					<div className="only-m">
						<MobileHeader x={x} ph={ph} />
					</div>
					<div className="bk-right">
						<div className="bk-right-inner">
							<div className="bk-scroll noscroll">
								<div key={s.screen} className={x.dir > 0 ? "step-f" : "step-b"}>
									<Steps x={x} />
								</div>
							</div>
							<BottomBar x={x} />
						</div>
					</div>
				</div>
			)}
		</div>
	);
}

function questions(x: Ctx): [string, string] {
	const s = x.s;
	const first = x.first;
	const pk = x.pk;
	const Q: Partial<Record<Screen, [string, string]>> = {
		type: ["Hai! Acara apa yang mau kamu rayakan?", ""],
		date: [
			x.ev ? `${x.ev.label}! Kapan hari H-nya?` : "Kapan hari H-nya?",
			"Pilih tanggal, lalu jam mulainya.",
		],
		city: [
			"Di mana acaranya?",
			"Kota wajib. Venue dan link Maps boleh menyusul.",
		],
		pkg: ["Mau booth yang mana?", "Ketuk paket untuk lihat penjelasannya."],
		dur: [pk ? `Berapa jam ${pk.c.name}?` : "Berapa jam?", ""],
		fmt: [
			"Hasil cetak & backdrop",
			"Bandingkan ukurannya. Harga tidak berubah.",
		],
		backdrop: [
			"Backdrop-nya pakai punya siapa?",
			"Backdrop = latar di belakang booth.",
		],
		add: ["Mau tambah sesuatu?", "Opsional, boleh dilewati."],
		title: [
			"Nama apa yang tercetak di frame?",
			"Ini yang tercetak di frame foto.",
		],
		design: [
			"Desain frame-nya kamu pilih nanti",
			"Dari katalog template atau custom. Ketuk template untuk intip.",
		],
		dash: [
			first ? `${first}, ini dashboard kamu nanti` : "Ini dashboard kamu nanti",
			"Setelah kirim booking, semua diatur dari sini.",
		],
		contact: [
			first ? `Hai ${first}! Tinggal data kontak` : "Kenalan dulu, ya",
			"Sekali isi: nama, WhatsApp, email, dan info WO. Email & WO boleh dikosongkan.",
		],
		otp:
			x.otp.mode === "email"
				? ["Cek email kamu", `Kode 6 digit dikirim ke ${s.email.trim()}.`]
				: [
						"Kirim kode ke WhatsApp Tetra",
						`Kirim dari nomor +62 ${waFmt(dig(s.wa))}, ya.`,
					],
		review: [
			first ? `Ini booking kamu, ${first}` : "Ini booking kamu",
			"Ketuk baris mana saja untuk mengubah.",
		],
	};
	return Q[s.screen] ?? ["", ""];
}

function MobileHeader({ x, ph }: { x: Ctx; ph: number }) {
	const [t, h] = questions(x);
	return (
		<div style={{ flex: "none", padding: "0 8px 16px", borderBottom: B }}>
			<div
				style={{
					display: "grid",
					gridTemplateColumns: "48px minmax(0,1fr) 48px",
					alignItems: "center",
					height: 48,
				}}
			>
				<button
					type="button"
					onClick={x.back}
					aria-label="Kembali"
					style={{
						width: 44,
						height: 44,
						border: 0,
						borderRadius: 12,
						background: "transparent",
						fontSize: 22,
					}}
				>
					←
				</button>
				<div
					aria-hidden
					style={{ display: "flex", justifyContent: "center", gap: 5 }}
				>
					{PHASES.map((l, i) => (
						<span
							key={l}
							style={{
								height: 8,
								width: i === ph ? 34 : 8,
								borderRadius: 4,
								border: B,
								background: i <= ph ? INK : "#FFFFFF",
								transition: "width 250ms,background 250ms",
							}}
						/>
					))}
				</div>
				<span style={{ textAlign: "center", ...mono, fontSize: 12 }}>
					{ph + 1}/4
				</span>
			</div>
			<div
				style={{
					display: "flex",
					gap: 12,
					alignItems: "center",
					padding: "6px 12px 0",
					minHeight: 122,
				}}
			>
				<div
					key={x.s.screen}
					className={x.dir > 0 ? "step-f" : "step-b"}
					style={{
						flex: 1,
						minWidth: 0,
						display: "flex",
						flexDirection: "column",
						gap: 6,
					}}
				>
					<span
						style={{ fontSize: 12, fontWeight: 800, letterSpacing: ".04em" }}
					>
						{PHASES[ph].toUpperCase()}
					</span>
					<h1
						style={{
							margin: 0,
							fontSize: 25,
							lineHeight: 1.12,
							fontWeight: 800,
							letterSpacing: "-.035em",
							textWrap: "balance",
						}}
					>
						{t}
					</h1>
					{h && (
						<p
							style={{
								margin: 0,
								fontSize: 14,
								lineHeight: 1.4,
								color: "#3A3936",
							}}
						>
							{h}
						</p>
					)}
				</div>
				<div
					style={{
						flex: "none",
						width: 100,
						display: "flex",
						justifyContent: "center",
					}}
				>
					<div key={x.pvKey} className={x.bumpCls}>
						<PrintPreview {...x.pv} zoom={0.34} rot="4deg" />
					</div>
				</div>
			</div>
		</div>
	);
}

function BottomBar({ x }: { x: Ctx }) {
	const b = x.bar;
	if (!b.show) return null;
	return (
		<div className="bk-bar">
			{b.on ? (
				<Cta onClick={x.barGo} style={{ flex: 1 }}>
					{b.label}
				</Cta>
			) : (
				<button
					type="button"
					disabled
					style={{
						flex: 1,
						height: 56,
						border: "1.5px solid #D6D3CC",
						borderRadius: 14,
						background: "#EFEDE8",
						color: "#8A8883",
						fontSize: 16,
						fontWeight: 700,
					}}
				>
					{b.label}
				</button>
			)}
		</div>
	);
}

// ── Pembuka ─────────────────────────────────────────────────────────────────

function Circle({ style }: { style: CSSProperties }) {
	return (
		<div
			aria-hidden
			style={{ position: "absolute", borderRadius: "50%", border: B, ...style }}
		/>
	);
}

function resumeLine(r: Draft): string {
	const e = EVENTS.find((x) => x.id === r.event);
	const k = r.pkg ? PKG[r.pkg] : null;
	return (
		[e?.label, r.date && `${r.date.d} ${MON3[r.date.m]} ${r.date.y}`, k?.name]
			.filter(Boolean)
			.join(" · ") || "Booking belum selesai"
	);
}

function Intro({ x }: { x: Ctx }) {
	const r = x.resume;
	const doResume = () => {
		if (!r) return;
		x.set({ ...r, calShut: !!r.date && !r.date.full });
		x.setResume(null);
		history.pushState({ bk: r.screen }, "");
	};
	const fresh = () => {
		try {
			localStorage.removeItem(LS);
		} catch {}
		x.setResume(null);
		x.go("type");
	};
	const pv = { title: "Nama acaramu", date: "TANGGAL ACARAMU" };
	return (
		<>
			{/* HP */}
			<div className="only-m">
				<Circle
					style={{
						right: -70,
						top: -96,
						width: 280,
						height: 280,
						background: "#8EDCCB",
					}}
				/>
				<Circle
					style={{
						left: -60,
						top: 284,
						width: 170,
						height: 170,
						background: "#FCE3C6",
					}}
				/>
				<Circle
					style={{
						right: 40,
						top: 374,
						width: 46,
						height: 46,
						background: "#CEC8F6",
					}}
				/>
				<div
					className="step-f"
					style={{
						flex: 1,
						minHeight: 0,
						position: "relative",
						display: "flex",
						flexDirection: "column",
						padding: "6px 24px 0",
					}}
				>
					<Logo h={22} />
					<div style={{ height: 380, flex: "none", position: "relative" }}>
						<div
							className="rise"
							style={
								{
									"--i": 0,
									position: "absolute",
									left: 18,
									top: 46,
									zIndex: 1,
								} as CSSProperties
							}
						>
							<PrintPreview fmt="strip" {...pv} zoom={0.86} rot="-9deg" />
						</div>
						<div
							className="rise"
							style={
								{
									"--i": 2,
									position: "absolute",
									right: 6,
									top: 70,
									zIndex: 1,
								} as CSSProperties
							}
						>
							<PrintPreview fmt="4r" {...pv} zoom={0.7} rot="8deg" />
						</div>
						<div
							className="rise"
							style={
								{
									"--i": 1,
									position: "absolute",
									left: 84,
									top: 28,
									zIndex: 2,
								} as CSSProperties
							}
						>
							<PrintPreview fmt="polaroid" {...pv} zoom={0.78} rot="2deg" />
						</div>
					</div>
					<div
						style={{
							display: "flex",
							flexDirection: "column",
							gap: 10,
							position: "relative",
							zIndex: 2,
						}}
					>
						<h1
							style={{
								margin: 0,
								fontSize: 34,
								lineHeight: 1.04,
								fontWeight: 800,
								letterSpacing: "-.045em",
								textWrap: "balance",
							}}
						>
							Amankan tanggalmu. Kenangannya kami yang cetak.
						</h1>
						<p style={{ margin: 0, fontSize: 15, color: "#3A3936" }}>
							Sekitar 2 menit. Tanggal terkunci setelah DP.
						</p>
					</div>
				</div>
				<div
					style={{
						position: "absolute",
						left: 0,
						right: 0,
						bottom: 0,
						padding:
							"16px 18px max(30px, calc(12px + env(safe-area-inset-bottom)))",
						display: "flex",
						flexDirection: "column",
						gap: 10,
						zIndex: 3,
					}}
				>
					{r ? (
						<div
							style={{
								display: "flex",
								flexDirection: "column",
								gap: 12,
								padding: 16,
								border: B,
								borderRadius: 18,
								background: "#fff",
								boxShadow: layered(4),
							}}
						>
							<span
								style={{ display: "flex", flexDirection: "column", gap: 3 }}
							>
								<span style={{ fontSize: 16, fontWeight: 800 }}>
									Lanjutkan draf booking kamu?
								</span>
								<span style={{ fontSize: 13, color: "#3A3936" }}>
									{resumeLine(r)}
								</span>
							</span>
							<Cta
								onClick={doResume}
								bg="#FFFFFF"
								style={{ height: 52, fontSize: 16 }}
							>
								Lanjutkan
							</Cta>
							<button
								type="button"
								onClick={fresh}
								style={{
									height: 32,
									border: 0,
									background: "transparent",
									fontSize: 14,
									fontWeight: 700,
									textDecoration: "underline",
									textUnderlineOffset: 3,
								}}
							>
								Mulai dari awal
							</button>
						</div>
					) : (
						<>
							<Cta
								onClick={() => x.go("type")}
								style={{
									height: 58,
									borderRadius: 16,
									display: "flex",
									alignItems: "center",
									justifyContent: "center",
									gap: 10,
								}}
							>
								Mulai booking <Arrow size={30} />
							</Cta>
							<a
								href="/akun"
								style={{
									textAlign: "center",
									fontSize: 14,
									height: 28,
									display: "flex",
									alignItems: "center",
									justifyContent: "center",
								}}
							>
								Sudah pernah booking? Masuk
							</a>
						</>
					)}
				</div>
			</div>
			{/* Desktop */}
			<div className="only-d">
				<Circle
					style={{
						right: -120,
						top: -140,
						width: 520,
						height: 520,
						background: "#8EDCCB",
					}}
				/>
				<Circle
					style={{
						left: -110,
						bottom: -130,
						width: 380,
						height: 380,
						background: "#FCE3C6",
					}}
				/>
				<Circle
					style={{
						left: 240,
						top: 120,
						width: 60,
						height: 60,
						background: "#CEC8F6",
					}}
				/>
				<div
					style={{
						position: "relative",
						zIndex: 2,
						height: 72,
						flex: "none",
						display: "flex",
						alignItems: "center",
						justifyContent: "space-between",
						padding: "0 48px",
					}}
				>
					<Logo h={26} />
					<a href="/akun" style={{ fontSize: 14 }}>
						Sudah pernah booking? Masuk
					</a>
				</div>
				<div
					className="step-f"
					style={{
						position: "relative",
						zIndex: 2,
						flex: 1,
						minHeight: 0,
						display: "grid",
						gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)",
						alignItems: "center",
						padding: "0 48px 0 120px",
						gap: 40,
					}}
				>
					<div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
						<h1
							style={{
								margin: 0,
								fontSize: 76,
								lineHeight: 0.98,
								fontWeight: 800,
								letterSpacing: "-.05em",
								textWrap: "balance",
							}}
						>
							Amankan tanggalmu. Kenangannya kami yang cetak.
						</h1>
						<p
							style={{
								margin: 0,
								fontSize: 19,
								lineHeight: 1.5,
								color: "#3A3936",
								maxWidth: 440,
							}}
						>
							Sekitar 2 menit. Tanggal terkunci setelah DP.
						</p>
						{r ? (
							<div
								style={{
									width: 440,
									display: "flex",
									flexDirection: "column",
									gap: 12,
									padding: 18,
									border: B,
									borderRadius: 18,
									background: "#fff",
									boxShadow: layered(5),
								}}
							>
								<span
									style={{ display: "flex", flexDirection: "column", gap: 3 }}
								>
									<span style={{ fontSize: 17, fontWeight: 800 }}>
										Lanjutkan draf booking kamu?
									</span>
									<span style={{ fontSize: 14, color: "#3A3936" }}>
										{resumeLine(r)}
									</span>
								</span>
								<div style={{ display: "flex", alignItems: "center", gap: 18 }}>
									<Cta
										onClick={doResume}
										bg="#FFFFFF"
										style={{ flex: 1, height: 52, fontSize: 16 }}
									>
										Lanjutkan
									</Cta>
									<button
										type="button"
										onClick={fresh}
										style={{
											border: 0,
											background: "transparent",
											fontSize: 14,
											fontWeight: 700,
											textDecoration: "underline",
											textUnderlineOffset: 3,
										}}
									>
										Mulai dari awal
									</button>
								</div>
							</div>
						) : (
							<Cta
								onClick={() => x.go("type")}
								o={6}
								style={{
									alignSelf: "flex-start",
									whiteSpace: "nowrap",
									height: 64,
									padding: "0 14px 0 28px",
									borderRadius: 18,
									fontSize: 19,
									display: "flex",
									alignItems: "center",
									gap: 16,
								}}
							>
								Mulai booking <Arrow size={38} />
							</Cta>
						)}
					</div>
					<div style={{ position: "relative", height: 600 }}>
						<div
							className="rise"
							style={
								{
									"--i": 0,
									position: "absolute",
									left: 30,
									top: 120,
								} as CSSProperties
							}
						>
							<PrintPreview fmt="strip" {...pv} zoom={1.3} rot="-9deg" />
						</div>
						<div
							className="rise"
							style={
								{
									"--i": 2,
									position: "absolute",
									right: 20,
									top: 150,
								} as CSSProperties
							}
						>
							<PrintPreview fmt="4r" {...pv} zoom={1.1} rot="8deg" />
						</div>
						<div
							className="rise"
							style={
								{
									"--i": 1,
									position: "absolute",
									left: 150,
									top: 60,
								} as CSSProperties
							}
						>
							<PrintPreview fmt="polaroid" {...pv} zoom={1.25} rot="2deg" />
						</div>
					</div>
				</div>
			</div>
		</>
	);
}

function Arrow({ size }: { size: number }) {
	return (
		<span
			style={{
				width: size,
				height: size,
				borderRadius: size / 2,
				border: B,
				background: "#8EDCCB",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				fontSize: size > 32 ? 18 : 16,
			}}
		>
			→
		</span>
	);
}

function Logo({ h }: { h: number }) {
	return (
		// biome-ignore lint/performance/noImgElement: logo statis kecil.
		<img
			src="/portal/tetra-logo.png"
			alt="tetra"
			style={{
				height: h,
				width: "max-content",
				filter: "invert(1)",
				position: "relative",
				zIndex: 2,
			}}
		/>
	);
}

// ── Sukses ──────────────────────────────────────────────────────────────────

function Done({ x }: { x: Ctx }) {
	const steps = [
		{
			n: "1",
			dark: true,
			t: "Lengkapi 3 data",
			s: "Nama acara, pemilik acara, dan venue.",
			line: true,
		},
		{
			n: "2",
			dark: false,
			t: `Bayar DP ${x.dpStr}`,
			s: "Transfer, lalu unggah buktinya.",
			line: true,
		},
		{
			n: "3",
			dark: false,
			t: "Tanggal terkunci",
			s: "Setelah admin memverifikasi DP.",
			line: false,
		},
	];
	const open = () => x.router.push(`/akun/booking/${x.code}`);
	const chat = x.adminWa
		? `https://wa.me/${x.adminWa}?text=${encodeURIComponent(`Halo Tetra, saya baru booking dengan kode ${x.code}.`)}`
		: null;
	const nextList = (big: boolean) => (
		<div
			style={{
				display: "flex",
				flexDirection: "column",
				maxWidth: big ? 520 : undefined,
			}}
		>
			{steps.map((n) => (
				<div key={n.n} style={{ display: "flex", gap: big ? 16 : 14 }}>
					<div
						style={{
							display: "flex",
							flexDirection: "column",
							alignItems: "center",
							flex: "none",
						}}
					>
						<Dot
							size={big ? 30 : 28}
							mono
							bg={n.dark ? INK : "#fff"}
							fg={n.dark ? "#fff" : INK}
						>
							{n.n}
						</Dot>
						{n.line && (
							<span
								style={{
									flex: 1,
									borderLeft: `1.5px dashed ${INK}`,
									minHeight: big ? 14 : 12,
								}}
							/>
						)}
					</div>
					<div
						style={{
							display: "flex",
							flexDirection: "column",
							gap: 2,
							padding: big ? "5px 0 14px" : "4px 0 12px",
						}}
					>
						<span style={{ fontSize: big ? 16 : 15, fontWeight: 800 }}>
							{n.t}
						</span>
						<span style={{ fontSize: big ? 14 : 13, color: "#3A3936" }}>
							{n.s}
						</span>
					</div>
				</div>
			))}
		</div>
	);
	return (
		<>
			<div className="only-m">
				<div
					className="noscroll"
					style={{
						flex: 1,
						minHeight: 0,
						overflowY: "auto",
						display: "flex",
						flexDirection: "column",
						padding: "0 0 170px",
					}}
				>
					<div
						style={{
							height: 290,
							flex: "none",
							position: "relative",
							overflow: "hidden",
							borderBottom: B,
						}}
					>
						<div
							style={{
								position: "absolute",
								left: 40,
								right: 40,
								top: 14,
								height: 16,
								borderRadius: 8,
								background: INK,
								zIndex: 2,
							}}
						/>
						<div
							style={{
								position: "absolute",
								left: 0,
								right: 0,
								top: 22,
								bottom: 0,
								overflow: "hidden",
								display: "flex",
								justifyContent: "center",
							}}
						>
							<div className="emerge">
								<PrintPreview {...x.pv} zoom={0.78} rot="0deg" />
							</div>
						</div>
					</div>
					<div
						style={{
							display: "flex",
							flexDirection: "column",
							gap: 16,
							padding: "22px 22px 0",
							background: "#F8F7F4",
							flex: 1,
						}}
					>
						<div style={{ display: "flex", alignItems: "center", gap: 12 }}>
							<span className="checkpop">
								<Dot size={40} font={18} ok />
							</span>
							<h1
								style={{
									margin: 0,
									fontSize: 28,
									fontWeight: 800,
									letterSpacing: "-.035em",
								}}
							>
								Booking terkirim!
							</h1>
						</div>
						<div
							style={{
								display: "flex",
								gap: 10,
								alignItems: "flex-start",
								padding: "12px 14px",
								border: B,
								borderRadius: 14,
								background: "#FCE3C6",
								fontSize: 14,
								lineHeight: 1.45,
							}}
						>
							<LockOpen
								size={18}
								strokeWidth={2}
								style={{ flex: "none", marginTop: 1 }}
							/>
							<span>
								Kode <span style={{ ...mono, fontWeight: 600 }}>{x.code}</span>.
								Status masih <b>draf</b>, jadi <b>tanggalmu belum terkunci</b>.
								Tanggal terkunci setelah DP dibayar.
							</span>
						</div>
						{nextList(false)}
					</div>
				</div>
				<div
					style={{
						position: "absolute",
						left: 0,
						right: 0,
						bottom: 0,
						padding:
							"14px 18px max(30px, calc(12px + env(safe-area-inset-bottom)))",
						background: "#F8F7F4",
						borderTop: B,
						display: "flex",
						flexDirection: "column",
						gap: 8,
						zIndex: 3,
					}}
				>
					<Cta onClick={open}>Lengkapi data booking</Cta>
					{chat && (
						<a
							href={chat}
							target="_blank"
							rel="noopener noreferrer"
							style={{
								height: 44,
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								fontSize: 15,
							}}
						>
							Chat admin di WhatsApp
						</a>
					)}
				</div>
			</div>
			<div className="only-d">
				<div
					style={{
						flex: 1,
						minHeight: 0,
						display: "grid",
						gridTemplateColumns: "600px minmax(0,1fr)",
					}}
				>
					<div
						style={{
							position: "relative",
							overflow: "hidden",
							borderRight: B,
							background: "#D6F1EA",
						}}
					>
						<div style={{ position: "absolute", left: 56, top: 28, zIndex: 3 }}>
							<Logo h={24} />
						</div>
						<div
							style={{
								position: "absolute",
								left: 90,
								right: 90,
								top: 130,
								height: 20,
								borderRadius: 10,
								background: INK,
								zIndex: 2,
							}}
						/>
						<div
							style={{
								position: "absolute",
								left: 0,
								right: 0,
								top: 140,
								bottom: 0,
								overflow: "hidden",
								display: "flex",
								justifyContent: "center",
							}}
						>
							<div className="emerge">
								<PrintPreview {...x.pv} zoom={1.35} rot="0deg" />
							</div>
						</div>
					</div>
					<div
						className="step-f"
						style={{
							padding: "0 110px",
							display: "flex",
							flexDirection: "column",
							justifyContent: "center",
							gap: 24,
							background: "#F8F7F4",
						}}
					>
						<div style={{ display: "flex", alignItems: "center", gap: 14 }}>
							<span className="checkpop">
								<Dot size={52} font={24} ok />
							</span>
							<h1
								style={{
									margin: 0,
									fontSize: 48,
									fontWeight: 800,
									letterSpacing: "-.045em",
								}}
							>
								Booking terkirim!
							</h1>
						</div>
						<div
							style={{
								display: "flex",
								gap: 12,
								alignItems: "flex-start",
								padding: "14px 16px",
								border: B,
								borderRadius: 16,
								background: "#FCE3C6",
								fontSize: 15,
								lineHeight: 1.5,
								maxWidth: 520,
							}}
						>
							<LockOpen
								size={20}
								strokeWidth={2}
								style={{ flex: "none", marginTop: 2 }}
							/>
							<span>
								Kode <span style={{ ...mono, fontWeight: 600 }}>{x.code}</span>.
								Status masih <b>draf</b>, jadi <b>tanggalmu belum terkunci</b>.
								Tanggal terkunci setelah DP dibayar.
							</span>
						</div>
						{nextList(true)}
						<div style={{ display: "flex", gap: 24, alignItems: "center" }}>
							<Cta
								onClick={open}
								o={5}
								style={{
									flex: "none",
									whiteSpace: "nowrap",
									height: 58,
									padding: "0 30px",
									borderRadius: 16,
								}}
							>
								Lengkapi data booking
							</Cta>
							{chat && (
								<a
									href={chat}
									target="_blank"
									rel="noopener noreferrer"
									style={{ fontSize: 15 }}
								>
									Chat admin di WhatsApp
								</a>
							)}
						</div>
					</div>
				</div>
			</div>
		</>
	);
}

// ── Panel kiri desktop ──────────────────────────────────────────────────────

function LeftPanel({ x, ph }: { x: Ctx; ph: number }) {
	const s = x.s;
	const [t, h] = questions(x);
	const sc = s.screen;
	const stagePrint = ![
		"pkg",
		"dur",
		"add",
		"fmt",
		"contact",
		"otp",
		"title",
		"design",
		"dash",
	].includes(sc);
	const fp = x.pk ?? x.pkgs[0];
	const fa = x.adds.find((a) => a.id === x.addFocus) ?? x.adds[0];
	const chat = x.adminWa ? `https://wa.me/${x.adminWa}` : null;
	return (
		<>
			<div
				style={{
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
				}}
			>
				<Logo h={24} />
				{chat && (
					<a
						href={chat}
						target="_blank"
						rel="noopener noreferrer"
						style={{ fontSize: 14 }}
					>
						Chat admin
					</a>
				)}
			</div>
			<div
				aria-hidden
				style={{ display: "flex", alignItems: "center", marginTop: 36 }}
			>
				{PHASES.map((l, i) => (
					<div key={l} style={{ display: "flex", alignItems: "center" }}>
						{i > 0 && (
							<span
								style={{
									width: 26,
									borderTop: `1.5px ${i <= ph ? "solid" : "dashed"} ${INK}`,
									margin: "0 8px",
								}}
							/>
						)}
						<span style={{ display: "flex", alignItems: "center", gap: 7 }}>
							<Dot
								size={26}
								font={11}
								mono
								ok={i < ph}
								bg={i < ph ? "#5DB978" : i === ph ? INK : "#FFFFFF"}
								fg={i <= ph ? "#FFFFFF" : INK}
							>
								{i + 1}
							</Dot>
							<span style={{ fontSize: 13, fontWeight: i === ph ? 800 : 600 }}>
								{l}
							</span>
						</span>
					</div>
				))}
			</div>
			<div
				key={sc}
				className={x.dir > 0 ? "step-f" : "step-b"}
				style={{
					display: "flex",
					flexDirection: "column",
					gap: 12,
					marginTop: 40,
				}}
			>
				<button
					type="button"
					onClick={x.back}
					style={{
						alignSelf: "flex-start",
						height: 32,
						padding: 0,
						border: 0,
						background: "transparent",
						fontSize: 14,
						fontWeight: 700,
					}}
				>
					← Kembali
				</button>
				<h1
					style={{
						margin: 0,
						fontSize: 44,
						lineHeight: 1.05,
						fontWeight: 800,
						letterSpacing: "-.04em",
						textWrap: "balance",
					}}
				>
					{t}
				</h1>
				{h && (
					<p
						style={{
							margin: 0,
							fontSize: 17,
							lineHeight: 1.45,
							color: "#3A3936",
						}}
					>
						{h}
					</p>
				)}
			</div>
			<div
				style={{
					flex: 1,
					minHeight: 0,
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					padding: "16px 0",
				}}
			>
				{stagePrint && (
					<div key={x.pvKey} className={x.bumpCls}>
						<PrintPreview {...x.pv} zoom={0.8} rot="3deg" />
					</div>
				)}
				{(sc === "pkg" || sc === "dur") && fp && (
					<Card>
						<div style={{ display: "flex", gap: 14, alignItems: "center" }}>
							<IconChip
								icon={fp.c.icon}
								tint={fp.c.tint}
								size={56}
								radius={15}
								iconSize={28}
							/>
							<span
								style={{ display: "flex", flexDirection: "column", gap: 3 }}
							>
								<span
									style={{
										fontSize: 12,
										fontWeight: 800,
										letterSpacing: ".04em",
										color: "#5F5E5A",
									}}
								>
									{x.pk ? "PAKET PILIHANMU" : "REKOMENDASI"}
								</span>
								<span
									style={{
										fontSize: 24,
										fontWeight: 800,
										letterSpacing: "-.02em",
										lineHeight: 1.15,
									}}
								>
									{fp.c.name}
								</span>
							</span>
						</div>
						<span style={{ fontSize: 16, lineHeight: 1.55 }}>{fp.c.desc}</span>
						<div
							style={{
								display: "flex",
								flexDirection: "column",
								gap: 6,
								paddingTop: 12,
								borderTop: `1.5px dashed ${INK}`,
							}}
						>
							{fp.c.points.map((pt) => (
								<span
									key={pt}
									style={{
										display: "flex",
										gap: 10,
										fontSize: 14,
										lineHeight: 1.4,
									}}
								>
									<span style={{ flex: "none", fontWeight: 800 }}>✓</span>
									{pt}
								</span>
							))}
						</div>
						<div
							style={{
								display: "flex",
								justifyContent: "space-between",
								gap: 16,
								alignItems: "flex-end",
								paddingTop: 12,
								borderTop: `1.5px dashed ${INK}`,
							}}
						>
							<span
								style={{
									fontSize: 14,
									lineHeight: 1.45,
									color: "#3A3936",
									maxWidth: 280,
								}}
							>
								<b style={{ color: INK }}>Cocok untuk:</b> {fp.c.fit}
							</span>
							<span
								style={{
									...mono,
									fontSize: 15,
									fontWeight: 600,
									whiteSpace: "nowrap",
								}}
							>
								mulai {rp(Math.min(...fp.options.map((o) => o.price)))}
							</span>
						</div>
					</Card>
				)}
				{sc === "fmt" && (
					<div
						style={{
							width: "100%",
							display: "flex",
							flexDirection: "column",
							gap: 16,
						}}
					>
						<div
							style={{
								position: "relative",
								display: "flex",
								alignItems: "flex-end",
								justifyContent: "center",
								gap: 16,
								height: 226,
								borderBottom: B,
								padding: "0 0 12px 30px",
							}}
						>
							<Ruler size={12} left={8} />
							{FMTS.map(([k], i) => (
								<div
									key={k}
									className="drop"
									style={
										{
											"--i": i,
											opacity: x.fmtOp(k),
											transition: "opacity 200ms",
										} as CSSProperties
									}
								>
									<PrintPreview {...x.pv} fmt={k} zoom={0.6} rot="0deg" />
								</div>
							))}
						</div>
						<div
							style={{
								display: "grid",
								gridTemplateColumns: "repeat(3,minmax(0,1fr))",
								gap: 14,
							}}
						>
							{FMTS.map(([k, label]) => (
								<div
									key={k}
									style={{
										display: "flex",
										flexDirection: "column",
										gap: 4,
										opacity: x.fmtOp(k),
										transition: "opacity 200ms",
									}}
								>
									<span style={{ fontSize: 15, fontWeight: 800 }}>{label}</span>
									<span style={{ ...mono, fontSize: 12 }}>{FMTD[k][0]}</span>
									<span
										style={{ fontSize: 13, lineHeight: 1.45, color: "#3A3936" }}
									>
										{FMTD[k][1]}
									</span>
								</div>
							))}
						</div>
					</div>
				)}
				{sc === "title" && (
					<div
						style={{
							display: "flex",
							flexDirection: "column",
							alignItems: "center",
							gap: 18,
							paddingTop: 12,
						}}
					>
						<div key={x.pvKey} className={x.bumpCls}>
							<PrintPreview {...x.pv} fmt={x.pvTitleFmt} zoom={1} rot="-2deg" />
						</div>
						<div
							style={{
								display: "flex",
								border: B,
								borderRadius: 12,
								overflow: "hidden",
								height: 40,
								background: "rgba(255,255,255,.5)",
							}}
						>
							{FMTS.map(([k, l], j) => (
								<button
									key={k}
									type="button"
									aria-pressed={x.pvTitleFmt === k}
									onClick={() => x.setPvAlt(k)}
									style={{
										width: 104,
										border: 0,
										borderLeft: j ? B : "0",
										background: x.pvTitleFmt === k ? "#FFFFFF" : "transparent",
										fontSize: 13,
										fontWeight: 800,
									}}
								>
									{l}
								</button>
							))}
						</div>
					</div>
				)}
				{sc === "design" && (
					<div
						style={{
							width: "100%",
							display: "flex",
							flexDirection: "column",
							gap: 14,
						}}
					>
						<div
							style={{
								display: "grid",
								gridTemplateColumns: "repeat(3,minmax(0,1fr))",
								gap: 12,
							}}
						>
							{THEMES.map(([k, l]) => (
								<button
									key={k}
									type="button"
									aria-pressed={s.theme === k}
									onClick={() => x.set({ theme: k })}
									style={{
										display: "flex",
										flexDirection: "column",
										alignItems: "center",
										gap: 6,
										padding: "10px 6px 8px",
										border: B,
										borderRadius: 16,
										background: s.theme === k ? "#FFFFFF" : "transparent",
										boxShadow: s.theme === k ? SEL : "none",
										transition: "background 150ms",
									}}
								>
									<PrintPreview
										{...x.pv}
										fmt={x.pvTitleFmt}
										theme={k}
										zoom={0.38}
										rot="0deg"
									/>
									<span style={{ fontSize: 13, fontWeight: 800 }}>{l}</span>
								</button>
							))}
						</div>
						<span
							style={{
								display: "flex",
								gap: 8,
								alignItems: "center",
								justifyContent: "center",
								fontSize: 13,
								fontWeight: 700,
							}}
						>
							<LockKeyhole size={16} strokeWidth={2} />
							Contoh katalog. Pilihan final setelah DP.
						</span>
					</div>
				)}
				{sc === "dash" && (
					<div
						className="pop"
						style={{
							width: "100%",
							border: B,
							borderRadius: 22,
							background: "#fff",
							overflow: "hidden",
							boxShadow: layered(6, "#FFFFFF"),
						}}
					>
						<div
							style={{
								display: "flex",
								justifyContent: "space-between",
								alignItems: "center",
								padding: "16px 20px",
								background: "#FCE3C6",
								borderBottom: B,
							}}
						>
							<span
								style={{ display: "flex", flexDirection: "column", gap: 2 }}
							>
								<span
									style={{
										fontSize: 11,
										fontWeight: 800,
										letterSpacing: ".06em",
									}}
								>
									DASHBOARD BOOKING
								</span>
								<span
									style={{
										fontSize: 20,
										fontWeight: 800,
										letterSpacing: "-.02em",
									}}
								>
									{x.dashTitle}
								</span>
							</span>
							<span
								style={{
									...mono,
									fontSize: 12,
									padding: "4px 10px",
									border: B,
									borderRadius: 999,
									background: "#fff",
									whiteSpace: "nowrap",
								}}
							>
								{x.dashCountdown}
							</span>
						</div>
						<div
							style={{
								display: "grid",
								gridTemplateColumns: "repeat(2,minmax(0,1fr))",
								gap: 10,
								padding: 14,
							}}
						>
							{DASH_TILES.map((tl) => (
								<div
									key={tl.t}
									style={{
										display: "flex",
										flexDirection: "column",
										gap: 14,
										padding: 14,
										border: B,
										borderRadius: 14,
										background: tl.bg,
										minHeight: 104,
									}}
								>
									<span
										style={{
											display: "flex",
											justifyContent: "space-between",
											alignItems: "center",
										}}
									>
										<IconChip
											icon={tl.icon}
											tint="#fff"
											size={34}
											radius={10}
											iconSize={17}
										/>
										<span
											style={{
												fontSize: 11,
												fontWeight: 800,
												padding: "2px 8px",
												border: B,
												borderRadius: 999,
												background: "#fff",
											}}
										>
											{tl.badge}
										</span>
									</span>
									<span style={{ fontSize: 15, fontWeight: 800 }}>{tl.t}</span>
								</div>
							))}
						</div>
						<div
							style={{
								display: "flex",
								gap: 10,
								alignItems: "center",
								margin: "0 14px 14px",
								padding: "12px 14px",
								border: `1.5px dashed ${INK}`,
								borderRadius: 12,
								fontSize: 13,
							}}
						>
							<span
								style={{
									width: 10,
									height: 10,
									borderRadius: 5,
									background: "#5DB978",
									border: B,
								}}
							/>
							Status: Draf · tanggal terkunci setelah DP
						</div>
					</div>
				)}
				{(sc === "contact" || sc === "otp") && <Ticket x={x} />}
				{sc === "add" && fa && (
					<Card>
						<div style={{ display: "flex", gap: 14, alignItems: "center" }}>
							<IconChip
								icon={fa.c.icon}
								tint={fa.c.tint}
								size={56}
								radius={15}
								iconSize={28}
							/>
							<span
								style={{ display: "flex", flexDirection: "column", gap: 3 }}
							>
								<span
									style={{
										fontSize: 12,
										fontWeight: 800,
										letterSpacing: ".04em",
										color: "#5F5E5A",
									}}
								>
									APA INI?
								</span>
								<span
									style={{
										fontSize: 24,
										fontWeight: 800,
										letterSpacing: "-.02em",
									}}
								>
									{fa.c.name}
								</span>
							</span>
						</div>
						<span style={{ fontSize: 16, lineHeight: 1.55 }}>{fa.c.desc}</span>
						<span
							style={{
								...mono,
								fontSize: 15,
								fontWeight: 600,
								paddingTop: 12,
								borderTop: `1.5px dashed ${INK}`,
							}}
						>
							{fa.priceLine}
						</span>
					</Card>
				)}
			</div>
			{x.total > 0 && (
				<div
					style={{
						display: "flex",
						justifyContent: "space-between",
						alignItems: "center",
						padding: "14px 18px",
						border: B,
						borderRadius: 16,
						background: "#fff",
						boxShadow: layered(4, "#FFFFFF"),
					}}
				>
					<span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
						<span style={{ fontSize: 12, fontWeight: 700, color: "#5F5E5A" }}>
							Total
						</span>
						<span
							style={{
								...mono,
								fontSize: 24,
								fontWeight: 600,
								letterSpacing: "-.02em",
							}}
						>
							{x.totalShown}
						</span>
					</span>
					<span
						style={{
							display: "flex",
							flexDirection: "column",
							gap: 2,
							textAlign: "right",
						}}
					>
						<span style={{ fontSize: 12, fontWeight: 700, color: "#5F5E5A" }}>
							DP minimal
						</span>
						<span style={{ ...mono, fontSize: 16, fontWeight: 600 }}>
							{x.dpStr}
						</span>
					</span>
				</div>
			)}
		</>
	);
}

function Card({ children }: { children: React.ReactNode }) {
	return (
		<div
			className="pop"
			style={{
				width: "100%",
				display: "flex",
				flexDirection: "column",
				gap: 14,
				padding: 22,
				border: B,
				borderRadius: 22,
				background: "#fff",
				boxShadow: layered(6, "#FFFFFF"),
			}}
		>
			{children}
		</div>
	);
}

function Ticket({ x }: { x: Ctx }) {
	const s = x.s;
	const v = x.v;
	const rows = [
		{
			icon: x.ev?.icon,
			k: "Acara",
			v: [x.ev?.label, s.title].filter(Boolean).join(" · ") || "—",
		},
		{
			icon: undefined,
			k: "Tanggal",
			v:
				[x.dShort, s.time === "unsure" ? "jam belum pasti" : s.time]
					.filter(Boolean)
					.join(" · ") || "—",
		},
		{
			icon: x.pk?.c.icon,
			k: "Paket",
			v: x.pk ? `${x.pk.c.name} · ${s.dur ?? "—"} jam` : "—",
		},
	];
	const contact = [
		{ k: "Nama", v: s.name || "…", on: !!s.name, ok: v.name },
		{
			k: "WhatsApp",
			v: s.wa ? `+62 ${s.wa}` : "…",
			on: !!s.wa,
			ok: x.verifiedNow,
		},
		{
			k: "Email",
			v: s.email || "opsional",
			on: !!s.email,
			ok: !!s.email && v.email,
		},
		{
			k: "Lewat WO",
			v: s.wo === "yes" ? s.woName || "…" : s.wo === "no" ? "Tidak" : "—",
			on: !!s.wo,
			ok: s.wo === "no" || (s.wo === "yes" && v.woName && v.woWa),
		},
	];
	return (
		<div
			className="pop"
			style={{
				width: "100%",
				border: B,
				borderRadius: 22,
				background: "#fff",
				boxShadow: layered(6, "#FFFFFF"),
				overflow: "hidden",
			}}
		>
			<div
				style={{
					display: "flex",
					justifyContent: "space-between",
					alignItems: "center",
					padding: "16px 22px",
					background: "#F8D98B",
					borderBottom: B,
				}}
			>
				<span style={{ fontSize: 13, fontWeight: 800, letterSpacing: ".06em" }}>
					TIKET BOOKING
				</span>
				<span
					style={{
						...mono,
						fontSize: 12,
						fontWeight: 600,
						padding: "3px 8px",
						border: B,
						borderRadius: 999,
						background: "#fff",
					}}
				>
					DRAF
				</span>
			</div>
			<div
				style={{
					padding: "8px 22px 12px",
					display: "flex",
					flexDirection: "column",
				}}
			>
				{rows.map((r) => {
					const I = r.icon;
					return (
						<div
							key={r.k}
							style={{
								display: "flex",
								gap: 12,
								alignItems: "center",
								padding: "9px 0",
							}}
						>
							<span
								style={{
									width: 18,
									flex: "none",
									opacity: 0.8,
									display: "flex",
								}}
							>
								{I ? (
									<I size={18} strokeWidth={2} />
								) : (
									<Calendar size={18} strokeWidth={2} />
								)}
							</span>
							<span
								style={{
									width: 70,
									flex: "none",
									fontSize: 13,
									color: "#5F5E5A",
								}}
							>
								{r.k}
							</span>
							<span
								style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 700 }}
							>
								{r.v}
							</span>
						</div>
					);
				})}
			</div>
			<div
				style={{
					position: "relative",
					height: 0,
					borderTop: `1.5px dashed ${INK}`,
				}}
			>
				<span
					style={{
						position: "absolute",
						left: -12,
						top: -12,
						width: 22,
						height: 22,
						borderRadius: 11,
						background: "#D6F1EA",
						border: B,
					}}
				/>
				<span
					style={{
						position: "absolute",
						right: -12,
						top: -12,
						width: 22,
						height: 22,
						borderRadius: 11,
						background: "#D6F1EA",
						border: B,
					}}
				/>
			</div>
			<div
				style={{
					padding: "14px 22px 18px",
					display: "flex",
					flexDirection: "column",
				}}
			>
				<span
					style={{
						fontSize: 12,
						fontWeight: 800,
						letterSpacing: ".06em",
						color: "#5F5E5A",
						paddingBottom: 4,
					}}
				>
					PEMESAN
				</span>
				{contact.map((r) => (
					<div
						key={r.k}
						style={{
							display: "flex",
							gap: 12,
							alignItems: "center",
							padding: "8px 0",
						}}
					>
						<Dot
							size={20}
							font={10}
							ok={!!r.ok}
							ring={r.ok ? INK : "#D6D3CC"}
						/>
						<span
							style={{
								width: 74,
								flex: "none",
								fontSize: 13,
								color: "#5F5E5A",
							}}
						>
							{r.k}
						</span>
						<span
							style={{
								flex: 1,
								minWidth: 0,
								fontSize: 15,
								fontWeight: 700,
								color: r.on ? INK : "#9A9892",
								overflow: "hidden",
								textOverflow: "ellipsis",
								whiteSpace: "nowrap",
							}}
						>
							{r.v}
						</span>
					</div>
				))}
			</div>
		</div>
	);
}
