import { CsvImportWizard } from "@/components/csv-import/wizard";
import {
	checkContactDuplicates,
	commitContactImport,
} from "@/lib/actions/contacts-import";
import { CONTACT_HEADER_ALIASES } from "@/lib/csv-import/contacts-aliases";
import type { TargetField } from "@/lib/csv-import/types";

const CONTACT_TARGET_FIELDS: TargetField[] = [
	{ key: "legacy_contact_id", label: "Contact ID (CT-XXX)" },
	{ key: "name", label: "Name", required: true },
	{ key: "type", label: "Type (booker / client / pic_event / vendor)" },
	{ key: "phone", label: "Phone / WA" },
	{ key: "email", label: "Email" },
	{ key: "notes", label: "Notes" },
];

const SAMPLE_CONTACT_CSV = `Contact_ID,Type,Name,Phone,Email,Notes
CT-87126,Booker,Vita & Ary,82133200110,,
CT-85390,PIC Event,Sonia,8176745266,,PIC di Lapangan
CT-29088,Booker,Rama & Aca,87854631128,,Booker`;

export default function ContactsImportPage() {
	return (
		<div className="max-w-4xl">
			<CsvImportWizard
				config={{
					title: "Bulk Import Contacts",
					description:
						"Upload DB_CONTACTS CSV. Contact_ID legacy (CT-XXX) di-preserve buat back-reference dari DB_PROJECTS. Existing CT-ID akan di-update; baru di-insert.",
					primaryKeyField: "legacy_contact_id",
					primaryKeyLabel: "Contact ID",
					duplicateStrategy: "update",
					targetFields: CONTACT_TARGET_FIELDS,
					headerAliases: CONTACT_HEADER_ALIASES,
					checkDuplicates: checkContactDuplicates,
					commit: commitContactImport,
					backHref: "/settings/contacts",
					backLabel: "Contacts",
					sampleCsv: SAMPLE_CONTACT_CSV,
				}}
			/>
		</div>
	);
}
