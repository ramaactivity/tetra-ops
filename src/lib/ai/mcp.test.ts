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

const tulis: AiTool = {
	name: "tulis",
	description: "simpan sesuatu",
	scope: "ops",
	mutates: true,
	parameters: { type: "OBJECT", properties: { x: { type: "STRING" } } },
	async preview(args) {
		return { ringkasan: `akan simpan ${args.x}` };
	},
	async run(args) {
		return { tersimpan: args.x };
	},
};

test("tool tulis: usulan dulu, konfirmasi + actorId wajib", async () => {
	const list = (
		(await handleMcpRequest({ id: 1, method: "tools/list" }, [tulis], ctx))
			.body as { result: { tools: Array<Record<string, unknown>> } }
	).result.tools;
	assert.deepEqual(
		list.map((t) => [
			t.name,
			(t.annotations as { readOnlyHint: boolean }).readOnlyHint,
		]),
		[
			["tulis_usulan", true],
			["tulis", false],
		],
	);
	assert.ok(
		(list[1].inputSchema as { required: string[] }).required.includes(
			"konfirmasi",
		),
	);

	const call = async (name: string, args: unknown, c = ctx) =>
		(
			(
				await handleMcpRequest(
					{ id: 2, method: "tools/call", params: { name, arguments: args } },
					[tulis],
					c,
				)
			).body as {
				result: { content: Array<{ text: string }>; isError: boolean };
			}
		).result;

	const usulan = await call("tulis_usulan", { x: "a" });
	assert.equal(usulan.isError, false);
	assert.equal(JSON.parse(usulan.content[0].text).perlu_konfirmasi, true);

	const tanpaKonfirmasi = await call("tulis", { x: "a" });
	assert.equal(tanpaKonfirmasi.isError, true);

	const tanpaActor = await call("tulis", { x: "a", konfirmasi: true });
	assert.equal(tanpaActor.isError, true);

	const jadi = await call(
		"tulis",
		{ x: "a", konfirmasi: true },
		{ ...ctx, actorId: "u1" },
	);
	assert.equal(jadi.isError, false);
	assert.equal(JSON.parse(jadi.content[0].text).tersimpan, "a");

	// Tool baca tidak boleh punya varian _usulan.
	const salah = await handleMcpRequest(
		{
			id: 3,
			method: "tools/call",
			params: { name: "echo_usulan", arguments: {} },
		},
		[echo],
		ctx,
	);
	assert.ok((salah.body as { error?: unknown }).error);
});
