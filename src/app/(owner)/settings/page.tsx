import {
	type ConfigEntry,
	SystemConfigForm,
} from "@/components/system-config/config-form";
import { createClient } from "@/lib/supabase/server";

export default async function SystemConfigPage() {
	const supabase = await createClient();
	const { data, error } = await supabase
		.from("system_config")
		.select("key, value, description, category")
		.order("category", { ascending: true })
		.order("key", { ascending: true });

	if (error) {
		return (
			<div className="border-destructive bg-destructive/10 rounded-md border p-4">
				<p className="text-destructive text-sm font-medium">
					Gagal memuat system config: {error.message}
				</p>
			</div>
		);
	}

	const entries = (data ?? []) as ConfigEntry[];

	if (entries.length === 0) {
		return (
			<div className="border-border bg-card rounded-xl border border-dashed p-12 text-center">
				<p className="text-muted-foreground text-sm">
					Belum ada system config. Jalankan onboarding wizard atau seed data
					awal.
				</p>
			</div>
		);
	}

	return (
		<div className="space-y-4">
			<div className="space-y-1">
				<h2 className="text-xl font-semibold tracking-tight">
					System Configuration
				</h2>
				<p className="text-muted-foreground text-sm">
					Default value yang dipakai booking, settlement, dan WA template.
					Hati-hati ubah — pengaruh ke event yang lagi berjalan.
				</p>
			</div>

			<SystemConfigForm entries={entries} />
		</div>
	);
}
