import assert from "node:assert/strict";
import { test } from "node:test";
import { handleMcpRequest, toJsonSchema } from "./mcp";
import type { AiTool, AiToolContext } from "./types";

const ctx = {
	role: "owner",
	todayISO: "2026-09-23",
	surface: "mcp",
} as AiToolContext;

const echo: AiTool = {
	name: "echo",
	description: "kembalikan argumen",
	scope: "ops",
	parameters: {
		type: "OBJECT",
		properties: {
			teks: { type: "STRING", description: "apa saja" },
			n: { type: "INTEGER", nullable: true },
		},
		required: ["teks"],
	},
	async run(args) {
		if (args.teks === "boom") return { error: "meledak" };
		return { teks: args.teks };
	},
};

test("skema Gemini → JSON Schema", () => {
	assert.deepEqual(toJsonSchema(echo.parameters), {
		type: "object",
		properties: {
			teks: { type: "string", description: "apa saja" },
			n: { type: ["integer", "null"] },
		},
		required: ["teks"],
	});
});

test("initialize + tools/list", async () => {
	const init = await handleMcpRequest(
		{ jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
		[echo],
		ctx,
	);
	assert.equal(init.status, 200);
	const list = await handleMcpRequest(
		{ jsonrpc: "2.0", id: 2, method: "tools/list" },
		[echo],
		ctx,
	);
	const body = list.body as {
		result: { tools: Array<Record<string, unknown>> };
	};
	assert.equal(body.result.tools[0].name, "echo");
	assert.deepEqual(body.result.tools[0].annotations, { readOnlyHint: true });
});

test("tools/call: sukses, error tool, tool tak dikenal, notifikasi", async () => {
	const call = async (params: unknown) =>
		(
			await handleMcpRequest(
				{ jsonrpc: "2.0", id: 3, method: "tools/call", params },
				[echo],
				ctx,
			)
		).body as {
			result?: { content: Array<{ text: string }>; isError: boolean };
			error?: unknown;
		};

	const ok = await call({ name: "echo", arguments: { teks: "hai" } });
	assert.equal(ok.result?.isError, false);
	assert.equal(JSON.parse(ok.result?.content[0].text ?? "{}").teks, "hai");

	const bad = await call({ name: "echo", arguments: { teks: "boom" } });
	assert.equal(bad.result?.isError, true);

	const unknown = await call({ name: "nope" });
	assert.ok(unknown.error);

	const notif = await handleMcpRequest(
		{ jsonrpc: "2.0", method: "notifications/initialized" },
		[echo],
		ctx,
	);
	assert.equal(notif.status, 202);
});
