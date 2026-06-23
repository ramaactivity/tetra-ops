/**
 * Phase 2 golden test — prove projectEventLinesFromSpec() reproduces the
 * ORIGINAL inline bonus + bundle logic from planRekapDeduction (commit 269eb71)
 * EXACTLY, across a fixture matrix of edge cases.
 *
 * Fixture-based (no DB): production currently has zero event_bonuses and zero
 * package→bundle links, so the only way to exercise these code paths is with
 * controlled fixtures. Both the real helper and a verbatim copy of the original
 * logic run against the same mock client; outputs must be byte-identical.
 *
 * Run:
 *   npx tsx scripts/test-phase2-golden.ts
 */
import { projectEventLinesFromSpec } from "../src/lib/rekap/project-demand";

type Line = {
	item_id: string;
	sku: string;
	name: string;
	qty: number;
	unit_cost: number;
	source_label: string;
	bucket: string;
};

// ── Mock Supabase: returns fixture bonuses for event_bonuses, fixture event
//    (package→bundle) for events. Mirrors the two queries both functions make.
// biome-ignore lint/suspicious/noExplicitAny: test mock
function mockClient(fixtures: { bonuses: any[]; event: any }): any {
	return {
		from(table: string) {
			const result =
				table === "event_bonuses"
					? { data: fixtures.bonuses }
					: { data: fixtures.event };
			const builder: any = {
				select: () => builder,
				eq: () => builder,
				not: () => builder,
				maybeSingle: () => Promise.resolve({ data: fixtures.event }),
				// biome-ignore lint/suspicious/noThenProperty: mock must be awaitable like a PostgREST builder
				then: (onF: any, onR: any) => Promise.resolve(result).then(onF, onR),
			};
			return builder;
		},
	};
}

// ── VERBATIM copy of the ORIGINAL bonus + bundle logic (commit 269eb71). ──────
async function originalBonusBundle(
	// biome-ignore lint/suspicious/noExplicitAny: test mock
	supabase: any,
	eventId: string,
	existingItemIds: Set<string>,
): Promise<Line[]> {
	const lines: Line[] = [];

	const { data: bonusRows } = await supabase
		.from("event_bonuses")
		.select("...")
		.eq("event_id", eventId);

	// biome-ignore lint/suspicious/noExplicitAny: test
	for (const row of (bonusRows ?? []) as any[]) {
		const addon = Array.isArray(row.addon) ? row.addon[0] : row.addon;
		if (!addon) continue;
		const invItem = Array.isArray(addon.inventory_item)
			? addon.inventory_item[0]
			: addon.inventory_item;
		if (!invItem) continue;
		const qty = Number(row.quantity ?? 0);
		if (qty <= 0) continue;
		lines.push({
			item_id: invItem.id,
			sku: invItem.sku,
			name: invItem.name,
			qty,
			unit_cost: Number(invItem.purchase_price_avg ?? 0),
			source_label: `bonus: ${addon.name}`,
			bucket: "bonus",
		});
	}

	const { data: event } = await supabase
		.from("events")
		.select("...")
		.eq("id", eventId)
		.maybeSingle();

	const eventPackage = Array.isArray(event?.package)
		? (event.package ?? [])[0]
		: (event?.package ?? null);
	const bundle = eventPackage
		? Array.isArray(eventPackage.bundle)
			? eventPackage.bundle[0]
			: eventPackage.bundle
		: null;
	if (bundle && bundle.is_active) {
		const existing = new Set<string>(existingItemIds);
		for (const l of lines) existing.add(l.item_id);
		for (const comp of bundle.components ?? []) {
			const compItem = Array.isArray(comp.item) ? comp.item[0] : comp.item;
			if (!compItem) continue;
			if (existing.has(compItem.id)) continue;
			const qty = Number(comp.qty);
			if (!Number.isFinite(qty) || qty <= 0) continue;
			lines.push({
				item_id: compItem.id,
				sku: compItem.sku,
				name: compItem.name,
				qty,
				unit_cost: Number(compItem.purchase_price_avg ?? 0),
				source_label: `bundle: ${bundle.name}`,
				bucket: "other",
			});
			existing.add(compItem.id);
		}
	}
	return lines;
}

const norm = (lines: Line[]) => JSON.stringify(lines);

const inv = (id: string, avg: number | null = 1000) => ({
	id,
	sku: `SKU-${id}`,
	name: `Item ${id}`,
	purchase_price_avg: avg,
});

