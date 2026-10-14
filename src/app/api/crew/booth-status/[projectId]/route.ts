import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/get-user";
import { fetchBoothEvents } from "@/lib/booth-sync";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Status laptop booth per unit untuk halaman crew (Tetra Assistant, Booth
 * #264). Owner/super_admin, atau crew yang ditugaskan di acara itu. Hanya
 * status alat — tanpa uang/kontak — jadi aman untuk crew.
 */
export async function GET(
	_req: Request,
	ctx: { params: Promise<{ projectId: string }> },
) {
	const me = await getCurrentUser();
	if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	const { projectId } = await ctx.params;

	const admin = createAdminClient();
	const { data: ev } = await admin
		.from("events")
		.select("id")
		.eq("project_id", projectId)
		.maybeSingle();
	if (!ev) return NextResponse.json({ error: "Not found" }, { status: 404 });

	const ownerLevel =
		me.profile.role === "owner" || me.profile.role === "super_admin";
	if (!ownerLevel) {
		const { data: assigned } = await admin
			.from("crew_assignments")
			.select("id")
			.eq("event_id", ev.id)
			.eq("user_id", me.profile.id)
			.maybeSingle();
		if (!assigned)
			return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	}

	const events = await fetchBoothEvents(projectId);
	// null = Booth tidak bisa dihubungi / fitur mati → panel menampilkan pesan.
	if (!events) return NextResponse.json({ available: false, units: [] });
	const units = events
		.map((e) => ({ unit: e.unit ?? 1, booths: e.booths ?? [] }))
		.sort((a, b) => a.unit - b.unit);
	return NextResponse.json({ available: true, units, at: Date.now() });
}
