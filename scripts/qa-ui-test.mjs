/**
 * QA — uji alur "Tambah Aset Tetap" lewat browser headless.
 *
 * Dua mode:
 *   (default) "Catat pembeliannya ke pembukuan" DIMATIKAN → tidak ada jurnal,
 *             tidak ada kas yang bergerak. Yang diuji: pembuatan baris aset,
 *             penomoran unit, serial per unit, mode "nambah unit".
 *   "money"   pencatatan pembelian DINYALAKAN dengan nominal receh (Rp1.000/
 *             unit) → menulis jurnal beneran. Bersihkan setelahnya dengan
 *             `npx tsx scripts/qa-check.mts cleanup <REF-JURNAL>`.
 *
 * Semua item uji dinamai berawalan "ZZ TEST" supaya pagar di qa-check.mts
 * mengenalinya dan data asli tidak mungkin ikut terhapus.
 *
 * SESI LOGIN: skrip ini TIDAK membuat sesi sendiri (skrip pembuat sesi sengaja
 * tidak disimpan di repo — lihat catatan di bawah). Sediakan berkas JSON
 * berisi cookie sesi yang sudah ada:
 *   { "cookies": [ { "name": "sb-<ref>-auth-token.0", "value": "…" }, … ] }
 * Cara termudah: login di browser, salin cookie `sb-*-auth-token*` dari
 * DevTools. Simpan di luar repo dan hapus setelah dipakai.
 *
 * Pakai:
 *   node scripts/qa-ui-test.mjs <session.json> <dir-screenshot> <baseUrl> \
 *        <dir-node_modules-berisi-playwright> [money]
 */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const [, , sessionPath, shotDir, baseUrlArg, modulesDir, mode] = process.argv;
/** "money" = sekalian catat pembeliannya (menulis jurnal!). Default: tanpa jurnal. */
const WITH_BOOKING = mode === "money";
if (!sessionPath || !shotDir || !modulesDir) {
	console.error(
		"pakai: node scripts/qa-ui-test.mjs <session.json> <dir-screenshot> <baseUrl> <dir-node_modules-playwright>",
	);
	process.exit(1);
}
const BASE = baseUrlArg || "https://tetra-ops-lac.vercel.app";
const NAME = WITH_BOOKING ? "ZZ TEST PRINTER QA" : "ZZ TEST KAMERA QA";
const PRICE = WITH_BOOKING ? "1000" : "1000000";

const require_ = createRequire(`${modulesDir}/`);
const { chromium } = require_("playwright");

const session = JSON.parse(readFileSync(sessionPath, "utf8"));
const domain = new URL(BASE).hostname;

let pass = 0;
let fail = 0;
const check = (label, ok, detail = "") => {
	console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
	ok ? pass++ : fail++;
	return ok;
};

const browser = await chromium.launch();
const ctx = await browser.newContext({
	viewport: { width: 1280, height: 1400 },
});
await ctx.addCookies(
	session.cookies.map((c) => ({
		name: c.name,
		value: c.value,
		domain,
		path: "/",
		httpOnly: false,
		secure: true,
		sameSite: "Lax",
	})),
);
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

async function shot(name) {
	await page.screenshot({ path: `${shotDir}/${name}.png`, fullPage: true });
}

