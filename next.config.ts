import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	// Enable React 19.2 + browser View Transitions API.
	// Used by <SharedElement> and <PageTransition> at src/components/transitions/.
	// Per docs/04a_MOTION_GUIDELINES.md: zero-JS-bloat motion strategy.
	experimental: {
		viewTransition: true,
	},
};

export default nextConfig;
