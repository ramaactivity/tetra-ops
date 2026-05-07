import { redirect } from "next/navigation";
import { CsvImportWizard } from "@/components/csv-import/wizard";
import {
	checkProjectDuplicates,
	commitProjectImport,
} from "@/lib/actions/projects-import";
import { getCurrentUser } from "@/lib/auth/get-user";
import { PROJECT_HEADER_ALIASES } from "@/lib/csv-import/projects-aliases";
import type { TargetField } from "@/lib/csv-import/types";

const PROJECT_TARGET_FIELDS: TargetField[] = [
	{ key: "project_id", label: "Project ID", required: true },
	{ key: "invoice_number", label: "Invoice Number" },
	{ key: "client_name", label: "Client / Event Name", required: true },
	{ key: "event_type", label: "Event Type" },
	{ key: "event_date", label: "Event Date", required: true },
	{ key: "setup_time", label: "Setup Time" },
	{ key: "start_time", label: "Start Time" },
	{ key: "end_time", label: "End Time" },
	{ key: "sleeve_type", label: "Sleeve Type (2R/4R/PR)" },
	{ key: "package_name", label: "Package Name" },
	{ key: "base_price", label: "Base Price" },
	{ key: "background_type", label: "Background Type" },
	{ key: "include_flashdisk", label: "Include Flashdisk" },
	{ key: "payment_status", label: "Payment Status" },
	{ key: "payment_due_date", label: "Payment Due Date" },
	{ key: "balance_due", label: "Balance Due" },
	{ key: "paid", label: "Paid" },
	{ key: "discount", label: "Discount" },
	{ key: "gross_up", label: "Gross Up" },
	{ key: "tax", label: "Tax" },
	{ key: "total_price", label: "Total Price", required: true },
	{ key: "crew_a", label: "Crew Lead" },
	{ key: "crew_b", label: "Crew Asisten" },
	{ key: "venue", label: "Venue" },
	{ key: "city", label: "City" },
	{ key: "maps_url", label: "Location Maps URL" },
	{ key: "channel", label: "Channel Code" },
	{ key: "design_status", label: "Design Status" },
	{ key: "design_link", label: "Design Link" },
	{ key: "status_project", label: "Status Project" },
	{ key: "notes", label: "Notes" },
];

const SAMPLE_PROJECT_CSV = `Project_Id,Invoice_Number,Client_or_Event_Name,EventType,EventDate,Setup_Time,StartTime,EndTime,Sleeve_Type,Package_Name,Base_Price_Rp,Background_Type,Include_Flashdisk,Payment_Status,Payment_Due_Date,Balance_Due,Paid,Discount,Gross_Up,Total_Price,Crew_Assigned_A,Crew_Assigned_B,Venue,City,Location_Maps_URL,Channel_Code,Design_Status,Design_Link,Status_Project,Notes
PRJ-20240615-1001,INV-2024-0042,Wedding Aldi & Nadia,Wedding,06/15/2024,14:00,18:00,22:00,2R,2R Unlimited 4 Jam,2800000,Tetra Gold,TRUE,Lunas,06/13/2024,0,2800000,0,0,2800000,Acuy,Iqbal,Hotel Salak,Bogor,,Direct,Desain ACC,,Done,
PRJ-20260601-2002,INV-2026-0007,Birthday Mira,Birthday,06/01/2026,15:00,19:00,22:00,2R,2R Unlimited 3 Jam,2600000,Tetra Silver,TRUE,DP,05/28/2026,2100000,500000,0,0,2600000,Fahmi,Mou,Pondok Indah,Jakarta,,Direct,Brief Masuk,,Upcoming,`;

export default async function ImportProjectsPage() {
	const me = await getCurrentUser();
	if (!me) redirect("/login");
	if (me.profile.role !== "super_admin") redirect("/operations");

	return (
		<div className="max-w-5xl">
			<CsvImportWizard
				config={{
					title: "Import Projects from Phase-2",
					description:
						"Upload DB_PROJECTS CSV dari Apps Script v1. Past events arsip read-only (no payments/settlement), future events go live dengan DP dipertahankan. Duplicate project_id otomatis di-skip.",
					primaryKeyField: "project_id",
					primaryKeyLabel: "Project ID",
					duplicateStrategy: "skip",
					targetFields: PROJECT_TARGET_FIELDS,
					headerAliases: PROJECT_HEADER_ALIASES,
					checkDuplicates: checkProjectDuplicates,
					commit: commitProjectImport,
					backHref: "/operations",
					backLabel: "Operations",
					sampleCsv: SAMPLE_PROJECT_CSV,
				}}
			/>
		</div>
	);
}
