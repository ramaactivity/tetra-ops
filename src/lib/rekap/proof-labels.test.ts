import assert from "node:assert/strict";
import { test } from "node:test";
import {
	guessProofLabel,
	PROOF_LABEL_RE,
	toggleProofPart,
} from "./proof-labels";

test("label bukti gabungan: fee + bonus dalam satu transfer", () => {
	assert.equal(toggleProofPart("fee", "bonus"), "fee+bonus");
	assert.equal(
		toggleProofPart("bonus+fee", "reimbursement"),
		"fee+bonus+reimbursement",
	);
	assert.equal(toggleProofPart("fee+bonus", "fee"), "bonus");
	assert.equal(toggleProofPart("fee", "fee"), "");
	// Bukti pertama menebak semua yang dibayar; bukti berikutnya sisanya.
	assert.equal(
		guessProofLabel([], { bonus: true, reimbursement: false }),
		"fee+bonus",
	);
	assert.equal(
		guessProofLabel(["fee"], { bonus: true, reimbursement: true }),
		"bonus+reimbursement",
	);
	assert.ok(PROOF_LABEL_RE.test("fee+bonus") && PROOF_LABEL_RE.test(""));
	assert.ok(!PROOF_LABEL_RE.test("fee+") && !PROOF_LABEL_RE.test("hadiah"));
});
