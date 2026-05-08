import { Settings as SettingsIcon } from "lucide-react";
import { SectionHeader } from "@/components/layout/section-header";
import {
	type ConfigEntry,
	SystemConfigForm,
} from "@/components/system-config/config-form";
import { EmptyState } from "@/components/ui/empty-state";
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
			<EmptyState
				icon={SettingsIcon}
				title="Belum ada system config"
				description="Jalankan onboarding wizard atau seed data awal."
			/>
		);
	}

	return (
		<div className="space-y-4">
			<SectionHeader
				as="h2"
				title="System Configuration"
				description="Default value yang dipakai booking, settlement, dan WA template. Hati-hati ubah — pengaruh ke event yang lagi berjalan."
			/>

			<SystemConfigForm entries={entries} />
		</div>
	);
}
