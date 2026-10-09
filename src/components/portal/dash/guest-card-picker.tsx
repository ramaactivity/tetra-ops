"use client";

/**
 * Pilihan desain kartu QR Guest Cam (kontrak Booth v0.9). Katalog & thumbnail
 * dari Booth `GET /api/guest-cards`; pilihan disimpan di detail booking lalu
 * dikirim ke Booth sebagai `guest_card_design`. Admin Tetra mencetaknya.
 */
import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { saveBookingDetail } from "@/lib/actions/portal-booking";

export type GuestCardDesign = {
	id: string;
	name: string;
	hint?: string;
	preview_url: string;
};

export function GuestCardPicker({
	code,
	designs,
	value,
	canEdit,
}: {
	code: string;
	designs: GuestCardDesign[];
	value: string | null;
	canEdit: boolean;
}) {
	const router = useRouter();
	const [picked, setPicked] = useState(value);
	const [error, setError] = useState<string | null>(null);

	async function pick(id: string) {
		const prev = picked;
		setPicked(id);
		setError(null);
		const r = await saveBookingDetail(code, { guest_card_design: id });
		if (!r.ok) {
			setPicked(prev);
			setError(r.error);
		} else router.refresh();
	}

	return (
		<div style={{ display: "grid", gap: 12 }}>
			<div
				style={{
					display: "grid",
					gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
					gap: 12,
				}}
			>
				{designs.map((d) => {
					const on = picked === d.id;
					return (
						<button
							key={d.id}
							type="button"
							aria-pressed={on}
							aria-label={`Desain kartu ${d.name}`}
							disabled={!canEdit}
							onClick={() => pick(d.id)}
							style={{
								position: "relative",
								display: "grid",
								gap: 8,
								padding: 8,
								borderRadius: 12,
								border: on ? "2px solid #1D1D1B" : "1.5px solid #D6D3CC",
								background: on ? "#F8D98B" : "#fff",
								textAlign: "left",
								font: "inherit",
								color: "#1D1D1B",
							}}
						>
							{/* biome-ignore lint/performance/noImgElement: SVG dari Booth, tanpa optimasi Next */}
							<img
								src={d.preview_url}
								alt=""
								width={180}
								height={250}
								loading="lazy"
								style={{
									width: "100%",
									height: "auto",
									borderRadius: 6,
									border: "1px solid #D6D3CC",
									background: "#fff",
								}}
							/>
							<span style={{ display: "grid", gap: 2 }}>
								<span style={{ fontSize: 13, fontWeight: 700 }}>{d.name}</span>
								{d.hint && (
									<span
										style={{ fontSize: 11, color: "#5F5E5A", lineHeight: 1.35 }}
									>
										{d.hint}
									</span>
								)}
							</span>
							{on && (
								<Check
									aria-hidden
									size={16}
									strokeWidth={3}
									style={{ position: "absolute", top: 14, right: 14 }}
								/>
							)}
						</button>
					);
				})}
			</div>
			{error && (
				<p role="alert" style={{ margin: 0, fontSize: 13, color: "#B4442F" }}>
					{error}
				</p>
			)}
		</div>
	);
}
