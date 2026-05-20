"use client";

import { useRouter } from "next/navigation";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/toaster";
import { SupplierForm } from "./supplier-form";
import type { SupplierRow } from "./suppliers-table";

export function EditSupplierDialog({
	supplier,
	open,
	onOpenChange,
}: {
	supplier: SupplierRow;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const router = useRouter();
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-lg">
				<DialogHeader>
					<DialogTitle>Edit Supplier</DialogTitle>
					<DialogDescription>
						Update info {supplier.name}.
					</DialogDescription>
				</DialogHeader>
				<SupplierForm
					mode="edit"
					id={supplier.id}
					defaults={{
						name: supplier.name,
						category: supplier.category,
						contact: supplier.contact,
						default_payment_term: supplier.default_payment_term,
						default_top_days: supplier.default_top_days,
						notes: supplier.notes,
						is_active: supplier.is_active,
					}}
					onSuccess={() => {
						toast.success("Supplier disimpan");
						onOpenChange(false);
						router.refresh();
					}}
				/>
			</DialogContent>
		</Dialog>
	);
}
