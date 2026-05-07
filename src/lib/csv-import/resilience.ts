// Shared resilience helpers for CSV importers.
//
// Goals:
// 1. Stay well within Vercel's 60s serverless function limit (10s on Hobby tier
//    if user is on free plan) — every server action call should complete
//    quickly even if some rows are slow.
// 2. Handle transient Supabase errors (connection drops, statement timeouts,
//    idle timeouts) without aborting the whole batch.
// 3. Bound concurrency so we don't blow past Supabase's pooled connection
//    limit (~60 on free tier).

const TRANSIENT_ERROR_PATTERNS = [
	/timeout/i,
	/timed out/i,
	/connection/i,
	/network/i,
	/ECONNRESET/i,
	/ETIMEDOUT/i,
	/57014/, // Postgres query_canceled
	/57P01/, // Postgres admin_shutdown
	/53300/, // Postgres too_many_connections
	/40001/, // Postgres serialization_failure
	/40P01/, // Postgres deadlock_detected
];

export function isTransientError(err: unknown): boolean {
	if (!err) return false;
	const msg =
		err instanceof Error
			? err.message
			: typeof err === "string"
				? err
				: typeof err === "object" && err !== null && "message" in err
					? String((err as { message: unknown }).message)
					: "";
	if (!msg) return false;
	return TRANSIENT_ERROR_PATTERNS.some((re) => re.test(msg));
}

export type RetryOptions = {
	maxAttempts?: number;
	baseDelayMs?: number;
	maxDelayMs?: number;
};

/**
 * Run `fn` with exponential backoff retry on transient errors.
 * Default: up to 3 attempts, 200ms → 600ms → 1800ms (capped at 5s).
 */
export async function withRetry<T>(
	fn: () => PromiseLike<T> | T,
	opts: RetryOptions = {},
): Promise<T> {
	const maxAttempts = opts.maxAttempts ?? 3;
	const baseDelayMs = opts.baseDelayMs ?? 200;
	const maxDelayMs = opts.maxDelayMs ?? 5_000;
	let lastErr: unknown;
	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		try {
			return await fn();
		} catch (err) {
			lastErr = err;
			if (!isTransientError(err) || attempt === maxAttempts) throw err;
			const delay = Math.min(
				baseDelayMs * 3 ** (attempt - 1),
				maxDelayMs,
			);
			await sleep(delay);
		}
	}
	throw lastErr;
}

export function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Race a promise against a timeout. Throws "Operation timed out" if the
 * timeout fires first.
 */
export async function withTimeout<T>(
	fn: () => PromiseLike<T> | T,
	timeoutMs: number,
	label = "operation",
): Promise<T> {
	let timeoutId: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<never>((_, reject) => {
		timeoutId = setTimeout(() => {
			reject(new Error(`${label} timed out after ${timeoutMs}ms`));
		}, timeoutMs);
	});
	try {
		return await Promise.race([Promise.resolve(fn()), timeout]);
	} finally {
		if (timeoutId) clearTimeout(timeoutId);
	}
}

/**
 * Run `tasks` with bounded concurrency. Returns settled results in original
 * order. Bounds concurrency to keep us under Supabase pooled-connection
 * limits and Vercel CPU pressure.
 */
export async function runWithConcurrency<T>(
	tasks: Array<() => Promise<T>>,
	concurrency = 5,
): Promise<Array<PromiseSettledResult<T>>> {
	const results: Array<PromiseSettledResult<T>> = new Array(tasks.length);
	let cursor = 0;
	const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, async () => {
		while (true) {
			const idx = cursor++;
			if (idx >= tasks.length) return;
			try {
				const v = await tasks[idx]();
				results[idx] = { status: "fulfilled", value: v };
			} catch (err) {
				results[idx] = { status: "rejected", reason: err };
			}
		}
	});
	await Promise.all(workers);
	return results;
}

/** Hard cap per server-action invocation (Vercel timeout protection). */
export const PER_BATCH_TIMEOUT_MS = 50_000;

/** Concurrency cap per batch — keeps us well under Supabase free-tier 60 conn pool. */
export const PER_BATCH_CONCURRENCY = 5;
