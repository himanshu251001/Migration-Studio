import type { NextConfig } from 'next';
import path from 'node:path';

/**
 * The IDE (Code - OSS) embeds this app in an iframe served from a loopback origin.
 * Embedding is allowed for the workbench origin only (no X-Frame-Options).
 */
const config: NextConfig = {
	output: 'standalone',
	devIndicators: false,
	turbopack: { root: path.resolve(__dirname) },
	async headers() {
		return [{
			source: '/:path*',
			headers: [
				{ key: 'Content-Security-Policy', value: "frame-ancestors 'self' vscode-file://vscode-app" },
				{ key: 'Cache-Control', value: 'no-store' }
			]
		}];
	}
};

export default config;
