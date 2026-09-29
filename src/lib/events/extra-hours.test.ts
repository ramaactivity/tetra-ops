import assert from "node:assert/strict";
import { test } from "node:test";
import { durationLabel, extraHoursOf } from "./extra-hours";

const bonus1 = {
	name: "Tambahan Durasi 1 Jam",
	unit: "1 Jam",
	category: "time_extras",
};
const breakTime = {
	name: "Break Time",
	unit: "1 Jam",
	category: "time_extras",
};

test("bonus Tambahan Durasi dihitung, Break Time tidak", () => {
	assert.equal(extraHoursOf([{ quantity: 1, addon: bonus1 }]), 1);
	assert.equal(extraHoursOf([{ quantity: 2, addon: bonus1 }]), 2);
	assert.equal(extraHoursOf([{ quantity: 1, addon: breakTime }]), 0);
	assert.equal(extraHoursOf([]), 0);
});

test("label durasi Ardi & Viqa: 2 jam + bonus 1 = 3", () => {
	assert.equal(durationLabel(2, 1), "2 jam paket + 1 jam bonus (total 3 jam)");
	assert.equal(durationLabel(2, 0), "2 jam");
	assert.equal(durationLabel(null, 1), null);
});
