import { CrewRoleMenu } from "@/components/crew/role-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
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

type Role = "super_admin" | "owner" | "crew" | "pending_approval";

type UserRow = {
	id: string;
	email: string;
	full_name: string;
	nickname: string | null;
	phone_wa: string | null;
	role: Role;
	tier: "senior" | "junior" | null;
	is_active: boolean;
	joined_date: string;
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
	const { data, error } = await supabase
		.from("users")
		.select(
			"id, email, full_name, nickname, phone_wa, role, tier, is_active, joined_date",
		)
		.is("deleted_at", null)
		.order("role", { ascending: true })
		.order("joined_date", { ascending: false });

	if (error) {
		return (
			<div className="border-destructive bg-destructive/10 rounded-md border p-4">
				<p className="text-destructive text-sm font-medium">
					Gagal memuat users: {error.message}
				</p>
			</div>
		);
	}

	const users = (data ?? []) as UserRow[];
	const pendingCount = users.filter(
		(u) => u.role === "pending_approval",
	).length;
	const isSuperAdmin = me?.profile.role === "super_admin";

	return (
		<div className="space-y-4">
			<div className="flex items-end justify-between">
				<div>
					<h2 className="text-xl font-semibold tracking-tight">Master Crew</h2>
					<p className="text-muted-foreground text-sm">
						{users.length} terdaftar
						{pendingCount > 0 && (
							<>
								{" · "}
								<span className="text-primary font-medium">
									{pendingCount} pending approval
								</span>
							</>
						)}
					</p>
				</div>
			</div>

			<div className="border-border bg-card overflow-x-auto rounded-lg border">
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
										<CrewRoleMenu
											userId={u.id}
											userName={u.full_name}
											currentRole={u.role}
											currentTier={u.tier}
											disabled={u.id === me?.authId}
										/>
									</TableCell>
								)}
							</TableRow>
						))}
					</TableBody>
				</Table>
			</div>
		</div>
	);
}
