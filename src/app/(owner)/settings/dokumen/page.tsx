import { SignerSettings } from "@/components/documents/signer-settings";
import { SectionHeader } from "@/components/layout/section-header";
import { loadSigners } from "@/lib/documents/load";

export const dynamic = "force-dynamic";

export default async function DocumentSettingsPage() {
	const signers = await loadSigners();
	return (
		<div className="space-y-4">
			<SectionHeader
				as="h2"
				title="Penanda tangan dokumen"
				description="Dipakai di quotation, invoice, kuitansi, nota lunas, dan BAST. Nama & jabatan masih bisa diganti per dokumen."
			/>
			<SignerSettings signers={signers} />
		</div>
	);
}
