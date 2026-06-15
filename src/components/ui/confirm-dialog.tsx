"use client";

import {
	createContext,
	useCallback,
	useContext,
	useMemo,
	useState,
} from "react";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/**
 * <ConfirmDialog />
 * Drop-in replacement for window.confirm() with branded styling and
 * react-friendly state management.
 *
 * Usage — controlled (most common):
 *   const [open, setOpen] = useState(false);
 *   <Button onClick={() => setOpen(true)}>Delete</Button>
 *   <ConfirmDialog
 *     open={open}
 *     onOpenChange={setOpen}
 *     title="Hapus event?"
 *     description="Aksi ini tidak bisa di-undo."
 *     confirmLabel="Hapus"
 *     variant="destructive"
 *     onConfirm={async () => { await deleteEvent(id); }}
 *   />
 *
 * Usage — imperative via promise (for one-off flows):
 *   const ok = await confirm({ title: "...", description: "..." });
 *   if (!ok) return;
 *
 * NOTE: imperative API requires <ConfirmDialogProvider /> at app root —
 *       added in F3b along with the Toaster. For F3a, use the controlled form.
 */

export interface ConfirmDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
	description?: string;
	confirmLabel?: string;
	cancelLabel?: string;
	variant?: "default" | "destructive";
	onConfirm: () => void | Promise<void>;
	onCancel?: () => void;
}

export function ConfirmDialog({
	open,
	onOpenChange,
	title,
	description,
	confirmLabel = "Lanjut",
	cancelLabel = "Batal",
	variant = "default",
	onConfirm,
	onCancel,
}: ConfirmDialogProps) {
	const [pending, setPending] = useState(false);

	async function handleConfirm() {
		setPending(true);
		try {
			await onConfirm();
			onOpenChange(false);
		} finally {
			setPending(false);
		}
	}

	function handleCancel() {
		onCancel?.();
		onOpenChange(false);
	}

	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>{title}</AlertDialogTitle>
					{description ? (
						<AlertDialogDescription>{description}</AlertDialogDescription>
					) : null}
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel disabled={pending} onClick={handleCancel}>
						{cancelLabel}
					</AlertDialogCancel>
					<AlertDialogAction
						variant={variant}
						disabled={pending}
						onClick={(e) => {
							e.preventDefault();
							void handleConfirm();
						}}
					>
						{pending ? "Memproses…" : confirmLabel}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}

/* ───────────────────────── Imperative API ─────────────────────────
 * Promise-based confirm — a custom replacement for window.confirm().
 *   const confirm = useConfirm();
 *   if (!(await confirm({ title: "Lepas crew?", variant: "destructive" }))) return;
 * Requires <ConfirmProvider> at the app root (mounted in app/layout.tsx).
 */

export type ConfirmOptions = {
	title: string;
	description?: string;
	confirmLabel?: string;
	cancelLabel?: string;
	variant?: "default" | "destructive";
};

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
	const [state, setState] = useState<{
		opts: ConfirmOptions;
		resolve: (value: boolean) => void;
	} | null>(null);

	const confirm = useCallback<ConfirmFn>(
		(opts) =>
			new Promise<boolean>((resolve) => {
				setState({ opts, resolve });
			}),
		[],
	);

	const value = useMemo(() => confirm, [confirm]);

	return (
		<ConfirmContext.Provider value={value}>
			{children}
			<ConfirmDialog
				open={state !== null}
				onOpenChange={(open) => {
					if (!open) {
						// Dismiss (Esc / backdrop / Cancel) resolves false.
						state?.resolve(false);
						setState(null);
					}
				}}
				title={state?.opts.title ?? ""}
				description={state?.opts.description}
				confirmLabel={state?.opts.confirmLabel}
				cancelLabel={state?.opts.cancelLabel}
				variant={state?.opts.variant}
				onConfirm={() => {
					state?.resolve(true);
					setState(null);
				}}
			/>
		</ConfirmContext.Provider>
	);
}

/** Returns an async confirm() — resolves true on confirm, false on cancel. */
export function useConfirm(): ConfirmFn {
	const ctx = useContext(ConfirmContext);
	if (!ctx) {
		throw new Error("useConfirm must be used within <ConfirmProvider>");
	}
	return ctx;
}
