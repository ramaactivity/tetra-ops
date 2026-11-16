import Link from "next/link";
import { redirect } from "next/navigation";
import { AmountRow } from "@/components/finance/money-ui";
import { PatunganDialog } from "@/components/finance/patungan-dialog";
import { WithdrawalButton } from "@/components/finance/withdrawal-button";
import { Container } from "@/components/layout/container";
import { SectionHeader } from "@/components/layout/section-header";
import { RekapCard } from "@/components/rekap/rekap-ui";
import { getCurrentUser } from "@/lib/auth/get-user";
import { isoDateWIB } from "@/lib/dates";
import {
	loadOwnerShareMoves,
	loadOwnerShares,
	type OwnerShareMove,
} from "@/lib/finance/owner-share-data";
import { formatDateID, formatSignedRupiah } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

const MOVE_LABEL: Record<OwnerShareMove["type"], string> = {
	withdrawal: "Ambil bagi hasil",
	contribution: "Patungan",
	adjustment: "Koreksi",
};

/**
 * Bagi hasil owner — dulu cuma satu bagian di Finance › Ringkasan. Super admin
 * melihat semua owner + tombol ambil/patungan; owner melihat miliknya sendiri.
 */
export default async function BagiHasilPage() {
	const me = await getCurrentUser();
	if (!me) redirect("/login");
	const role = me.profile.role;
	if (role !== "super_admin" && role !== "owner") redirect("/finance");
	// Super admin melihat & mencatat semua. Owner hanya boleh membaca jatahnya
	// sendiri (RLS owner_earnings) — tanpa filter, owner lain tampil Rp0 palsu.
	const canWithdraw = role === "super_admin";
	const mine = canWithdraw ? undefined : me.profile.id;

	const supabase = await createClient();
	const [owners, moves, { data: banks }, { count: ownerCount }] =
		await Promise.all([
			loadOwnerShares(supabase, mine),
			loadOwnerShareMoves(supabase, mine),
			canWithdraw
				? supabase
						.from("bank_accounts")
						.select("id, account_name")
						.eq("is_active", true)
						.order("account_name", { ascending: true })
				: Promise.resolve({
						data: [] as Array<{ id: string; account_name: string }>,
					}),
			// Patungan memotong SEMUA owner aktif — jumlah asli untuk pratinjau
			// total, bukan jumlah kartu yang tampil (owner hanya melihat miliknya).
			supabase
				.from("users")
				.select("id", { count: "exact", head: true })
				.eq("role", "owner")
				.eq("is_active", true),
		]);
	const nameOf = new Map(owners.map((o) => [o.id, o.full_name]));

	return (
		<Container size="xl" className="space-y-3">
			<SectionHeader
				title="Bagi Hasil Owner"
				actions={
					owners.length > 0 ? (
						<>
							{canWithdraw && (
								<WithdrawalButton
									owners={owners.map((o) => ({
										id: o.id,
										full_name: o.full_name,
										role: o.role,
										balance: o.available,
										pending: o.pending,
									}))}
									banks={(banks ?? []).map((b) => ({
										id: b.id as string,
										label: b.account_name as string,
									}))}
								/>
							)}
							<PatunganDialog ownerCount={ownerCount ?? owners.length} />
						</>
					) : undefined
				}
			/>

			<p className="text-[13px] leading-relaxed text-muted-foreground">
				Rp50.000 per event per owner. Jatah bulan ini baru bisa diambil bulan
				depan; kalau untung event kurang, jatahnya tertunda dan dibayar dari
				event berikutnya.
				{!canWithdraw &&
					" Ambil bagi hasil dicatat dari akun Tetra Photobooth (Owner)."}
			</p>

			{owners.length === 0 ? (
				<RekapCard>
					<p className="text-[13px] text-muted-foreground">
						Belum ada owner aktif.
					</p>
				</RekapCard>
			) : (
				<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
					{owners.map((o) => (
						<RekapCard key={o.id} className="space-y-2">
							<div className="flex items-baseline justify-between gap-3">
								<span className="truncate text-[14px] font-semibold text-foreground">
									{o.full_name}
								</span>
								<span className="shrink-0 text-[12px] text-muted-foreground">
									Bisa diambil
								</span>
							</div>
							<p
								data-nominal
								className={cn(
									"tabular text-right text-[22px] font-bold leading-none tracking-[-0.02em]",
									o.available > 0
										? "text-emerald-700"
										: o.available < 0
											? "text-rose-600"
											: "text-muted-foreground",
								)}
							>
								{formatSignedRupiah(o.available)}
							</p>
							<div className="space-y-1 border-t border-border-subtle pt-2">
								<AmountRow label="Total didapat" value={o.earned} small />
								{o.pending > 0 && (
									<AmountRow
										label="Dari event bulan ini"
										note="bisa diambil bulan depan"
										value={o.pending}
										small
									/>
								)}
								{o.arrears > 0 && (
									<AmountRow
										label="Tertunda"
										note="dibayar dari event berikutnya"
										value={o.arrears}
										small
									/>
								)}
								<AmountRow label="Sudah diambil" value={-o.withdrawn} small />
								{o.patungan > 0 && (
									<AmountRow
										label="Dipotong patungan"
										value={-o.patungan}
										small
									/>
								)}
							</div>
						</RekapCard>
					))}
				</div>
			)}

			<RekapCard className="space-y-2">
				<div className="flex items-baseline justify-between gap-3">
					<h2 className="text-[15px] font-semibold text-foreground">
						Riwayat ambil & patungan
					</h2>
					{
						<Link
							href="/settings/crew"
							className="text-[12.5px] font-medium text-muted-foreground hover:text-foreground"
						>
							Atur porsi
						</Link>
					}
				</div>
				{moves.length === 0 ? (
					<p className="text-[13px] text-muted-foreground">
						Belum ada bagi hasil yang diambil.
					</p>
				) : (
					<ul className="divide-y divide-border-subtle rounded-xl bg-secondary/40">
						{moves.map((m) => (
							<li
								key={m.id}
								className="flex items-start justify-between gap-3 px-3 py-2.5"
							>
								<div className="min-w-0">
									<p className="text-[13.5px] text-foreground">
										{MOVE_LABEL[m.type]}
										{owners.length > 1 && nameOf.get(m.ownerId) ? (
											<span className="text-muted-foreground">
												{" "}
												· {nameOf.get(m.ownerId)}
											</span>
										) : null}
									</p>
									<p className="truncate text-[12px] text-muted-foreground">
										{formatDateID(isoDateWIB(new Date(m.createdAt)))}
										{m.description ? ` · ${m.description}` : ""}
									</p>
								</div>
								<span
									data-nominal
									className={cn(
										"tabular shrink-0 text-[13.5px] font-semibold",
										m.amount < 0 ? "text-rose-600" : "text-emerald-700",
									)}
								>
									{formatSignedRupiah(m.amount)}
								</span>
							</li>
						))}
					</ul>
				)}
			</RekapCard>
		</Container>
	);
}
