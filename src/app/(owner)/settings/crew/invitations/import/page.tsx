import { redirect } from "next/navigation";
import { CsvImportWizard } from "@/components/csv-import/wizard";
import {
	checkInvitationDuplicates,
	commitInvitationImport,
} from "@/lib/actions/crew-invitations";
import { INVITATION_HEADER_ALIASES } from "@/lib/csv-import/invitations-aliases";
import type { TargetField } from "@/lib/csv-import/types";
import { getCurrentUser } from "@/lib/auth/get-user";

const TARGET_FIELDS: TargetField[] = [
	{ key: "email", label: "Email (Gmail)", required: true },
	{ key: "full_name", label: "Full name", required: true },
	{ key: "tier", label: "Tier (senior / junior)", required: true },
	{ key: "nickname", label: "Nickname" },
	{ key: "phone_wa", label: "Phone / WA" },
	{ key: "default_fee_override", label: "Default fee override" },
	{ key: "notes", label: "Notes" },
];

const SAMPLE_CSV = `email,full_name,nickname,phone_wa,tier,notes
aminah@gmail.com,Aminah Salsabila,Aminah,+6281234567890,senior,
ceca@gmail.com,Ceca Pratama,Ceca,,junior,Standby Bogor area
bona@gmail.com,Bona Maulana,,,junior,`;

export default async function ImportInvitationsPage() {
	const me = await getCurrentUser();
	if (!me) redirect("/login");
	if (me.profile.role !== "super_admin") redirect("/settings/crew");

	return (
		<div className="max-w-4xl">
			<CsvImportWizard
				config={{
					title: "Bulk Invite Crew",
					description:
						"Upload CSV crew yang mau diundang. Saat mereka login pakai Gmail yang ke-list, otomatis di-promote ke crew dengan tier yang lo set — skip review approval.",
					primaryKeyField: "email",
					primaryKeyLabel: "Email",
					duplicateStrategy: "skip",
					targetFields: TARGET_FIELDS,
					headerAliases: INVITATION_HEADER_ALIASES,
					checkDuplicates: checkInvitationDuplicates,
					commit: commitInvitationImport,
					backHref: "/settings/crew",
					backLabel: "Master Crew",
					sampleCsv: SAMPLE_CSV,
				}}
			/>
		</div>
	);
}
