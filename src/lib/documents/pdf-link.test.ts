import assert from "node:assert/strict";
import { test } from "node:test";
import { signedPdfQuery, verifyPdfSignature } from "./pdf-link";

test("link PDF bertanda tangan: sah, kedaluwarsa, dan tidak bisa dipindah ke dokumen lain", () => {
	const now = 1_800_000_000_000;
	const q = new URLSearchParams(
		signedPdfQuery("doc-a", 600, "rahasia", now) ?? "",
	);
	const exp = q.get("exp");
	const sig = q.get("sig");
	assert.ok(verifyPdfSignature("doc-a", exp, sig, "rahasia", now));
	assert.ok(!verifyPdfSignature("doc-b", exp, sig, "rahasia", now));
	assert.ok(!verifyPdfSignature("doc-a", exp, sig, "kunci-lain", now));
	assert.ok(!verifyPdfSignature("doc-a", exp, sig, "rahasia", now + 601_000));
	assert.ok(
		!verifyPdfSignature(
			"doc-a",
			String(Number(exp) + 999),
			sig,
			"rahasia",
			now,
		),
	);
	assert.equal(signedPdfQuery("doc-a", 600, undefined, now), null);
	assert.ok(!verifyPdfSignature("doc-a", exp, sig, undefined, now));
});
