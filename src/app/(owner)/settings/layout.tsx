import { SettingsTabs } from "@/components/layouts/settings-tabs";

export default function SettingsLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-8 md:px-8">
			<div className="space-y-1">
				<h1 className="text-fluid-h1 font-semibold tracking-tight">Settings</h1>
				<p className="text-muted-foreground text-sm">
					Atur master data dan konfigurasi sistem.
				</p>
			</div>
			<SettingsTabs />
			<div className="pt-2">{children}</div>
		</div>
	);
}
