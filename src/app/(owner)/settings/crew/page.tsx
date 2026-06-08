import { Clock, FileSpreadsheet, Mail } from "lucide-react";
import Link from "next/link";
import { SectionHeader } from "@/components/layout/section-header";
import { EditCrewDrawer } from "@/components/crew/edit-crew-drawer";
import { InvitationDeleteButton } from "@/components/crew/invitation-row-actions";
import { InviteCrewForm } from "@/components/crew/invite-form";
import { CrewRoleMenu } from "@/components/crew/role-menu";
import {
	type InvestorRow,
	InvestorShareTable,
} from "@/components/investors/share-table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { getCurrentUser } from "@/lib/auth/get-user";
import { formatDateID, USER_ROLE_LABELS } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

type InvitationRow = {
	id: string;
	email: string;
	full_name: string;
	nickname: string | null;
	phone_wa: string | null;
	tier: "senior" | "junior";
	notes: string | null;
	invited_at: string;
};

type Role = "super_admin" | "owner" | "crew" | "pending_approval";

type UserRow = {
	id: string;
	email: string;
	full_name: string;
	nickname: string | null;
	phone_wa: string | null;
	role: Role;
	tier: "senior" | "junior" | null;
	default_fee_override: number | null;
	notes: string | null;
	is_active: boolean;
	joined_date: string;
	share_pct: number | null;
	capital_contributed: number | null;
	capital_contributed_at: string | null;
};

const ROLE_BADGE_VARIANT: Record<string, "default" | "secondary" | "outline"> =
	{
		super_admin: "default",
		owner: "default",
		crew: "secondary",
		pending_approval: "outline",
	};

function initialsOf(name: string) {
	return name
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((part) => part[0])
		.join("")
		.toUpperCase();
}

