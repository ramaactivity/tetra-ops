"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { toast } from "@/components/ui/toaster";
import { formatRupiah } from "@/lib/format";
import {
	ITEM_CREATED_PARAM,
	readItemCreated,
} from "@/lib/inventory/item-created-toast";

/**
 * Menampilkan konfirmasi setelah menambah item, lalu membersihkan query-nya.
 *
 * Tanpa ini owner cuma melihat halaman berganti ke Warehouse — tidak ada tanda
 * apakah item jadi dibuat dan apakah jurnalnya lahir, jadi ragu apakah benar
 * berhasil. Toast-nya menyebut angka & nomor jurnalnya, plus tombol langsung
 * ke jurnalnya di Akuntansi supaya bisa dipastikan sendiri.
 */
export function ItemCreatedToast() {
	const params = useSearchParams();
	const router = useRouter();
	const shown = useRef(false);

	useEffect(() => {
		if (shown.current) return;
		const info = readItemCreated(params.get(ITEM_CREATED_PARAM));
		if (!info) return;
		shown.current = true;

		const what = info.units > 1 ? `${info.units} unit ${info.name}` : info.name;

		if (info.origin === "purchase" && info.journalRef) {
			toast.success(`${what} ditambahkan`, {
				description: `Pembelian ${formatRupiah(info.amount ?? 0)} tercatat · ${info.journalRef}`,
				duration: 9000,
				action: {
					label: "Lihat jurnal",
					onClick: () =>
						router.push(
							`/finance/accounting?entry=${encodeURIComponent(info.journalRef ?? "")}`,
						),
				},
			});
		} else if (info.origin === "owner_contribution") {
			toast.success(`${what} ditambahkan`, {
				description: `Dicatat sebagai setoran modal owner ${formatRupiah(info.amount ?? 0)} — tidak ada uang keluar.`,
				duration: 8000,
			});
		} else {
			toast.success(`${what} ditambahkan`, {
				description:
					"Hanya didaftarkan — tanpa stok masuk & tanpa catatan keuangan.",
				duration: 7000,
			});
		}

		// Bersihkan query supaya toast tidak muncul lagi saat halaman di-refresh
		// atau URL-nya di-bookmark.
		const next = new URLSearchParams(params.toString());
		next.delete(ITEM_CREATED_PARAM);
		const qs = next.toString();
		router.replace(`/warehouse${qs ? `?${qs}` : ""}`, { scroll: false });
	}, [params, router]);

	return null;
}
