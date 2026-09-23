import type { AiSchema, AiTool, AiToolContext } from "@/lib/ai/types";

/**
 * Server MCP (Model Context Protocol) minimal, transport Streamable HTTP
 * tanpa sesi: satu POST JSON-RPC = satu jawaban JSON. Cukup untuk agent
 * eksternal (Hermes di VPS) memakai tool yang sama dengan Tanya Tetra.
 *
 * Sengaja tanpa SDK: yang dipakai cuma 4 method, dan modul ini polos (tanpa
 * server-only) supaya bisa diuji dengan node --test.
 *
 * Tool tulis (mutates) diekspos DUA kali:
 *   <nama>_usulan → preview, readOnlyHint=true, tak menyimpan apa pun
 *   <nama>        → run, wajib `konfirmasi: true` dan ctx.actorId
 * Client yang punya gerbang persetujuan (Hermes `trust: untrusted`) cukup
 * meminta izin pada yang kedua.
 *
 * ponytail: tanpa sesi/SSE/batch — tambah kalau ada client yang menuntutnya.
 */

const PROTOCOL_VERSION = "2025-06-18";
const USULAN = "_usulan";

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

type McpToolEntry = {
	name: string;
	description: string;
	inputSchema: Record<string, unknown>;
	annotations: { readOnlyHint: boolean; destructiveHint?: boolean };
};

export function listMcpTools(tools: AiTool[]): McpToolEntry[] {
	const out: McpToolEntry[] = [];
	for (const t of tools) {
		const schema = toJsonSchema(t.parameters);
		if (!t.mutates) {
			out.push({
				name: t.name,
				description: t.description,
				inputSchema: schema,
				annotations: { readOnlyHint: true },
			});
			continue;
		}
		if (t.preview) {
			out.push({
				name: `${t.name}${USULAN}`,
				description:
					`PRATINJAU, tidak menyimpan apa pun: ${t.description} ` +
					`Panggil ini dulu, tunjukkan ringkasannya ke owner, dan baru panggil ${t.name} setelah owner setuju.`,
				inputSchema: schema,
				annotations: { readOnlyHint: true },
			});
		}
		const props = {
			...((schema.properties as Record<string, unknown>) ?? {}),
			konfirmasi: {
				type: "boolean",
				description:
					"Harus true. Hanya setelah owner menyetujui ringkasan dari tool _usulan.",
			},
		};
		const required = [...((schema.required as string[]) ?? []), "konfirmasi"];
		out.push({
			name: t.name,
			description: `MENULIS DATA. ${t.description} Wajib didahului ${t.name}${USULAN} dan persetujuan owner.`,
			inputSchema: { ...schema, properties: props, required },
			annotations: { readOnlyHint: false, destructiveHint: false },
		});
	}
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

function toolResult(id: JsonRpcId, result: unknown, isError: boolean) {
	return ok(id, {
		content: [{ type: "text", text: JSON.stringify(result) }],
		isError,
	});
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
				serverInfo: { name: "tetra-ops", version: "1.1.0" },
				instructions:
					"Data operasional Tetra Photobooth. Tanggal memakai zona WIB; angka uang dalam Rupiah. " +
					"Tool berakhiran _usulan hanya pratinjau. Tool tulis hanya boleh dipanggil setelah " +
					"owner menyetujui ringkasan usulannya, dengan konfirmasi=true.",
			});
		case "ping":
			return ok(id, {});
		case "tools/list":
			return ok(id, { tools: listMcpTools(tools) });
		case "tools/call": {
			const name = String(params.name ?? "");
			const args =
				params.arguments && typeof params.arguments === "object"
					? (params.arguments as Record<string, unknown>)
					: {};

			const isPreview = name.endsWith(USULAN);
			const base = isPreview ? name.slice(0, -USULAN.length) : name;
			const tool = tools.find((t) => t.name === base);
			if (!tool || (isPreview && !(tool.mutates && tool.preview))) {
				return fail(id, -32602, `Unknown tool: ${name}`);
			}

			try {
				if (isPreview) {
					const r = await tool.preview?.(args, ctx);
					if (hasError(r)) return toolResult(id, r, true);
					return toolResult(
						id,
						{ ...(r as object), perlu_konfirmasi: true },
						false,
					);
				}
				if (tool.mutates) {
					if (args.konfirmasi !== true) {
						return toolResult(
							id,
							{
								error: `Belum dikonfirmasi. Panggil ${tool.name}${USULAN}, tunjukkan ringkasannya ke owner, lalu panggil lagi dengan konfirmasi=true setelah owner setuju.`,
							},
							true,
						);
					}
					if (!ctx.actorId) {
						return toolResult(
							id,
							{ error: "Permukaan ini tidak boleh menulis data." },
							true,
						);
					}
				}
				const result = await tool.run(args, ctx);
				return toolResult(id, result, hasError(result));
			} catch (e) {
				const msg = e instanceof Error ? e.message : String(e);
				return toolResult(id, { error: `Tool gagal: ${msg}` }, true);
			}
		}
		default:
			return fail(id, -32601, `Method not found: ${method}`);
	}
}

function hasError(r: unknown): boolean {
	return !!r && typeof r === "object" && "error" in r;
}
