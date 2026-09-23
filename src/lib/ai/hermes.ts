import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
	type HermesEndpoint,
	type StreamHermesOpts,
	streamHermes as streamHermesRaw,
} from "@/lib/ai/hermes-sse";
import { toolLabel } from "@/lib/ai/registry";
import type { AiStreamEvent } from "@/lib/ai/types";

/**
 * Jalur "Tanya Tetra lewat Hermes": pertanyaan owner dikirim ke agent
 * Hermes di VPS (profil tetra), yang menjawab memakai pengetahuan + memori
 * profilnya dan tool MCP Tetra Ops.
 *
 * URL Hermes TIDAK di env: VPS dijangkau lewat Cloudflare quick tunnel yang
 * alamatnya berubah tiap restart, jadi VPS mendaftarkan alamat terbarunya ke
 * system_config lewat POST /api/hermes/register. Kunci API-nya tetap di env
 * (HERMES_API_KEY) karena itu rahasia, bukan konfigurasi.
 *
 * Kalau apa pun gagal sebelum ada teks keluar, pemanggil (agent.ts) jatuh
 * ke Gemini. Jadi Tanya Tetra tidak pernah mati hanya karena VPS mati.
 */

export const HERMES_URL_CONFIG_KEY = "hermes_api_url";

export async function getHermesEndpoint(
	supabase: SupabaseClient,
): Promise<HermesEndpoint | null> {
	const apiKey = process.env.HERMES_API_KEY?.trim();
	if (!apiKey) return null;
	const { data } = await supabase
		.from("system_config")
		.select("value")
		.eq("key", HERMES_URL_CONFIG_KEY)
		.maybeSingle();
	const baseUrl =
		typeof data?.value === "string"
			? data.value.trim().replace(/\/+$/, "")
			: "";
	if (!/^https:\/\//.test(baseUrl)) return null;
	return {
		baseUrl,
		apiKey,
		model: process.env.HERMES_MODEL?.trim() || "tetra",
	};
}

function labelFor(name: string): string {
	const known = toolLabel(name);
	if (known !== "data internal") return known;
	// Tool bawaan Hermes (web_search, memory, …) — cukup dimanusiakan.
	return name.replace(/_/g, " ");
}

export function streamHermes(
	opts: Omit<StreamHermesOpts, "label">,
): AsyncGenerator<AiStreamEvent> {
	return streamHermesRaw({ ...opts, label: labelFor });
}
