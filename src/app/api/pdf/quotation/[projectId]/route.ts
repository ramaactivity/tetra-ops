import { renderToBuffer } from "@react-pdf/renderer";
import { NextResponse } from "next/server";
import { QuotationDocument } from "@/components/pdf/quotation-document";
import { getCurrentUser } from "@/lib/auth/get-user";
import { buildLineItems, fetchEventForPdf } from "@/lib/pdf/event-data";

export async function GET(
	_request: Request,
	{ params }: { params: Promise<{ projectId: string }> },
) {
	const me = await getCurrentUser();
	if (
		!me ||
		(me.profile.role !== "super_admin" && me.profile.role !== "owner")
	) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const { projectId } = await params;
	const ev = await fetchEventForPdf(projectId);
	if (!ev) {
		return NextResponse.json({ error: "Event not found" }, { status: 404 });
	}

	const docNumber = `QTN-${ev.project_id.replace("PRJ-", "")}`;
	const dpRequired = Math.round(ev.grand_total * 0.3); // 30% default DP
	const validUntilDate = new Date();
	validUntilDate.setDate(validUntilDate.getDate() + 14); // 14-day validity
	const validUntil = validUntilDate.toISOString().slice(0, 10);

	const buffer = await renderToBuffer(
		QuotationDocument({
			data: {
				docNumber,
				issuedAt: new Date().toISOString().slice(0, 10),
				validUntil,
				client: {
					name: ev.client_name,
					wa: ev.client_wa,
					email: ev.client_email,
				},
				event: {
					projectId: ev.project_id,
					date: ev.event_date,
					setupTime: ev.setup_time,
					startTime: ev.start_time,
					endTime: ev.end_time,
					venueName: ev.venue_name,
				},
				lineItems: buildLineItems(ev),
				discount: ev.discount_amount,
				grossUp: ev.gross_up_pph_amount,
				grandTotal: ev.grand_total,
				dpRequired,
				bankAccount: ev.bank_account
					? {
							bankName: ev.bank_account.bank_name,
							accountName:
								ev.bank_account.account_holder ?? ev.bank_account.account_name,
							accountNumber: ev.bank_account.account_number,
						}
					: null,
			},
		}),
	);

	const filename = `Quotation-${ev.project_id}-${ev.client_name.replace(/[^\w-]+/g, "_")}.pdf`;
	return new Response(new Uint8Array(buffer), {
		headers: {
			"Content-Type": "application/pdf",
			"Content-Disposition": `inline; filename="${filename}"`,
			"Cache-Control": "private, max-age=60",
		},
	});
}
