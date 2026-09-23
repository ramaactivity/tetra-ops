import type { AiSchema, AiTool, AiToolContext } from "@/lib/ai/types";

/**
 * Server MCP (Model Context Protocol) minimal, transport Streamable HTTP
 * tanpa sesi: satu POST JSON-RPC = satu jawaban JSON. Cukup untuk agent
 * eksternal (Hermes di VPS) memakai tool yang sama dengan Tanya Tetra.
 *
 * Sengaja tanpa SDK: yang dipakai cuma 4 method, dan modul ini polos (tanpa
 * server-only) supaya bisa diuji dengan node --test.
 *
 * ponytail: tanpa sesi/SSE/batch — tambah kalau ada client yang menuntutnya.
 */

const PROTOCOL_VERSION = "2025-06-18";

type JsonRpcId = string | number | null;
type JsonRpcRequest = {
	jsonrpc?: string;
	id?: JsonRpcId;
	method?: string;
	params?: Record<string, unknown>;
};

export type McpReply = { status: number; body?: unknown };

/** Skema gaya Gemini (tipe HURUF BESAR) → JSON Schema biasa. */
export function toJsonSchema(s: AiSchema): Record<string, unknown> {
	const out: Record<string, unknown> = { type: s.type.toLowerCase() };
	if (s.description) out.description = s.description;
	if (s.enum) out.enum = s.enum;
	if (s.format) out.format = s.format;
	if (s.nullable) out.type = [s.type.toLowerCase(), "null"];
	if (s.items) out.items = toJsonSchema(s.items);
	if (s.properties) {
		out.properties = Object.fromEntries(
			Object.entries(s.properties).map(([k, v]) => [k, toJsonSchema(v)]),
		);
	}
	if (s.required?.length) out.required = s.required;
	return out;
}

function ok(id: JsonRpcId, result: unknown): McpReply {
	return { status: 200, body: { jsonrpc: "2.0", id, result } };
}

function fail(id: JsonRpcId, code: number, message: string): McpReply {
	return {
		status: 200,
		body: { jsonrpc: "2.0", id, error: { code, message } },
	};
}

export async function handleMcpRequest(
	raw: unknown,
	tools: AiTool[],
	ctx: AiToolContext,
): Promise<McpReply> {
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
		return fail(null, -32600, "Invalid Request");
	}
	const req = raw as JsonRpcRequest;
	const id = req.id ?? null;
	const method = req.method ?? "";
	const params = req.params ?? {};

	// Notifikasi (tanpa id) tidak butuh balasan.
	if (method.startsWith("notifications/")) return { status: 202 };

	switch (method) {
		case "initialize":
			return ok(id, {
				protocolVersion: PROTOCOL_VERSION,
				capabilities: { tools: {} },
				serverInfo: { name: "tetra-ops", version: "1.0.0" },
				instructions:
					"Data operasional Tetra Photobooth. Semua tool hanya membaca. " +
					"Tanggal memakai zona WIB; angka uang dalam Rupiah.",
			});
		case "ping":
			return ok(id, {});
		case "tools/list":
			return ok(id, {
				tools: tools.map((t) => ({
					name: t.name,
					description: t.description,
					inputSchema: toJsonSchema(t.parameters),
					annotations: { readOnlyHint: !t.mutates },
				})),
			});
		case "tools/call": {
			const name = String(params.name ?? "");
			const tool = tools.find((t) => t.name === name);
			if (!tool) return fail(id, -32602, `Unknown tool: ${name}`);
			const args =
				params.arguments && typeof params.arguments === "object"
					? (params.arguments as Record<string, unknown>)
					: {};
			try {
				const result = await tool.run(args, ctx);
				const isError =
					!!result && typeof result === "object" && "error" in result;
				return ok(id, {
					content: [{ type: "text", text: JSON.stringify(result) }],
					isError,
				});
			} catch (e) {
				const msg = e instanceof Error ? e.message : String(e);
				return ok(id, {
					content: [{ type: "text", text: `Tool gagal: ${msg}` }],
					isError: true,
				});
			}
		}
		default:
			return fail(id, -32601, `Method not found: ${method}`);
	}
}
