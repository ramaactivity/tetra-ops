import { CsvImportWizard } from "@/components/csv-import/wizard";
import {
	checkItemDuplicates,
	commitItemImport,
} from "@/lib/actions/items-import";
import { ITEM_HEADER_ALIASES } from "@/lib/csv-import/items-aliases";
import type { TargetField } from "@/lib/csv-import/types";

const ITEM_TARGET_FIELDS: TargetField[] = [
	{ key: "sku", label: "SKU", required: true },
	{ key: "name", label: "Name", required: true },
	{
		key: "category",
		label: "Category",
		required: true,
		description: "consumable / equipment",
	},
	{ key: "unit", label: "Unit", description: "pcs, box, dll" },
	{ key: "min_stock_alert", label: "Min stock alert" },
	{ key: "purchase_price_avg", label: "Purchase price (avg)" },
	{ key: "purchase_price", label: "Purchase price (latest)" },
	{ key: "useful_life_months", label: "Useful life (months)" },
	{ key: "notes", label: "Notes" },
	{ key: "is_active", label: "Is active" },
];

const SAMPLE_ITEM_CSV = `sku,name,category,unit,min_stock_alert,purchase_price_avg,is_active
ITM-SLEEVE-2R,Sleeve 2R,consumable,Pcs,1000,500,TRUE
ITM-PCS-4R,Media Set (4R/2R),consumable,Pcs,700,941,TRUE
EQ-MONITOR,Monitor,equipment,unit,0,0,TRUE`;

export default function ItemsImportPage() {
	return (
		<div className="max-w-4xl">
			<CsvImportWizard
				config={{
					title: "Bulk Import Items",
					description:
						"Upload CSV inventory items dari Google Sheets / Excel. SKU yang sudah ada akan di-update; SKU baru di-insert.",
					primaryKeyField: "sku",
					primaryKeyLabel: "SKU",
					duplicateStrategy: "update",
					targetFields: ITEM_TARGET_FIELDS,
					headerAliases: ITEM_HEADER_ALIASES,
					checkDuplicates: checkItemDuplicates,
					commit: commitItemImport,
					backHref: "/warehouse",
					backLabel: "Items",
					sampleCsv: SAMPLE_ITEM_CSV,
				}}
			/>
		</div>
	);
}