try {
	// ── 1. Halaman terbuka (bukan dilempar ke /login) ────────────────────
	console.log("\n1. Buka form Tambah Aset");
	await page.goto(`${BASE}/warehouse/items/new?category=fixed_asset`, {
		waitUntil: "networkidle",
		timeout: 60000,
	});
	check("tidak dilempar ke /login", !page.url().includes("/login"), page.url());
	await page.waitForSelector("#name", { timeout: 30000 });
	check("pemilih Nama Alat berupa combobox", true);
	await shot("01-form-kosong");

	// ── 2. Pemilih rekening sumber dana ──────────────────────────────────
	console.log("\n2. Dropdown 'Uang diambil dari' (pembelian tunai)");
	const bodyText1 = await page.locator("body").innerText();
	check(
		"label 'Uang diambil dari' tampil",
		bodyText1.includes("Uang diambil dari"),
	);
	const acctTrigger = page
		.locator("div:has(> span:text-is('Uang diambil dari')) button")
		.first();
	const readAcct = async () =>
		(await acctTrigger.count())
			? (await acctTrigger.innerText()).replace(/\s+/g, " ").trim()
			: "(tidak ketemu)";
	const acctBefore = await readAcct();
	check(
		"default sebelum harga diisi = rekening berisi (bukan Kas Tunai Rp 0)",
		/BCA/i.test(acctBefore),
		acctBefore,
	);
	await page.fill('input[name="purchase_price"]', PRICE);
	await page.waitForTimeout(300);
	const acctAfter = await readAcct();
	check(
		"default setelah harga diisi tetap rekening yang cukup",
		/BCA/i.test(acctAfter),
		acctAfter,
	);
	await shot("02-rekening-sumber");

	// ── 3. Isi form: alat baru, 2 unit, TANPA pembukuan ──────────────────
	console.log("\n3. Isi form — alat baru, 2 unit, tanpa jurnal");
	await page.fill("#name", NAME);
	await page.keyboard.press("Escape");
	await page.fill('input[name="quantity"]', "2");
	await page.fill('input[name="purchase_price"]', PRICE);
	await page.fill('input[name="useful_life_months"]', "24");

	const serialInputs = page.locator('input[name="serial_numbers"]');
	await serialInputs.first().waitFor({ timeout: 10000 });
	check(
		"kolom serial muncul sebanyak unit",
		(await serialInputs.count()) === 2,
		`${await serialInputs.count()} kolom`,
	);
	await serialInputs.nth(0).fill("QA-SN-001");
	await serialInputs.nth(1).fill("QA-SN-002");

	const bodyText2 = await page.locator("body").innerText();
	check("banner mode = 'Alat baru'", bodyText2.includes("Alat baru"));
	const skuLine = await page
		.locator("text=SKU otomatis:")
		.locator("xpath=..")
		.innerText();
	check(
		"pratinjau SKU menunjukkan rentang unit",
		skuLine.includes("…"),
		skuLine.replace(/\s+/g, " "),
	);

	const bookingToggle = page
		.locator(
			'label:has-text("Catat pembeliannya ke pembukuan") input[type="checkbox"]',
		)
		.first();
	if (WITH_BOOKING) {
		// Uji jalur uang: nota + jurnal beneran, rekening sumber = pilihan default.
		await bookingToggle.check();
		check("pencatatan pembelian dinyalakan", await bookingToggle.isChecked());
		const ringkasan = await page
			.locator('label:has-text("Catat pembeliannya ke pembukuan")')
			.first()
			.innerText();
		check(
			"ringkasan menyebut total seluruh unit",
			/2 × Rp\s?1\.000\s?=\s?Rp\s?2\.000/.test(ringkasan.replace(/\s+/g, " ")),
			(ringkasan.replace(/\s+/g, " ").match(/Uang keluar[^.]*/) ?? ["-"])[0],
		);
	} else {
		// Tidak ada jurnal sama sekali.
		await bookingToggle.uncheck();
		check("pencatatan pembelian dimatikan", !(await bookingToggle.isChecked()));
	}
	await shot(WITH_BOOKING ? "03m-terisi-2-unit" : "03-terisi-2-unit");

	const submit = page.locator('button[type="submit"]');
	check(
		"tombol simpan menyebut jumlah unit",
		(await submit.innerText()).includes("2 Unit"),
		(await submit.innerText()).trim(),
	);

	// ── 4. Simpan ────────────────────────────────────────────────────────
	console.log("\n4. Simpan");
	await Promise.all([
		page.waitForURL((u) => !u.pathname.includes("/items/new"), {
			timeout: 60000,
		}),
		submit.click(),
	]);
	check(
		"diarahkan keluar dari form",
		!page.url().includes("/items/new"),
		page.url(),
	);
	await shot("04-setelah-simpan");

	// ── 5. Mode "nambah unit" untuk alat yang sudah ada ──────────────────
	console.log("\n5. Buka lagi → pilih alat yang barusan dibuat");
	await page.goto(`${BASE}/warehouse/items/new?category=fixed_asset`, {
		waitUntil: "networkidle",
		timeout: 60000,
	});
	await page.waitForSelector("#name", { timeout: 30000 });
	await page.click("#name");
	await page.fill("#name", NAME);
	await page.waitForTimeout(500);
	const bodyText3 = await page.locator("body").innerText();
	check(
		"banner berubah jadi 'Nambah unit ke-3'",
		bodyText3.includes("Nambah unit ke-3"),
		(bodyText3.match(/Nambah unit ke-\d+/) ?? ["(tidak ada)"])[0],
	);
	check("daftar unit lama ikut tampil", bodyText3.includes("QA-SN-001"));
	const priceVal = await page.inputValue('input[name="purchase_price"]');
	check("harga terisi dari unit terakhir", priceVal === PRICE, priceVal);
	const lifeVal = await page.inputValue('input[name="useful_life_months"]');
	check("masa pakai terisi", lifeVal === "24", lifeVal);
	await shot(WITH_BOOKING ? "05m-mode-nambah-unit" : "05-mode-nambah-unit");

	// Simpan 1 unit tambahan — ikut mode tesnya.
	const toggle2 = page
		.locator(
			'label:has-text("Catat pembeliannya ke pembukuan") input[type="checkbox"]',
		)
		.first();
	if (WITH_BOOKING) await toggle2.check();
	else await toggle2.uncheck();
	await page.fill('input[name="serial_number"]', "QA-SN-003");
	const submit2 = page.locator('button[type="submit"]');
	check(
		"tombol simpan menyebut unit ke-3",
		(await submit2.innerText()).includes("Unit ke-3"),
		(await submit2.innerText()).trim(),
	);
	await Promise.all([
		page.waitForURL((u) => !u.pathname.includes("/items/new"), {
			timeout: 60000,
		}),
		submit2.click(),
	]);
	check("unit ke-3 tersimpan", !page.url().includes("/items/new"), page.url());
	await shot(WITH_BOOKING ? "06m-setelah-unit-3" : "06-setelah-unit-3");

	check(
		"tidak ada error JavaScript di halaman",
		errors.length === 0,
		errors.join(" | "),
	);
} catch (e) {
	console.error("\nGAGAL:", e.message);
	await shot("99-gagal").catch(() => {});
	fail++;
} finally {
	await browser.close();
}

console.log(`\n${pass} lolos, ${fail} gagal`);
process.exit(fail > 0 ? 1 : 0);
