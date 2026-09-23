import "server-only";

import { MAX_HISTORY_TURNS, MAX_TOOL_ROUNDS } from "@/lib/ai/config";
import {
	type GeminiContent,
	type GeminiFunctionDeclaration,
	type GeminiPart,
	humanizeGeminiError,
	streamGemini,
} from "@/lib/ai/gemini";
import { buildSystemPrompt, type PromptContext } from "@/lib/ai/prompt";
import { findTool, toolLabel, toolsForRole } from "@/lib/ai/registry";
import type {
	AiChatMessage,
	AiStreamEvent,
	AiToolContext,
} from "@/lib/ai/types";

/**
 * Loop agent: kirim ke Gemini → kalau ia minta tool, jalankan → kirim balik
 * hasilnya → ulangi sampai ia menjawab dengan teks.
 *
 * Di-yield sebagai event supaya dua permukaan bisa memakai loop yang sama:
 * web menstreamkannya ke browser, Telegram cukup mengumpulkan teksnya.
 */

export type RunAgentArgs = {
	messages: AiChatMessage[];
	toolCtx: AiToolContext;
	promptCtx: PromptContext;
	signal?: AbortSignal;
};

export async function* runAgent(
	args: RunAgentArgs,
): AsyncGenerator<AiStreamEvent, void, undefined> {
	const { messages, toolCtx, promptCtx, signal } = args;

	// Permukaan ini belum punya alur konfirmasi → tool tulis tidak dikirim.
	const available = toolsForRole(toolCtx.role).filter((t) => !t.mutates);
	if (available.length === 0) {
		yield {
			type: "error",
			message: "Akun kamu belum punya akses ke fitur ini.",
		};
		return;
	}

	const functionDeclarations: GeminiFunctionDeclaration[] = available.map(
		(t) => ({
			name: t.name,
			description: t.description,
			parameters: t.parameters,
		}),
	);

	// Riwayat dipangkas dari BELAKANG supaya pertanyaan terakhir selalu utuh.
	const trimmed = messages.slice(-MAX_HISTORY_TURNS);
	const contents: GeminiContent[] = trimmed.map((m) => ({
		role: m.role === "user" ? "user" : "model",
		parts: [{ text: m.content }],
	}));

	const systemInstruction = buildSystemPrompt(promptCtx);
	const toolsUsed: string[] = [];

	for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
		const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
		const modelParts: GeminiPart[] = [];
		let sawText = false;

		try {
			for await (const part of streamGemini({
				systemInstruction,
				contents,
				functionDeclarations,
				signal,
			})) {
				if ("text" in part && part.text) {
					sawText = true;
					modelParts.push(part);
					yield { type: "text", value: part.text };
				} else if ("functionCall" in part) {
					const name = part.functionCall.name;
					modelParts.push(part);
					calls.push({ name, args: part.functionCall.args ?? {} });
					yield { type: "tool", name, label: toolLabel(name) };
				}
			}
		} catch (err) {
			yield { type: "error", message: humanizeGeminiError(err) };
			return;
		}

		// Tidak minta tool apa pun → jawabannya sudah final.
		if (calls.length === 0) {
			if (!sawText) {
				yield {
					type: "error",
					message:
						"AI tidak memberi jawaban. Coba tanya ulang dengan kalimat lain.",
				};
				return;
			}
			yield { type: "done", toolsUsed };
			return;
		}

		contents.push({ role: "model", parts: modelParts });

		// Jalankan paralel — tool baca saling bebas.
		const responses = await Promise.all(
			calls.map(async (call): Promise<GeminiPart> => {
				const tool = findTool(toolCtx.role, call.name);
				if (!tool) {
					return {
						functionResponse: {
							name: call.name,
							response: {
								error:
									"Tool tidak tersedia untuk peran ini. Sampaikan ke user bahwa datanya tidak bisa kamu akses.",
							},
						},
					};
				}
				toolsUsed.push(call.name);
				try {
					const result = await tool.run(call.args, toolCtx);
					return {
						functionResponse: {
							name: call.name,
							// Gemini mensyaratkan response berupa objek, bukan array/skalar.
							response: { hasil: result },
						},
					};
				} catch (err) {
					return {
						functionResponse: {
							name: call.name,
							response: {
								error:
									err instanceof Error ? err.message : "Gagal mengambil data",
							},
						},
					};
				}
			}),
		);

		contents.push({ role: "user", parts: responses });
	}

	yield {
		type: "error",
		message:
			"Pertanyaannya terlalu berat — aku kebanyakan bolak-balik ambil data. Coba pecah jadi pertanyaan yang lebih spesifik.",
	};
}
