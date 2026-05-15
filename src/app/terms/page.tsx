import { ChevronLeft } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

export const metadata = {
	title: "Terms of Service — Tetra Ops",
	description:
		"Terms of service untuk Tetra Ops, sistem operasional internal Tetra Photobooth.",
};

export default function TermsPage() {
	return (
		<div className="min-h-screen bg-background">
			<div className="mx-auto max-w-3xl px-4 py-10 sm:px-8 sm:py-14">
				<header className="mb-10 space-y-4">
					<Link
						href="/"
						className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
					>
						<ChevronLeft className="h-4 w-4" />
						Kembali
					</Link>
					<div className="flex items-center gap-2.5">
						<Image
							src="/brand/logomark-only.png"
							alt="Tetra"
							width={28}
							height={28}
							className="h-7 w-auto"
						/>
						<span className="text-foreground text-fluid-body font-semibold tracking-tight">
							Tetra Ops
						</span>
					</div>
					<div className="space-y-2">
						<h1 className="text-fluid-h1 leading-tight tracking-tight">
							Terms of Service
						</h1>
						<p className="text-muted-foreground text-fluid-body">
							Update terakhir: 11 Mei 2026
						</p>
					</div>
				</header>

				<main className="space-y-8 text-foreground text-fluid-body leading-relaxed">
					<section className="space-y-3">
						<h2 className="text-fluid-h2 tracking-tight">
							1. Penerimaan Syarat
						</h2>
						<p>
							Dengan login atau menggunakan Tetra Ops, lo setuju terikat
							dengan syarat-syarat di bawah. Kalau nggak setuju, jangan pakai
							aplikasi ini.
						</p>
					</section>

					<section className="space-y-3">
						<h2 className="text-fluid-h2 tracking-tight">
							2. Tentang Layanan
						</h2>
						<p>
							Tetra Ops adalah sistem operasional internal untuk Tetra
							Photobooth (Bogor, Indonesia) — booking management, jadwal crew,
							inventory, settlement keuangan, dan reporting. Akses dibatasi
							pada owner dan crew terverifikasi.
						</p>
					</section>

					<section className="space-y-3">
						<h2 className="text-fluid-h2 tracking-tight">
							3. Tanggung Jawab User
						</h2>
						<ul className="ml-6 list-disc space-y-2 marker:text-muted-foreground">
							<li>
								Jaga kerahasiaan kredensial login (password, OAuth token).
							</li>
							<li>
								Gunakan aplikasi sesuai role (owner / crew) yang
								di-grant. Jangan akses data di luar scope kerja.
							</li>
							<li>
								Laporkan ke owner kalau ada indikasi akun di-compromise atau
								akses tidak sah.
							</li>
						</ul>
					</section>

					<section className="space-y-3">
						<h2 className="text-fluid-h2 tracking-tight">
							4. Penggunaan yang Dilarang
						</h2>
						<ul className="ml-6 list-disc space-y-2 marker:text-muted-foreground">
							<li>
								Scraping, reverse engineering, atau akses unauthorized ke
								database.
							</li>
							<li>
								Sharing data klien Tetra Photobooth ke pihak luar tanpa
								persetujuan owner.
							</li>
							<li>
								Penggunaan untuk aktivitas yang melanggar hukum Indonesia.
							</li>
						</ul>
					</section>

					<section className="space-y-3">
						<h2 className="text-fluid-h2 tracking-tight">
							5. Disclaimer
						</h2>
						<p>
							Tetra Ops disediakan{" "}
							<em>"as is"</em> — kami berusaha menjaga uptime + integritas
							data, tapi nggak bisa menjamin bebas error 100%. Owner
							bertanggung jawab atas backup data operasional yang critical.
						</p>
					</section>

					<section className="space-y-3">
						<h2 className="text-fluid-h2 tracking-tight">
							6. Penghentian Akses
						</h2>
						<p>
							Owner berhak menonaktifkan atau menghapus akun crew kapan saja
							(misalnya untuk crew yang sudah keluar). Akses Google OAuth bisa
							di-revoke via{" "}
							<a
								href="https://myaccount.google.com/permissions"
								target="_blank"
								rel="noopener noreferrer"
								className="text-primary underline-offset-4 hover:underline"
							>
								Google Account Permissions
							</a>
							.
						</p>
					</section>

					<section className="space-y-3">
						<h2 className="text-fluid-h2 tracking-tight">
							7. Perubahan Syarat
						</h2>
						<p>
							Owner berhak mengupdate Terms ini kapan saja. Perubahan
							material akan dikomunikasikan via channel internal tim.
						</p>
					</section>

					<section className="space-y-3">
						<h2 className="text-fluid-h2 tracking-tight">
							8. Kontak
						</h2>
						<p>
							Pertanyaan terkait Terms:{" "}
							<a
								href="mailto:workwithrama98@gmail.com"
								className="text-primary underline-offset-4 hover:underline"
							>
								workwithrama98@gmail.com
							</a>
						</p>
					</section>
				</main>

				<footer className="border-border-default mt-14 border-t pt-6 text-fluid-caption text-muted-foreground">
					<p>© {new Date().getFullYear()} Tetra Photobooth. Bogor, Indonesia.</p>
				</footer>
			</div>
		</div>
	);
}
