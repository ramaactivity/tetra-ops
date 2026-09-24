import {
	DocumentEditor,
	type EditorDoc,
} from "@/components/documents/document-editor";
import { Container } from "@/components/layout/container";
import { loadEditorData } from "@/lib/documents/editor-data";
import { addDays, defaultTerms } from "@/lib/documents/types";

export const dynamic = "force-dynamic";

/** Quotation baru, atau invoice DP yang belum punya event (?type=invoice). */
export default async function NewDocumentPage({
	searchParams,
}: {
	searchParams: Promise<{ type?: string }>;
}) {
	// ?type=invoice → invoice DP yang belum punya event (ditautkan saat DP masuk).
	const isInvoice = (await searchParams).type === "invoice";
	const { packages, addons, signers, grossupRate, venues } =
		await loadEditorData();
	const signer = signers.find((s) => s.is_default) ?? signers[0] ?? null;
	const today = new Date().toISOString().slice(0, 10);

	const initial: EditorDoc = {
		doc_type: isInvoice ? "invoice" : "quotation",
		status: "draft",
		client: { name: "", org: "", phone: "", email: "", address: "" },
		event_info: { date: "", time: "", venue: "", city: "" },
		items: [],
		discount: 0,
		gross_up_enabled: false,
		gross_up_rate: grossupRate,
		notes: "",
		terms: defaultTerms(isInvoice ? "invoice" : "quotation", false),
		signer_id: signer?.id ?? null,
		signer_name: signer?.name ?? "",
		signer_position: signer?.position ?? "",
		issued_at: today,
		valid_until: isInvoice ? null : addDays(today, 7),
		due_date: null,
	};

	return (
		<Container size="xl" className="space-y-3 pb-6">
			<DocumentEditor
				initial={initial}
				packages={packages}
				addons={addons}
				signers={signers}
				venues={venues}
				grossupRate={grossupRate}
				linkedEvent={null}
			/>
		</Container>
	);
}
