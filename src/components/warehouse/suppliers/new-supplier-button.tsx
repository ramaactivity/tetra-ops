"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { buttonVariants } from "@/components/ui/button";
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
				className={buttonVariants({ variant: "default", className: "h-9" })}
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