export default async function MasterCrewPage() {
	const me = await getCurrentUser();
	const supabase = await createClient();
	const [
		{ data, error },
		{ data: invitationData, error: invitationError },
	] = await Promise.all([
		supabase
			.from("users")
			.select(
				"id, email, full_name, nickname, phone_wa, role, tier, default_fee_override, notes, is_active, joined_date, share_pct, capital_contributed, capital_contributed_at",
			)
			.is("deleted_at", null)
			.order("role", { ascending: true })
			.order("joined_date", { ascending: false }),
		supabase
			.from("crew_invitations")
			.select(
				"id, email, full_name, nickname, phone_wa, tier, notes, invited_at",
			)
			.is("accepted_at", null)
			.order("invited_at", { ascending: false }),
	]);

	if (error) {
		return (
			<div className="border-destructive bg-destructive/10 rounded-md border p-4">
				<p className="text-destructive text-sm font-medium">
					Gagal memuat users: {error.message}
				</p>
			</div>
		);
	}

	// Don't fail the whole page if invitations query errors (e.g., migration
	// not applied yet). Surface a non-fatal warning instead so the page is
	// still usable for managing existing users.
	const users = (data ?? []) as UserRow[];
	const invitations = (invitationData ?? []) as InvitationRow[];
	const invitationsErrorMessage = invitationError?.message ?? null;
	const pendingCount = users.filter(
		(u) => u.role === "pending_approval",
	).length;
	const isSuperAdmin = me?.profile.role === "super_admin";

	// Investors = role 'owner' only; super_admin is admin-only, not an investor.
	const investors = users
		.filter((u) => u.role === "owner")
		.filter((u) => u.is_active)
		.map<InvestorRow>((u) => ({
			id: u.id,
			full_name: u.full_name,
			role: u.role,
			share_pct: u.share_pct,
			capital_contributed: u.capital_contributed,
			capital_contributed_at: u.capital_contributed_at,
		}));

	return (
		<div className="space-y-6">
			<SectionHeader
				as="h2"
				title="Master Crew"
				description={
					<>
						{users.length} terdaftar
						{pendingCount > 0 && (
							<>
								{" · "}
								<span className="text-primary font-medium">
									{pendingCount} pending approval
								</span>
							</>
						)}
						{invitations.length > 0 && (
							<>
								{" · "}
								<span className="text-amber-700 dark:text-amber-400 font-medium">
									{invitations.length} undangan menunggu
								</span>
							</>
						)}
					</>
				}
				actions={
					isSuperAdmin ? (
						<>
							<Link
								href="/settings/crew/invitations/import"
								className={buttonVariants({ variant: "outline" })}
							>
								<FileSpreadsheet className="size-4" />
								Bulk import
							</Link>
							<InviteCrewForm />
						</>
					) : undefined
				}
			/>

			{isSuperAdmin && invitationsErrorMessage && (
				<div className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 rounded-md border p-3">
					<p className="text-amber-900 dark:text-amber-200 text-xs font-medium">
						⚠ Tabel <code className="font-mono">crew_invitations</code> belum
						bisa dibaca: {invitationsErrorMessage}.
					</p>
					<p className="text-amber-800/80 dark:text-amber-300/80 mt-1 text-xs">
						Pastikan migration{" "}
						<code className="font-mono">
							supabase/migrations/20260507_crew_invitations.sql
						</code>{" "}
						sudah di-paste ke Supabase Dashboard → SQL Editor.
					</p>
				</div>
			)}

			{isSuperAdmin && invitations.length > 0 && (
				<section className="border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20 space-y-3 rounded-lg border p-4">
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-2">
							<Clock className="text-amber-700 dark:text-amber-400 h-4 w-4" />
							<h3 className="text-sm font-semibold">
								Undangan menunggu ({invitations.length})
							</h3>
						</div>
						<p className="text-muted-foreground text-xs">
							Dia akan auto-promote ke crew + tier saat login pakai Gmail di
							bawah ini.
						</p>
					</div>
					<div className="border-border-default bg-surface-2 overflow-x-auto rounded-lg border">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Person</TableHead>
									<TableHead>Email (Gmail)</TableHead>
									<TableHead>Tier</TableHead>
									<TableHead>WA</TableHead>
									<TableHead>Diundang</TableHead>
									<TableHead className="text-right">Actions</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{invitations.map((inv) => (
									<TableRow key={inv.id}>
										<TableCell>
											<div className="space-y-0.5">
												<p className="text-foreground text-sm font-medium">
													{inv.full_name}
												</p>
												{inv.nickname && (
													<p className="text-muted-foreground text-xs">
														{inv.nickname}
													</p>
												)}
											</div>
										</TableCell>
										<TableCell className="text-muted-foreground inline-flex items-center gap-1 text-sm">
											<Mail className="h-3 w-3" />
											{inv.email}
										</TableCell>
										<TableCell>
											<Badge
												variant="outline"
												className="text-[11px] uppercase"
											>
												{inv.tier}
											</Badge>
										</TableCell>
										<TableCell className="tabular text-muted-foreground text-sm">
											{inv.phone_wa ?? "—"}
										</TableCell>
										<TableCell className="tabular text-muted-foreground text-xs">
											{formatDateID(inv.invited_at.slice(0, 10))}
										</TableCell>
										<TableCell className="text-right">
											<InvitationDeleteButton id={inv.id} email={inv.email} />
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</div>
				</section>
			)}

			<div className="border-border-default bg-surface-2 overflow-x-auto rounded-lg border">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Person</TableHead>
							<TableHead>Email</TableHead>
							<TableHead>WA</TableHead>
							<TableHead>Role</TableHead>
							<TableHead>Tier</TableHead>
							<TableHead>Joined</TableHead>
							<TableHead>Status</TableHead>
							{isSuperAdmin && (
								<TableHead className="text-right">Actions</TableHead>
							)}
						</TableRow>
					</TableHeader>
					<TableBody>
						{users.map((u) => (
							<TableRow key={u.id}>
								<TableCell>
									<div className="flex items-center gap-3">
										<Avatar className="h-8 w-8">
											<AvatarFallback className="bg-muted text-muted-foreground text-xs font-medium">
												{initialsOf(u.full_name)}
											</AvatarFallback>
										</Avatar>
										<div className="min-w-0">
											<div className="truncate text-sm font-medium">
												{u.full_name}
											</div>
											{u.nickname && (
												<div className="text-muted-foreground truncate text-xs">
													{u.nickname}
												</div>
											)}
										</div>
									</div>
								</TableCell>
								<TableCell className="text-muted-foreground truncate text-sm">
									{u.email}
								</TableCell>
								<TableCell className="tabular text-muted-foreground text-sm">
									{u.phone_wa ?? "—"}
								</TableCell>
								<TableCell>
									<Badge variant={ROLE_BADGE_VARIANT[u.role] ?? "outline"}>
										{USER_ROLE_LABELS[u.role] ?? u.role}
									</Badge>
								</TableCell>
								<TableCell className="text-muted-foreground text-sm">
									{u.tier ? u.tier : "—"}
								</TableCell>
								<TableCell className="tabular text-muted-foreground text-sm">
									{formatDateID(u.joined_date)}
								</TableCell>
								<TableCell>
									{u.is_active ? (
										<Badge variant="default">Active</Badge>
									) : (
										<Badge variant="secondary">Inactive</Badge>
									)}
								</TableCell>
								{isSuperAdmin && (
									<TableCell className="text-right">
										<div className="inline-flex items-center gap-1.5">
											<CrewRoleMenu
												userId={u.id}
												userName={u.full_name}
												currentRole={u.role}
												currentTier={u.tier}
												disabled={u.id === me?.authId}
											/>
											<EditCrewDrawer
												user={{
													id: u.id,
													full_name: u.full_name,
													nickname: u.nickname,
													phone_wa: u.phone_wa,
													role: u.role,
													default_fee_override: u.default_fee_override,
													notes: u.notes,
													is_active: u.is_active,
												}}
												disabled={u.id === me?.authId}
											/>
										</div>
									</TableCell>
								)}
							</TableRow>
						))}
					</TableBody>
				</Table>
			</div>

			<div className="border-border-default bg-surface-2 space-y-4 rounded-lg border p-5">
				<InvestorShareTable rows={investors} canEdit={isSuperAdmin} />
			</div>
		</div>
	);
}
