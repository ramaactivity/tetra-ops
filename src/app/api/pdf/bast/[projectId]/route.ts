import { renderToBuffer } from "@react-pdf/renderer";
import { NextResponse } from "next/server";
import { BastDocument } from "@/components/pdf/bast-document";
import { getCurrentUser } from "@/lib/auth/get-user";
import { buildDeliverables, fetchEventForPdf } from "@/lib/pdf/event-data";

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

	const docNumber = `BAST-${ev.project_id.replace("PRJ-", "")}`;
	const buffer = await renderToBuffer(
		BastDocument({
			data: {
				docNumber,
				issuedAt: new Date().toISOString().slice(0, 10),
				client: {
					name: ev.client_name,
					picName: ev.pic_contact?.name ?? ev.pic_name,
					picPosition: null,
				},
				event: {
					projectId: ev.project_id,
					date: ev.event_date,
					setupTime: ev.setup_time,
					startTime: ev.start_time,
					endTime: ev.end_time,
					sessionSegments: ev.session_segments,
					venueName: ev.venue_name,
					venueAddress: ev.venue_address,
					packageName: ev.package_name ?? ev.custom_package_name,
					frameSize: ev.frame_size,
				},
				deliverables: buildDeliverables(ev),
				crewLead: ev.crew_lead
					? {
							fullName: ev.crew_lead.full_name,
							role: ev.crew_lead.role,
						}
					: null,
			},
		}),
	);

	const filename = `BAST-${ev.project_id}-${ev.client_name.replace(/[^\w-]+/g, "_")}.pdf`;
	return new Response(new Uint8Array(buffer), {
		headers: {
			"Content-Type": "application/pdf",
			"Content-Disposition": `inline; filename="${filename}"`,
			"Cache-Control": "private, max-age=60",
		},
	});
}
