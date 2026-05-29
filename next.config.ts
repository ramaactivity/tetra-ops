import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	// Enable React 19.2 + browser View Transitions API.
	// Used by <SharedElement> and <PageTransition> at src/components/transitions/.
	// Per docs/04a_MOTION_GUIDELINES.md: zero-JS-bloat motion strategy.
	experimental: {
		viewTransition: true,
	},
	// Master-data master-data dipindah keluar dari /settings ke lokasi yang lebih
	// logis (Operations / Finance / Kontak). Redirect permanen (308) supaya
	// bookmark & link lama tetap jalan. Tiap rute butuh entri base + `/:path*`
	// untuk nge-cover sub-route (new, [id]/edit, dst).
	redirects: async () => {
		const moves: Array<[string, string]> = [
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
