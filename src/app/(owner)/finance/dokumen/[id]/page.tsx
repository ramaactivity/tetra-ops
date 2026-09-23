import { notFound } from "next/navigation";
import {
	DocumentEditor,
	type EditorDoc,
	type LinkedEvent,
} from "@/components/documents/document-editor";
import { DocumentViewer } from "@/components/documents/document-viewer";
import { InvoicePaymentsPanel } from "@/components/documents/invoice-payments-panel";
import { Container } from "@/components/layout/container";
import { TopbarEntityPortal } from "@/components/layouts/topbar-entity-portal";
import { loadEditorData } from "@/lib/documents/editor-data";
import {
	discountFromEvent,
	itemsFromEvent,
	loadDocument,
	loadEventForPdfById,
} from "@/lib/documents/load";
import { formatPhoneLocal } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function DocumentPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	const doc = await loadDocument(id);
	if (!doc) notFound();

	const supabase = await createClient();
	const ev = doc.event_id
		? await loadEventForPdfById(supabase, doc.event_id)
		: null;

	// Kuitansi / Nota Lunas / BAST = potret saat terbit — tidak diedit.
	if (doc.doc_type !== "quotation" && doc.doc_type !== "invoice") {
		return (
			<Container size="lg" className="space-y-3 pb-6">
				<TopbarEntityPortal name={doc.doc_number} />
				<DocumentViewer doc={doc} eventProjectId={ev?.project_id ?? null} />
			</Container>
		);
	}

	const { packages, addons, signers, grossupRate, venues } =
		await loadEditorData();

	const initial: EditorDoc = {
		id: doc.id,
		doc_number: doc.doc_number,
		doc_type: doc.doc_type,
		status: doc.status,
		event_id: doc.event_id,
		source_document_id: doc.source_document_id,
		client: {
			name: doc.client.name ?? "",
			org: doc.client.org ?? "",
			// Dokumen lama menyimpan nomor tanpa 0 di depan — rapikan saat dimuat.
			phone: doc.client.phone ? formatPhoneLocal(doc.client.phone) : "",
			email: doc.client.email ?? "",
			address: doc.client.address ?? "",
		},
		event_info: {
			date: doc.event_info.date ?? "",
			time: doc.event_info.time ?? "",
			venue: doc.event_info.venue ?? "",
			city: doc.event_info.city ?? "",
		},
		items: doc.items,
		discount: doc.discount,
		gross_up_enabled: doc.gross_up_enabled,
		gross_up_rate: Number(doc.gross_up_rate),
		notes: doc.notes ?? "",
		terms: doc.terms ?? "",
		signer_id: doc.signer_id,
		signer_name: doc.signer_name ?? "",
		signer_position: doc.signer_position ?? "",
		issued_at: doc.issued_at,
		due_date: doc.due_date,
		valid_until: doc.valid_until,
	};

	const linkedEvent: LinkedEvent | null = ev
		? {
				id: ev.id,
				project_id: ev.project_id,
				client_name: ev.client_name,
				event_date: ev.event_date,
				venue_name: ev.venue_name,
				billable_total: ev.billable_total,
				total_paid: ev.total_paid,
				remaining_balance: ev.remaining_balance,
				payment_status: "",
				fromEvent: {
					items: itemsFromEvent(ev),
					discount: discountFromEvent(ev),
					gross_up_enabled: ev.gross_up_pph_amount > 0,
				},
			}
		: null;

	return (
		<Container size="xl" className="space-y-3 pb-6">
			<TopbarEntityPortal name={doc.doc_number} />
			<DocumentEditor
				initial={initial}
				packages={packages}
				addons={addons}
				signers={signers}
				venues={venues}
				grossupRate={grossupRate}
				linkedEvent={linkedEvent}
				paymentsPanel={
					doc.doc_type === "invoice" && doc.event_id ? (
						<InvoicePaymentsPanel eventId={doc.event_id} />
					) : null
				}
			/>
		</Container>
	);
}
