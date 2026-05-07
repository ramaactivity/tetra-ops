"use client";

import { Toaster as SonnerToaster, toast } from "sonner";

/**
 * <Toaster /> — wrapper around Sonner's Toaster pre-configured with
 * Tetra tokens. Mount once near the root of the app.
 *
 * Usage in layout:
 *   import { Toaster } from "@/components/ui/toaster";
 *   ...
 *   <Toaster />
 *
 * Trigger toasts anywhere:
 *   import { toast } from "@/components/ui/toaster";
 *   toast.success("Saved");
 *   toast.error(err.message);
 *   toast.promise(savePromise, {
 *     loading: "Menyimpan…",
 *     success: "Berhasil disimpan",
 *     error: (err) => err.message ?? "Gagal menyimpan",
 *   });
 *
 * Sonner ref: https://sonner.emilkowal.ski/
 */

export function Toaster() {
	return (
		<SonnerToaster
			position="top-right"
			theme="system"
			richColors
			closeButton
			duration={4000}
			toastOptions={{
				classNames: {
					toast:
						"!bg-surface-3 !border-border-default !text-foreground !shadow-lg",
					title: "!text-foreground !font-medium",
					description: "!text-muted-foreground",
					actionButton:
						"!bg-primary !text-primary-foreground hover:!bg-primary/90",
					cancelButton: "!bg-muted !text-muted-foreground",
				},
			}}
		/>
	);
}

export { toast };
