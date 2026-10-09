import assert from "node:assert/strict";
import { test } from "node:test";
import { VENDOR_DEFAULTS, vendorSettings } from "./vendor-settings";

test("pengaturan vendor: kosong = bawaan, nilai salah tipe diabaikan", () => {
	assert.deepEqual(vendorSettings({}), VENDOR_DEFAULTS);
	assert.deepEqual(vendorSettings(null), VENDOR_DEFAULTS);
	assert.deepEqual(
		vendorSettings({
			portal_enabled: false,
			show_commission: "no",
			partner_level: "prioritas",
		}),
		{ ...VENDOR_DEFAULTS, portal_enabled: false, partner_level: "prioritas" },
	);
	assert.equal(vendorSettings({ partner_level: "x" }).partner_level, "reguler");
});
