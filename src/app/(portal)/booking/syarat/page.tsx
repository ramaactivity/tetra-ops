export const metadata = { title: "Syarat booking & privasi" };

const SITE = "https://tetraphoto.com";

/**
 * Ringkasan syarat yang disetujui klien di form booking. Sumber resminya
 * halaman legal di tetraphoto.com (keputusan owner 7 Okt 2026: satu sumber,
 * portal hanya merangkum + menautkan). Ubah di website → sesuaikan ringkasan
 * ini dan naikkan system_config booking.terms_version.
 */
export default function SyaratPage() {
	return (
		<div className="wrap" style={{ paddingBottom: 60 }}>
			<a href="/booking" className="link cap">
				← Kembali ke booking
			</a>
			<h1 className="h1" style={{ margin: "16px 0 6px" }}>
				Syarat booking
			</h1>
			<p className="body">
				Ringkasan dari halaman resmi Tetra Photobooth. Yang berlaku adalah isi
				lengkapnya di tautan di bawah.
			</p>

			<Section title="Booking & pembayaran">
				<li>
					Booking resmi setelah DP kami terima. Sebelum itu, tanggal dan jam
					belum dikunci untuk kamu.
				</li>
				<li>
					DP minimal Rp500.000. Booking yang belum dibayar DP dalam 30 hari
					otomatis kedaluwarsa.
				</li>
				<li>Pelunasan paling lambat 1 hari sebelum acara.</li>
			</Section>

			<Section title="Pembatalan & pindah tanggal">
				<li>
					DP ditahan sebagai biaya pembatalan dan tidak dapat dikembalikan.
				</li>
				<li>
					Pembayaran di luar DP: dibatalkan lebih dari 14 hari sebelum acara
					kembali penuh, 14 sampai 3 hari kembali 50%, kurang dari 3 hari tidak
					kembali.
				</li>
				<li>
					Pindah tanggal tanpa biaya, diajukan paling lambat 30 hari sebelum
					acara dan selama tanggal pengganti tersedia.
				</li>
				<li>
					Kalau Tetra yang membatalkan, semua pembayaran termasuk DP
					dikembalikan.
				</li>
			</Section>

			<Section title="Data pribadi">
				<li>
					Kami memakai nama, nomor WhatsApp, email, dan detail acara kamu untuk
					mengurus booking, tagihan, dan desain frame.
				</li>
				<li>
					Data tidak dijual. Kamu boleh minta salinan, perbaikan, atau
					penghapusan data sesuai UU No. 27 Tahun 2022.
				</li>
			</Section>

			<section
				id="privasi"
				className="card"
				style={{ marginTop: 14, display: "grid", gap: 8 }}
			>
				<h2 className="h2">Baca lengkapnya</h2>
				<a
					className="link"
					href={`${SITE}/syarat-ketentuan`}
					target="_blank"
					rel="noopener"
				>
					Syarat & Ketentuan
				</a>
				<a
					className="link"
					href={`${SITE}/kebijakan-refund`}
					target="_blank"
					rel="noopener"
				>
					Kebijakan Refund & Pembatalan
				</a>
				<a
					className="link"
					href={`${SITE}/privasi`}
					target="_blank"
					rel="noopener"
				>
					Kebijakan Privasi
				</a>
			</section>
		</div>
	);
}

function Section({
	title,
	children,
}: {
	title: string;
	children: React.ReactNode;
}) {
	return (
		<section className="card" style={{ marginTop: 14 }}>
			<h2 className="h2" style={{ marginBottom: 8 }}>
				{title}
			</h2>
			<ul
				className="body"
				style={{ paddingLeft: 18, display: "grid", gap: 6, margin: 0 }}
			>
				{children}
			</ul>
		</section>
	);
}
