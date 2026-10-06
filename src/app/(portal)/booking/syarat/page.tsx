export const metadata = { title: "Syarat booking & privasi" };

/**
 * Syarat booking + kebijakan privasi (UU PDP) yang disetujui klien di form
 * booking. Versi = system_config booking.terms_version; ubah isi di sini →
 * naikkan versinya juga (DR-034).
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
			<p className="cap mono">Versi 06.10.2026</p>

			<Section title="Booking & DP">
				<li>
					Booking baru resmi setelah DP kami terima. Sebelum itu, tanggal dan
					jam belum dikunci untuk kamu.
				</li>
				<li>
					DP minimal Rp500.000. Pembayaran lewat transfer ke rekening yang
					tertera di halaman booking, lalu unggah buktinya.
				</li>
				<li>
					Booking yang belum dibayar DP dalam 30 hari otomatis kedaluwarsa.
				</li>
				<li>Pelunasan paling lambat H-1 sebelum acara.</li>
				<li>
					Harga mengikuti pricelist yang berlaku saat booking dibuat. Total
					resmi tertera di invoice.
				</li>
			</Section>

			<Section title="Pindah tanggal">
				<li>Pindah tanggal gratis selama jadwal baru masih tersedia.</li>
				<li>
					Tanggal baru paling lambat 6 bulan dari tanggal awal. Lewat dari itu,
					booking dianggap batal.
				</li>
			</Section>

			<Section title="Pembatalan">
				<li>Biaya pembatalan Rp500.000.</li>
				<li>
					Dibatalkan oleh kamu H-30 atau lebih: semua pembayaran dikembalikan,
					dipotong biaya pembatalan.
				</li>
				<li>
					Dibatalkan oleh kamu H-29 sampai H-8: dikembalikan 50% dari total
					pembayaran, dengan potongan paling sedikit sebesar biaya pembatalan.
				</li>
				<li>
					Dibatalkan oleh kamu H-7 sampai hari acara: pembayaran tidak dapat
					dikembalikan.
				</li>
				<li>
					Dibatalkan oleh Tetra Photobooth: semua pembayaran dikembalikan penuh.
				</li>
				<li>
					Keadaan kahar (bencana, kerusuhan, aturan pemerintah darurat): pindah
					tanggal gratis. Kalau tidak memungkinkan, pembayaran dikembalikan
					dipotong biaya pembatalan.
				</li>
			</Section>

			<h2
				id="privasi"
				className="h1"
				style={{ fontSize: 24, margin: "32px 0 12px" }}
			>
				Kebijakan privasi
			</h2>
			<Section title="Data yang kami kumpulkan">
				<li>Nama, nomor WhatsApp, dan email (kalau kamu isi).</li>
				<li>
					Detail acara: nama acara, tanggal, jam, lokasi, nama pemilik acara,
					dan kontak PIC hari H.
				</li>
				<li>Bukti pembayaran dan file desain yang kamu unggah.</li>
			</Section>
			<Section title="Untuk apa">
				<li>
					Mengurus booking kamu: jadwal, tagihan, desain frame, dan koordinasi
					crew di hari acara.
				</li>
				<li>Menghubungi kamu lewat WhatsApp atau email soal booking ini.</li>
				<li>Pembukuan dan kewajiban pajak Tetra Photobooth.</li>
				<li>
					Kami tidak menjual data kamu dan tidak memakainya untuk iklan pihak
					lain.
				</li>
			</Section>
			<Section title="Penyimpanan & keamanan">
				<li>
					Data disimpan di layanan cloud dengan akses terbatas untuk tim Tetra
					Photobooth.
				</li>
				<li>
					Bukti pembayaran dan file disimpan privat; hanya bisa dibuka lewat
					link sementara.
				</li>
				<li>
					Data booking disimpan selama dibutuhkan untuk pembukuan (paling lama 5
					tahun), lalu dihapus atau dianonimkan.
				</li>
			</Section>
			<Section title="Hak kamu">
				<li>
					Kamu boleh meminta salinan, perbaikan, atau penghapusan data kamu, dan
					menarik persetujuan ini.
				</li>
				<li>
					Penghapusan tidak berlaku untuk data yang wajib kami simpan untuk
					pembukuan.
				</li>
				<li>
					Hubungi kami di WhatsApp <span className="mono">0852 1352 6630</span>{" "}
					atau email <span className="mono">tetraphotobooth@gmail.com</span>.
				</li>
			</Section>
			<p className="cap" style={{ marginTop: 24 }}>
				Tetra Photobooth · Bogor, Indonesia
			</p>
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
