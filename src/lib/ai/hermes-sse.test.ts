import assert from "node:assert/strict";
import { test } from "node:test";
import {
	hermesFrameToEvents,
	parseSse,
	stripHermesToolPrefix,
} from "./hermes-sse";

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
	const enc = new TextEncoder();
	return new ReadableStream({
		start(c) {
			for (const ch of chunks) c.enqueue(enc.encode(ch));
			c.close();
		},
	});
}

test("parseSse: frame terpotong antar chunk, komentar keepalive, CRLF", async () => {
	const frames = [];
	for await (const f of parseSse(
		streamOf([
			'event: hermes.tool.progress\ndata: {"tool":"mcp__tetra_ops__stok","status":"running"}\n\n',
			": keepalive\n\n",
			'data: {"choices":[{"delta":{"content":"Ha"}}]}\r\n\r\ndata: {"choi',
			'ces":[{"delta":{"content":"lo"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
		]),
	)) {
		frames.push(f);
	}
	assert.equal(frames.length, 4);
	assert.equal(frames[0].event, "hermes.tool.progress");
	assert.equal(frames[1].event, "message");
	assert.equal(frames[3].data, "[DONE]");
});

test("hermesFrameToEvents: tool progress, teks, finish_reason", () => {
	const label = (n: string) => `L:${n}`;
	assert.deepEqual(
		hermesFrameToEvents(
			{
				event: "hermes.tool.progress",
				data: '{"tool":"mcp__tetra_ops__cari_event","status":"running"}',
			},
			label,
		),
		{ events: [{ type: "tool", name: "cari_event", label: "L:cari_event" }] },
	);
	assert.deepEqual(
		hermesFrameToEvents(
			{ event: "hermes.tool.progress", data: '{"tool":"x","status":"done"}' },
			label,
		),
		{ events: [] },
	);
	assert.deepEqual(
		hermesFrameToEvents(
			{
				event: "message",
				data: '{"choices":[{"delta":{"content":"hai"},"finish_reason":"length"}]}',
			},
			label,
		),
		{ events: [{ type: "text", value: "hai" }], finishReason: "length" },
	);
	assert.deepEqual(
		hermesFrameToEvents({ event: "message", data: "[DONE]" }, label),
		{
			events: [],
		},
	);
	assert.deepEqual(
		hermesFrameToEvents({ event: "message", data: "bukan json" }, label),
		{
			events: [],
		},
	);
	assert.equal(stripHermesToolPrefix("web_search"), "web_search");
});
