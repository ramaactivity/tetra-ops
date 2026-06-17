"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/toaster";
import { SupplierForm } from "./supplier-form";

export function NewSupplierButton() {
	const router = useRouter();
	const [open, setOpen] = useState(false);

	return (
		<>
			<button
				type="button"
				onClick={() => setOpen(true)}
				className="press-down inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary dark:bg-primary px-3 text-fluid-caption font-medium text-white hover:bg-primary/90 dark:hover:bg-primary"
			>
				<Plus className="size-4" />
				Tambah Supplier
			</button>
			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent className="sm:max-w-xl">
					<DialogHeader>
						<DialogTitle>Tambah Supplier</DialogTitle>
						<DialogDescription>
							Master vendor — nama, kontak, default term pembayaran.
						</DialogDescription>
					</DialogHeader>
					<SupplierForm
						mode="create"
						onSuccess={() => {
							toast.success("Supplier ditambahkan");
							setOpen(false);
							router.refresh();
						}}
					/>
				</DialogContent>
			</Dialog>
		</>
	);
}
