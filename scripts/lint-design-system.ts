/**
 * lint-design-system — regex-based design system enforcement.
 *
 * Biome's built-in linter doesn't ship token-level rules (e.g. "no
 * hardcoded rounded-2xl"). This script runs a curated set of greps
 * over src/ and reports violations. Use:
 *
 *   pnpm lint:design-system           # all rules, error-level → exit 1 on hit
 *   pnpm lint:design-system --warn    # all rules but treat errors as warnings
 *   pnpm lint:design-system --rule=no-native-form-control  # single rule
 *
 * Wire to a pre-commit hook (Husky / lefthook) when the project gets
 * one. For now, run manually before opening a PR.
 *
 * Severity migration: every rule starts as "warn" so existing code
 * doesn't immediately fail CI. Flip to "error" per rule once the
 * codebase is clean for that rule (see Decisions Log in DESIGN_SYSTEM.md).
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

type Severity = "error" | "warn";

interface Rule {
	id: string;
	severity: Severity;
	pattern: string; // ripgrep regex
	description: string;
	allow?: RegExp[]; // file path patterns that may legitimately match
}

const RULES: Rule[] = [
	{
		id: "no-decorative-radius",
		severity: "warn", // flip to "error" after one cleanup pass
		pattern: "rounded-2xl",
		description:
			"rounded-2xl is reserved for /marketing routes. Operational chrome uses rounded-lg (8px). See §4.2.",
		allow: [/src\/app\/\(marketing\)/, /src\/app\/dev\/primitives\//],
	},
	{
		id: "no-raw-shadow",
		severity: "warn",
		pattern: "shadow-(lg|xl|2xl)\\b",
		description:
			"Hardcoded shadow-lg/xl/2xl bypasses the elevation tokens. Use shadow-[var(--shadow-level-*)]. See §1.5.",
		allow: [/src\/app\/dev\/primitives\//, /src\/app\/\(marketing\)/],
	},
	{
		id: "no-decorative-color",
		severity: "warn",
		pattern: "(bg|text|border)-(violet|teal|indigo|pink|fuchsia|cyan)-",
		description:
			"Decorative colors (violet/teal/indigo/pink/fuchsia/cyan) are banned. Use semantic state tokens. See §1.1 + §4.3.",
		allow: [/src\/app\/dev\/primitives\//, /src\/app\/\(marketing\)/],
	},
	{
		id: "no-hardcoded-eyebrow",
		severity: "warn",
		// Matches the common copy-paste of the eyebrow style without using the .eyebrow class.
		pattern: 'text-\\[11px\\] uppercase[^"]*font-mono|font-mono[^"]*uppercase[^"]*text-\\[11px\\]',
		description:
			"Hardcoded eyebrow styling. Use the .eyebrow utility class from globals.css. See §1.2.",
		allow: [/src\/app\/dev\/primitives\//],
	},
	{
		id: "no-native-form-control",
		severity: "error", // already enforced today — flip immediately
		pattern: 'type="(time|date|color)"|<select\\b',
		description:
			"Native form controls are banned in user-facing code. Use Combobox / TimePicker / DatePicker. See §4.7.",
		allow: [
			/src\/components\/ui\/file-drop\.tsx/,
			/src\/components\/ui\/native-select\.tsx/,
			/src\/components\/ui\/select\.tsx/,
			/src\/components\/ui\/combobox\.tsx/,
			/src\/components\/ui\/time-picker\.tsx/,
			/src\/components\/ui\/date-picker\.tsx/,
			/src\/components\/ui\/month-picker\.tsx/,
			/src\/app\/dev\/primitives\//,
		],
	},
	{
		id: "no-native-select-usage",
		severity: "warn", // flip to "error" once Phase 2 sweeps non-booking forms
		pattern: "<NativeSelect\\b",
		description:
			"NativeSelect is banned in user-facing JSX trees — use Combobox allowFreeText={false}. The NativeSelect file stays as the shadcn Select wrapper. See §4.7.",
		allow: [
			/src\/components\/ui\/native-select\.tsx/,
			/src\/app\/dev\/primitives\//,
		],
	},
	{
		id: "no-handrolled-popup",
		severity: "error",
		pattern: "absolute[^\"']*top-full",
		description:
			"Hand-rolled popup using absolute-below-trigger positioning will clip inside SectionCard's overflow-hidden. Portal via base-ui or react-dom.createPortal. See §4.8.",
		allow: [],
	},
];

function rgInstalled(): boolean {
	const r = spawnSync("rg", ["--version"], { stdio: "ignore" });
	return r.status === 0;
}

function runRule(rule: Rule, srcRoot: string): Array<{ file: string; line: number; preview: string }> {
	const tool = rgInstalled() ? "rg" : "grep";
	const args = rgInstalled()
		? ["-n", "--no-heading", "-g", "*.tsx", "-g", "*.ts", "-e", rule.pattern, srcRoot]
		: ["-rn", "--include=*.tsx", "--include=*.ts", "-E", rule.pattern, srcRoot];
	const r = spawnSync(tool, args, { encoding: "utf8" });
	if (r.status !== 0 && r.stdout === "") return [];
	const lines = (r.stdout ?? "").trim().split("\n").filter(Boolean);
	const out: Array<{ file: string; line: number; preview: string }> = [];
	for (const line of lines) {
		// rg: path:line:content   grep: path:line:content
		const m = line.match(/^([^:]+):(\d+):(.*)$/);
		if (!m) continue;
		const [, file, ln, preview] = m;
		if (rule.allow?.some((re) => re.test(file))) continue;
		out.push({ file, line: Number(ln), preview: preview.trim() });
	}
	return out;
}

function main() {
	const args = process.argv.slice(2);
	const warnOnly = args.includes("--warn");
	const ruleFilter = args.find((a) => a.startsWith("--rule="))?.slice(7);

	const srcRoot = resolve(process.cwd(), "src");
	if (!existsSync(srcRoot)) {
		console.error(`✘ src/ not found at ${srcRoot}`);
		process.exit(2);
	}

	const filtered = ruleFilter ? RULES.filter((r) => r.id === ruleFilter) : RULES;
	if (ruleFilter && filtered.length === 0) {
		console.error(`✘ Unknown rule: ${ruleFilter}`);
		console.error(`  Available rules: ${RULES.map((r) => r.id).join(", ")}`);
		process.exit(2);
	}

	let errorCount = 0;
	let warnCount = 0;
	console.log(`\nDesign-system lint — ${filtered.length} rule(s) against ${srcRoot}\n`);

	for (const rule of filtered) {
		const hits = runRule(rule, srcRoot);
		const sev = warnOnly ? "warn" : rule.severity;
		const icon = hits.length === 0 ? "✔" : sev === "error" ? "✘" : "⚠";
		console.log(`${icon} ${rule.id} (${sev}): ${hits.length} hit(s)`);
		if (hits.length > 0) {
			console.log(`  ${rule.description}`);
			for (const h of hits.slice(0, 10)) {
				console.log(`    ${h.file}:${h.line} — ${h.preview}`);
			}
			if (hits.length > 10) {
				console.log(`    … +${hits.length - 10} more`);
			}
			if (sev === "error") errorCount += hits.length;
			else warnCount += hits.length;
		}
	}

	console.log(`\nSummary: ${errorCount} error(s), ${warnCount} warning(s)\n`);
	process.exit(errorCount > 0 ? 1 : 0);
}

main();
