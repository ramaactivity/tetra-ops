import assert from "node:assert/strict";
import { test } from "node:test";
import { nameFromFile } from "./template-name";

test("nama template dari nama file", () => {
	assert.equal(nameFromFile("floral-gold_4R.png"), "Floral Gold");
	assert.equal(nameFromFile("Wedding Rustic 2R strip.png"), "Wedding Rustic");
	assert.equal(nameFromFile("graduation_1200x1800 (2).png"), "Graduation");
	assert.equal(nameFromFile("Polaroid.png"), "Template");
	assert.equal(nameFromFile("BIPO x Tetra.PNG"), "BIPO x Tetra");
});
