import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	// Enable React 19.2 + browser View Transitions API.
	// Used by <SharedElement> and <PageTransition> at src/components/transitions/.
	// Per docs/04a_MOTION_GUIDELINES.md: zero-JS-bloat motion strategy.
	experimental: {
		viewTransition: true,
		// Barrel-import optimization: rewrite `import { X } from "pkg"` into deep
		// path imports so the bundler only ships the icons/primitives actually
		// used, not the whole package. Cuts client JS + speeds compile across the
		// ~166 client components. lucide-react/date-fns are in Next's defaults,
		// but radix-ui (unified meta-package) + @base-ui/react are NOT — listing
		// explicitly guarantees coverage.
		optimizePackageImports: [
			"lucide-react",
			"radix-ui",
			"@base-ui/react",
			"date-fns",
		],
	},
	// Master-data master-data dipindah keluar dari /settings ke lokasi yang lebih
	// logis (Operations / Finance / Kontak). Redirect permanen (308) supaya
	// bookmark & link lama tetap jalan. Tiap rute butuh entri base + `/:path*`
	// untuk nge-cover sub-route (new, [id]/edit, dst).
	redirects: async () => {
		const moves: Array<[string, string]> = [
			// Rekap Mapping di-retire (Phase 3) — HPP kini dari snapshot kanonik.
			["/warehouse/rekap-mapping", "/warehouse"],
			// Legacy settlement routes di-retire (Phase 4) — settlement via /rekap.
			["/operations/:projectId/settle", "/operations/:projectId/rekap"],
			["/operations/:projectId/tutup-buku", "/operations/:projectId/rekap"],
			["/settings/packages", "/operations/packages"],
			["/settings/addons", "/operations/addons"],
			["/settings/backdrops", "/operations/backdrops"],
			["/settings/bank-accounts", "/finance/bank-accounts"],
			["/settings/sinking-funds", "/finance/sinking-funds"],
			["/settings/vendors", "/vendors"],
			["/settings/contacts", "/contacts"],
		];
		return moves.flatMap(([source, destination]) => [
			{ source, destination, permanent: true },
			{
				source: `${source}/:path*`,
				destination: `${destination}/:path*`,
				permanent: true,
			},
		]);
	},
};

export default nextConfig;
