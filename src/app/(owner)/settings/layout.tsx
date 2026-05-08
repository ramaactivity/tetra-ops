import { Container } from "@/components/layout/container";
import { SectionHeader } from "@/components/layout/section-header";
import { SettingsTabs } from "@/components/layouts/settings-tabs";

export default function SettingsLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<Container size="xl" className="space-y-6">
			<SectionHeader
				title="Settings"
				description="Atur master data dan konfigurasi sistem."
			/>
			<SettingsTabs />
			<div className="pt-2">{children}</div>
		</Container>
	);
}
