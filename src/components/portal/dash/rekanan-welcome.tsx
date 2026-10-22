/**
 * Dasbor rekanan yang belum punya acara (DR-050): sambutan + cara kerjanya +
 * skema kerja sama resmi. Di bawahnya page menampilkan contoh dasbor.
 */
import { btn } from "./ui";

const INK = "#1D1D1B";
const B = `1.5px solid ${INK}`;

const STEPS = [
	[
		"Booking klien lewat Tetra",
		"Chat admin atau buat booking baru. Sebutkan nama usaha kamu supaya acaranya tertaut.",
	],
	[
		"Acara otomatis masuk dasbor ini",
		"Status, jadwal, data yang kurang, desain frame, galeri — semua per acara.",
	],
	[
		"Undang klien & pantau tagihan / komisi",
		"Klien mengisi data acaranya sendiri; kamu tinggal memantau.",
	],
] as const;

export function RekananWelcome({
	vendorName,
	calon,
	chatUrl,
}: {
	vendorName: string;
	calon: boolean;
	chatUrl: string | null;
}) {
	return (
		<section
			style={{
				display: "grid",
				gap: 16,
				padding: "20px 20px 22px",
				borderRadius: 20,
				border: B,
				background: "#FFF6DD",
				boxShadow: `5px 5px 0 -1.5px #F8D98B,5px 5px 0 0 ${INK}`,
			}}
		>
			<div style={{ display: "grid", gap: 6 }}>
				<span
					style={{
						justifySelf: "start",
						borderRadius: 8,
						border: B,
						background: calon ? "#D6EEF8" : "#D6F1EA",
						padding: "2px 10px",
						fontSize: 12,
						fontWeight: 700,
					}}
				>
					{calon ? "Akun aktif · kerja sama sedang diatur" : "Rekanan Tetra"}
				</span>
				<h2
					style={{
						margin: 0,
						fontSize: 20,
						fontWeight: 800,
						letterSpacing: "-0.02em",
					}}
				>
					Dasbor rekanan {vendorName} sudah siap
				</h2>
				<p
					style={{
						margin: 0,
						fontSize: 14,
						lineHeight: 1.55,
						color: "#3A3936",
					}}
				>
					Belum ada acara di sini. Begitu klien kamu booking Tetra, acaranya
					muncul otomatis.{" "}
					{calon
						? "Tim Tetra akan menghubungi kamu lewat WhatsApp untuk mengatur kerja samanya."
						: ""}
				</p>
			</div>
			<ol
				style={{
					listStyle: "none",
					margin: 0,
					padding: 0,
					display: "grid",
					gap: 10,
					gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
				}}
			>
				{STEPS.map(([t, d], i) => (
					<li
						key={t}
						style={{
							display: "flex",
							gap: 10,
							padding: "12px 14px",
							borderRadius: 14,
							border: B,
							background: "#fff",
						}}
					>
						<span
							className="mono"
							style={{
								display: "grid",
								placeItems: "center",
								width: 26,
								height: 26,
								flex: "none",
								borderRadius: 999,
								border: B,
								background: "#F8D98B",
								fontSize: 12,
								fontWeight: 700,
							}}
						>
							{i + 1}
						</span>
						<span style={{ display: "grid", gap: 2, minWidth: 0 }}>
							<b style={{ fontSize: 14 }}>{t}</b>
							<span
								style={{ fontSize: 13, color: "#5F5E5A", lineHeight: 1.45 }}
							>
								{d}
							</span>
						</span>
					</li>
				))}
			</ol>
			<div
				style={{
					display: "grid",
					gap: 4,
					padding: "12px 14px",
					borderRadius: 14,
					border: "1.5px dashed #1D1D1B",
					background: "#fff",
					fontSize: 13.5,
					lineHeight: 1.5,
				}}
			>
				<b>Skema kerja sama</b>
				<span>
					<b>Komisi 10%</b> — klien bayar ke Tetra, kamu dapat 10% dari harga
					publish setelah acara selesai. Atau <b>potongan 10%</b> — klien bayar
					ke kamu, kamu bayar ke Tetra harga publish dikurangi 10%.
				</span>
			</div>
			<div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
				<a href="/booking" style={btn("#F8D98B")}>
					+ Booking untuk klien
				</a>
				{chatUrl && (
					<a
						href={`${chatUrl}?text=${encodeURIComponent(`Halo Tetra, saya dari ${vendorName}. Mau ngobrol soal kerja sama rekanan.`)}`}
						target="_blank"
						rel="noopener noreferrer"
						style={btn("#fff")}
					>
						Chat admin Tetra
					</a>
				)}
			</div>
		</section>
	);
}
