import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { after, before, test } from "node:test";
import { streamHermes } from "./hermes-sse";
import type { AiStreamEvent } from "./types";

/**
 * Server Hermes tiruan: perilakunya dipilih lewat isi pesan user terakhir.
 * Menguji jalur yang menentukan "jatuh ke Gemini atau tidak".
 */
let server: Server;
let baseUrl = "";

const sse = (event: string | null, data: unknown) =>
	`${event ? `event: ${event}\n` : ""}data: ${typeof data === "string" ? data : JSON.stringify(data)}\n\n`;
const chunk = (content: string, finish?: string) => ({
	choices: [{ delta: { content }, finish_reason: finish ?? null }],
});

before(async () => {
	server = createServer((req, res) => {
		let body = "";
		req.on("data", (c) => {
			body += c;
		});
		req.on("end", () => {
			const parsed = JSON.parse(body) as {
				messages: Array<{ role: string; content: string }>;
				model: string;
			};
			const last = parsed.messages.at(-1)?.content ?? "";
			if (req.headers.authorization !== "Bearer k") {
				res.writeHead(401).end();
				return;
			}
			if (last === "500") {
				res.writeHead(500).end("boom");
				return;
			}
			if (last === "hang") return; // tidak pernah menjawab
			res.writeHead(200, { "content-type": "text/event-stream" });
			if (last === "gagal-tanpa-teks") {
				res.write(sse(null, chunk("", "error")));
				res.end(sse(null, "[DONE]"));
				return;
			}
			if (last === "kosong") {
				res.end(sse(null, "[DONE]"));
				return;
			}
			res.write(
				sse("hermes.tool.progress", {
					tool: "mcp__tetra_ops__cari_event",
					status: "running",
				}),
			);
			res.write(": keepalive\n\n");
			res.write(sse(null, chunk("Besok ")));
			res.write(
				sse("hermes.tool.progress", { tool: "web_search", status: "running" }),
			);
			res.write(sse(null, chunk("ada 2 event.", "stop")));
			res.end(sse(null, "[DONE]"));
		});
	});
	await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
	const addr = server.address();
	if (!addr || typeof addr === "string") throw new Error("no addr");
	baseUrl = `http://127.0.0.1:${addr.port}`;
});
after(() => server.close());

const run = async (
	question: string,
	extra: Partial<Parameters<typeof streamHermes>[0]> = {},
) => {
	const out: AiStreamEvent[] = [];
	for await (const ev of streamHermes({
		endpoint: { baseUrl, apiKey: "k", model: "tetra" },
		system: "sys",
		messages: [{ role: "user", content: question }],
		label: (n) => `L:${n}`,
		...extra,
	})) {
		out.push(ev);
	}
	return out;
};

test("stream sukses: tool, teks, done dengan toolsUsed", async () => {
	assert.deepEqual(await run("besok?"), [
		{ type: "tool", name: "cari_event", label: "L:cari_event" },
		{ type: "text", value: "Besok " },
		{ type: "tool", name: "web_search", label: "L:web_search" },
		{ type: "text", value: "ada 2 event." },
		{ type: "done", toolsUsed: ["cari_event", "web_search"] },
	]);
});

test("gagal sebelum teks → melempar (supaya jatuh ke Gemini)", async () => {
	await assert.rejects(run("500"), /HTTP 500/);
	await assert.rejects(run("gagal-tanpa-teks"), /finish_reason=error/);
	await assert.rejects(run("kosong"), /tidak mengembalikan teks/);
	await assert.rejects(
		run("hang", { connectTimeoutMs: 200 }),
		/tidak terjangkau/,
	);
	await assert.rejects(
		run("x", { endpoint: { baseUrl, apiKey: "salah", model: "tetra" } }),
		/HTTP 401/,
	);
});

test("abort dari pemanggil diteruskan apa adanya", async () => {
	const ctrl = new AbortController();
	ctrl.abort();
	await assert.rejects(
		run("hang", { signal: ctrl.signal }),
		(e: Error) => e.name === "AbortError",
	);
});
