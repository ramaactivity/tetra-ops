import { ChevronLeft } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

export const metadata = {
	title: "Privacy Policy — Tetra Ops",
	description:
		"Privacy policy untuk Tetra Ops, sistem operasional internal Tetra Photobooth.",
};

export default function PrivacyPage() {
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
							Privacy Policy
						</h1>
						<p className="text-muted-foreground text-fluid-body">
							Update terakhir: 11 Mei 2026
						</p>
					</div>
				</header>

				<main className="space-y-8 text-foreground text-fluid-body leading-relaxed">
					<section className="space-y-3">
						<h2 className="text-fluid-h2 tracking-tight">
							1. Tentang Tetra Ops
						</h2>
						<p>
							Tetra Ops adalah sistem operasional internal yang dipakai tim
							Tetra Photobooth (Bogor, Indonesia) untuk mengelola booking
							event, jadwal crew, dan pembayaran klien. Aplikasi ini bukan
							layanan publik — hanya owner dan crew terverifikasi yang punya
							akses.
						</p>
					</section>

					<section className="space-y-3">
						<h2 className="text-fluid-h2 tracking-tight">
							2. Data yang Kami Akses
						</h2>
						<p>
							Saat lo authorize Tetra Ops via Google, aplikasi minta akses ke:
						</p>
						<ul className="ml-6 list-disc space-y-2 marker:text-muted-foreground">
							<li>
								<strong>Google Drive</strong> — untuk upload otomatis bukti
								transfer pembayaran ke folder Drive yang sudah ditentukan
								owner. Tetra Ops hanya membuat/membaca file di folder
								tersebut, tidak menyentuh file Drive lain di akun lo.
							</li>
							<li>
								<strong>Email + nama Google account</strong> — untuk
								identifikasi akun pemilik token (single owner account, bukan
								per-user login).
							</li>
						</ul>
					</section>

					<section className="space-y-3">
						<h2 className="text-fluid-h2 tracking-tight">
							3. Bagaimana Data Dipakai
						</h2>
						<ul className="ml-6 list-disc space-y-2 marker:text-muted-foreground">
							<li>
								<strong>Booking + event data</strong> (nama klien, tanggal,
								venue, dll.) disimpan di database Supabase milik Tetra
								Photobooth.
							</li>
							<li>
								<strong>File Drive</strong> (bukti transfer) tetap di akun
								Google Drive owner — Tetra Ops cuma upload + simpan link-nya.
							</li>
							<li>
								<strong>Refresh token</strong> disimpan terenkripsi di server
								(Vercel environment variables) sebagai kredensial untuk
								refresh access token. Token tidak pernah di-expose ke client.
							</li>
						</ul>
					</section>

					<section className="space-y-3">
						<h2 className="text-fluid-h2 tracking-tight">
							4. Sharing Data
						</h2>
						<p>
							Tetra Ops <strong>tidak menjual</strong>, menyewakan, atau
							membagikan data ke pihak ketiga untuk tujuan marketing atau
							analitik publik. Data hanya diakses oleh tim Tetra Photobooth
							(owner + crew terverifikasi) untuk operasional bisnis.
						</p>
						<p>
							Penyedia infrastruktur (Supabase, Vercel, Google Cloud) hanya
							memproses data sebagai bagian dari hosting/auth, tidak digunakan
							untuk tujuan lain.
						</p>
					</section>

					<section className="space-y-3">
						<h2 className="text-fluid-h2 tracking-tight">
							5. Retention &amp; Deletion
						</h2>
						<p>
							Data event disimpan selama relevan untuk operasional bisnis
							(audit + reporting). Lo bisa request penghapusan data dengan
							menghubungi kontak di bawah. Refresh token bisa di-revoke kapan
							saja via{" "}
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
							6. Cookies
						</h2>
						<p>
							Tetra Ops pakai cookies session-based dari Supabase Auth untuk
							login state. Tidak ada tracking cookie pihak ketiga (Google
							Analytics, Meta Pixel, dll.).
						</p>
					</section>

					<section className="space-y-3">
						<h2 className="text-fluid-h2 tracking-tight">
							7. Kontak
						</h2>
						<p>
							Pertanyaan atau request terkait privacy:{" "}
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
