import { NewItemFlow } from "@/components/items/new-item-flow";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/operations/_shared/page-header";
import { loadCashAccounts } from "@/lib/finance/cash-accounts";
import { filterEmoneyAccounts } from "@/lib/finance/emoney";
import { loadAssetModels } from "@/lib/inventory/asset-models";
import type { ItemCategory } from "@/lib/inventory/item-loader";
import { createClient } from "@/lib/supabase/server";

export default async function WarehouseNewItemPage({
	searchParams,
}: {
	searchParams: Promise<{ category?: string; model?: string }>;
}) {
	const params = await searchParams;
	// ?model=<itemId> datang dari tombol "+ unit" di Asset Register — langsung
	// masuk mode "nambah unit alat yang sudah ada".
	const modelParam = params.model?.trim() || undefined;
	const initialCategory: ItemCategory | undefined = modelParam
		? "fixed_asset"
		: params.category === "inventory" || params.category === "fixed_asset"
			? params.category
			: undefined;

	const supabase = await createClient();
	const [{ data: suppliers }, assetModels, cashAccounts] = await Promise.all([
		supabase
			.from("suppliers")
			.select("id, name")
			.is("deleted_at", null)
			.eq("is_active", true)
			.order("name"),
		loadAssetModels(supabase),
		// Sumber dana pembelian tunai — biar belanja lewat bank tidak menggerus
		// saldo Kas Tunai di buku. Kartu e-toll disaring: beli alat/bahan bukan
		// kebutuhan transportasi.
		loadCashAccounts(supabase).then((a) => filterEmoneyAccounts(a, false)),
	]);

	// Tombol "+ unit" bisa diklik dari baris unit mana pun — petakan ke model
	// (grup) yang memuat unit itu, karena id model = id unit pertamanya.
	const initialModelId = modelParam
		? assetModels.find((m) => m.units.some((u) => u.id === modelParam))?.id
		: undefined;

	return (
		<Container size="lg" className="space-y-3">
			<PageHeader
				title="Tambah Item"
				backHref="/warehouse"
				backLabel="Warehouse"
				description="Pilih dulu jenis item — sistem akan menampilkan form yg sesuai cara item dicatat di akuntansi."
			/>
			<div className="rounded-xl bg-surface-2 p-6 sm:p-8 lg:p-10">
				<NewItemFlow
					returnTo="/warehouse"
					suppliers={(suppliers ?? []) as { id: string; name: string }[]}
					cashAccounts={cashAccounts}
					initialCategory={initialCategory}
					assetModels={assetModels}
					initialModelId={initialModelId}
				/>
			</div>
		</Container>
	);
}
