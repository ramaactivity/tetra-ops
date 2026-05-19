/**
 * apply-migration.ts — Apply migration SQL file ke Supabase production via admin_exec_sql RPC.
 *
 * Prerequisites:
 *   • admin_exec_sql RPC sudah di-install (lihat 20260521_install_admin_exec_sql.sql)
 *   • SUPABASE_SERVICE_ROLE_KEY available di env
 *
 * Usage:
 *   node --experimental-strip-types --env-file=.env.local --no-warnings \
 *     scripts/apply-migration.ts <path/to/migration.sql>
 *
 * Examples:
 *   ... scripts/apply-migration.ts supabase/migrations/20260521_fix_crew_rekap_rls.sql
 *
 * Features:
 *   • Smart SQL splitter — respects $$ dollar-quoting, '...' string literals,
 *     -- line comments, and /* block *\/ comments
 *   • Execute statement-by-statement
 *   • Stop on first error (preserves atomicity guarantees per-statement;
 *     for full-atomic, wrap your migration in BEGIN/COMMIT inside DO block)
 *   • Progress output + summary
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
	console.error("❌ Missing env: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
	process.exit(1);
}
const sb = createClient(url, key, {
	auth: { persistSession: false, autoRefreshToken: false },
});

const c = {
	dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
	green: (s: string) => `\x1b[32m${s}\x1b[0m`,
	red: (s: string) => `\x1b[31m${s}\x1b[0m`,
	yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
	bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
	cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
};

/**
 * Smart Postgres SQL splitter.
 *
 * Respects:
 *   • Dollar-quoted strings: $$ ... $$ and $tag$ ... $tag$
 *   • Single-quoted strings: '...' with '' escape
 *   • Line comments: -- to end of line
 *   • Block comments: /* ... *\/
 *
 * Splits at unquoted top-level `;`.
 */
function splitSqlStatements(sql: string): string[] {
	const statements: string[] = [];
	let current = "";
	let i = 0;
	let inSingleQuote = false;
	let inDollarTag: string | null = null;
	let inLineComment = false;
	let inBlockComment = false;

	while (i < sql.length) {
		const ch = sql[i];
		const next = sql[i + 1];

		// Line comment continues until \n
		if (inLineComment) {
			current += ch;
			if (ch === "\n") inLineComment = false;
			i++;
			continue;
		}

		// Block comment continues until */
		if (inBlockComment) {
			if (ch === "*" && next === "/") {
				current += "*/";
				inBlockComment = false;
				i += 2;
				continue;
			}
			current += ch;
			i++;
			continue;
		}

		// Inside dollar-tagged string
		if (inDollarTag) {
			if (sql.startsWith(inDollarTag, i)) {
				current += inDollarTag;
				i += inDollarTag.length;
				inDollarTag = null;
				continue;
			}
			current += ch;
			i++;
			continue;
		}

		// Inside single-quoted string
		if (inSingleQuote) {
			if (ch === "'" && next === "'") {
				current += "''";
				i += 2;
				continue;
			}
			if (ch === "'") {
				current += "'";
				inSingleQuote = false;
				i++;
				continue;
			}
			current += ch;
			i++;
			continue;
		}

		// Detect comment / quote / tag start
		if (ch === "-" && next === "-") {
			current += "--";
			inLineComment = true;
			i += 2;
			continue;
		}
		if (ch === "/" && next === "*") {
			current += "/*";
			inBlockComment = true;
			i += 2;
			continue;
		}
		if (ch === "'") {
			current += "'";
			inSingleQuote = true;
			i++;
			continue;
		}
		// Dollar-tag: $tag$ atau $$
		if (ch === "$") {
			const tagMatch = sql.substring(i).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/);
			if (tagMatch) {
				inDollarTag = tagMatch[0];
				current += inDollarTag;
				i += inDollarTag.length;
				continue;
			}
		}

		// Statement separator
		if (ch === ";") {
			const trimmed = current.trim();
			if (trimmed && !isOnlyCommentsOrWhitespace(trimmed)) {
				statements.push(trimmed);
			}
			current = "";
			i++;
			continue;
		}

		current += ch;
		i++;
	}

	// Final statement
	const trailing = current.trim();
	if (trailing && !isOnlyCommentsOrWhitespace(trailing)) {
		statements.push(trailing);
	}

	return statements;
}

function isOnlyCommentsOrWhitespace(s: string): boolean {
	// Strip block & line comments, check if anything left
	const stripped = s
		.replace(/\/\*[\s\S]*?\*\//g, "")
		.replace(/--[^\n]*\n?/g, "")
		.trim();
	return stripped.length === 0;
}

async function applyMigration(filePath: string) {
	const abs = resolve(filePath);
	console.log(c.bold(`\n📄 Apply migration: ${filePath}\n`));

	let sql: string;
	try {
		sql = readFileSync(abs, "utf-8");
	} catch (err) {
		console.error(c.red(`❌ Cannot read file: ${(err as Error).message}`));
		process.exit(1);
	}

	const statements = splitSqlStatements(sql);
	console.log(c.dim(`  Found ${statements.length} statement(s) to execute.\n`));

	let success = 0;
	let failed = 0;
	const failures: Array<{ idx: number; preview: string; error: string }> = [];

	for (let idx = 0; idx < statements.length; idx++) {
		const stmt = statements[idx];
		const preview = stmt.split("\n")[0].slice(0, 80);
		process.stdout.write(`  [${idx + 1}/${statements.length}] ${preview}...`);

		const { data, error } = await sb.rpc("admin_exec_sql", { p_sql: stmt });

		if (error) {
			console.log(c.red(` ❌`));
			console.log(c.red(`     RPC error: ${error.message}`));
			failed++;
			failures.push({ idx: idx + 1, preview, error: error.message });
			break;
		}

		const result = data as { ok: boolean; duration_ms?: number; error?: string; sqlstate?: string };
		if (!result.ok) {
			console.log(c.red(` ❌`));
			console.log(c.red(`     SQL error [${result.sqlstate}]: ${result.error}`));
			failed++;
			failures.push({ idx: idx + 1, preview, error: `[${result.sqlstate}] ${result.error}` });
			break;
		}

		const duration = result.duration_ms ?? 0;
		console.log(c.green(` ✓ ${duration.toFixed(0)}ms`));
		success++;
	}

	console.log("");
	if (failed > 0) {
		console.log(c.bold(c.red(`❌ FAILED — ${success}/${statements.length} succeeded before error.`)));
		console.log(c.red(`   Stop pada statement #${failures[0].idx}: ${failures[0].preview}`));
		console.log(c.red(`   ${failures[0].error}`));
		console.log(c.dim("\n   Note: succeeded statements TIDAK di-rollback (Postgres EXECUTE atomic per-statement only)."));
		console.log(c.dim("   Untuk atomic-all-or-nothing, wrap migration di DO $$ BEGIN ... END $$ block."));
		process.exit(1);
	}

	console.log(c.bold(c.green(`✅ SUCCESS — ${success}/${statements.length} statements applied.\n`)));
}

const filePath = process.argv[2];
if (!filePath) {
	console.error("Usage: apply-migration.ts <path/to/migration.sql>");
	process.exit(1);
}

applyMigration(filePath).catch((err) => {
	console.error(c.red("\n❌ Unhandled error:"), err);
	process.exit(1);
});