// ── Fixture matrix ────────────────────────────────────────────────────────
// biome-ignore lint/suspicious/noExplicitAny: fixtures
const FIXTURES: Array<{
	name: string;
	// biome-ignore lint/suspicious/noExplicitAny: fixtures
	bonuses: any[];
	// biome-ignore lint/suspicious/noExplicitAny: fixtures
	event: any;
	existing: string[];
}> = [
	{ name: "empty", bonuses: [], event: { package: null }, existing: [] },
	{
		name: "bonus object embed",
		bonuses: [
			{
				quantity: 2,
				addon: {
					name: "Frame",
					inventory_item_id: "A",
					inventory_item: inv("A"),
				},
			},
		],
		event: { package: null },
		existing: [],
	},
	{
		name: "bonus array embeds (addon+item)",
		bonuses: [
			{
				quantity: 1,
				addon: [
					{ name: "Album", inventory_item_id: "B", inventory_item: [inv("B")] },
				],
			},
		],
		event: { package: null },
		existing: [],
	},
	{
		name: "bonus null inventory_item → skip",
		bonuses: [
			{
				quantity: 3,
				addon: {
					name: "Service",
					inventory_item_id: null,
					inventory_item: null,
				},
			},
		],
		event: { package: null },
		existing: [],
	},
	{
		name: "bonus qty 0 → skip",
		bonuses: [
			{
				quantity: 0,
				addon: { name: "X", inventory_item_id: "C", inventory_item: inv("C") },
			},
		],
		event: { package: null },
		existing: [],
	},
	{
		name: "bundle 2 comps, no existing",
		bonuses: [],
		event: {
			package: {
				bundle_id: "bd1",
				bundle: {
					id: "bd1",
					sku: "BD1",
					name: "Paket A",
					is_active: true,
					components: [
						{ qty: 2, item: inv("P") },
						{ qty: 1, item: inv("Q") },
					],
				},
			},
		},
		existing: [],
	},
	{
		name: "bundle dedup vs existing",
		bonuses: [],
		event: {
			package: {
				bundle_id: "bd1",
				bundle: {
					id: "bd1",
					sku: "BD1",
					name: "Paket A",
					is_active: true,
					components: [
						{ qty: 2, item: inv("P") },
						{ qty: 1, item: inv("Q") },
					],
				},
			},
		},
		existing: ["P"],
	},
	{
		name: "bundle dedup vs bonus just added (same item)",
		bonuses: [
			{
				quantity: 1,
				addon: {
					name: "Frame",
					inventory_item_id: "P",
					inventory_item: inv("P"),
				},
			},
		],
		event: {
			package: {
				bundle_id: "bd1",
				bundle: {
					id: "bd1",
					sku: "BD1",
					name: "Paket A",
					is_active: true,
					components: [
						{ qty: 5, item: inv("P") },
						{ qty: 1, item: inv("R") },
					],
				},
			},
		},
		existing: [],
	},
	{
		name: "bundle inactive → skip",
		bonuses: [],
		event: {
			package: {
				bundle_id: "bd1",
				bundle: {
					id: "bd1",
					sku: "BD1",
					name: "Paket A",
					is_active: false,
					components: [{ qty: 2, item: inv("P") }],
				},
			},
		},
		existing: [],
	},
	{
		name: "bundle comp item as array + invalid qty skip",
		bonuses: [],
		event: {
			package: {
				bundle_id: "bd1",
				bundle: {
					id: "bd1",
					sku: "BD1",
					name: "Paket A",
					is_active: true,
					components: [
						{ qty: 0, item: inv("P") },
						{ qty: "3", item: [inv("S")] },
						{ qty: "abc", item: inv("T") },
					],
				},
			},
		},
		existing: [],
	},
	{
		name: "package as array embed",
		bonuses: [],
		event: {
			package: [
				{
					bundle_id: "bd1",
					bundle: [
						{
							id: "bd1",
							sku: "BD1",
							name: "Paket A",
							is_active: true,
							components: [{ qty: 1, item: inv("U") }],
						},
					],
				},
			],
		},
		existing: [],
	},
	{
		name: "bonus + bundle combined ordering",
		bonuses: [
			{
				quantity: 2,
				addon: {
					name: "Frame",
					inventory_item_id: "A",
					inventory_item: inv("A", 500),
				},
			},
		],
		event: {
			package: {
				bundle_id: "bd1",
				bundle: {
					id: "bd1",
					sku: "BD1",
					name: "Paket A",
					is_active: true,
					components: [{ qty: 1, item: inv("V", 250) }],
				},
			},
		},
		existing: [],
	},
];

async function main() {
	let pass = 0;
	let fail = 0;
	for (const fx of FIXTURES) {
		const client = mockClient({ bonuses: fx.bonuses, event: fx.event });
		const existing = new Set(fx.existing);
		const got = await projectEventLinesFromSpec(client, "evt", existing);
		const want = await originalBonusBundle(client, "evt", new Set(fx.existing));
		if (norm(got) !== norm(want)) {
			fail++;
			console.error(`❌ ${fx.name}`);
			console.error("  helper:  ", norm(got));
			console.error("  original:", norm(want));
		} else {
			pass++;
			console.log(
				`✅ ${fx.name} (${got.length} line${got.length === 1 ? "" : "s"})`,
			);
		}
	}
	console.log(
		`\nGolden test: ${pass} passed, ${fail} failed of ${FIXTURES.length}.`,
	);
	if (fail > 0) process.exit(1);
	console.log(
		"✅ projectEventLinesFromSpec is byte-identical to the original logic.",
	);
}

main().catch((e) => {
	console.error("❌ crashed:", e);
	process.exit(1);
});
