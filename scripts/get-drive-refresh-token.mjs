#!/usr/bin/env node
// One-off helper: get a Google Drive OAuth refresh token for the org account
// (tetraphotobooth@gmail.com). Stores nothing — prints to stdout for manual
// paste into Vercel env vars.
//
// Usage (option A, env vars inline):
//   GOOGLE_DRIVE_CLIENT_ID=... GOOGLE_DRIVE_CLIENT_SECRET=... \
//     node scripts/get-drive-refresh-token.mjs
//
// Usage (option B, load from .env.local):
//   node --env-file=.env.local scripts/get-drive-refresh-token.mjs
//
// Add --copy flag to pipe refresh token directly to OS clipboard instead
// of printing to stdout — avoids leaking via terminal scrollback /
// screenshots. Recommended for production rotations.
//   node --env-file=.env.local scripts/get-drive-refresh-token.mjs --copy
//
// Steps before running:
//   1. Google Cloud Console → APIs & Services → Credentials
//      → Create OAuth client ID → Web application
//      → Authorized redirect URIs: http://localhost:53682/oauth2/callback
//   2. Copy Client ID + Secret, set as env when running this script.
//   3. Sign in as tetraphotobooth@gmail.com when the browser opens.
//   4. Paste the printed refresh_token + parent folder ID into Vercel env:
//        GOOGLE_DRIVE_CLIENT_ID
//        GOOGLE_DRIVE_CLIENT_SECRET
//        GOOGLE_DRIVE_REFRESH_TOKEN
//        GOOGLE_DRIVE_PARENT_FOLDER_ID  (manually create "Tetra Ops Events"
//                                         folder in Drive, copy its ID from URL)

import { spawn } from "node:child_process";
import http from "node:http";
import { URL } from "node:url";
import { OAuth2Client } from "google-auth-library";

const CLIENT_ID = process.env.GOOGLE_DRIVE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_DRIVE_CLIENT_SECRET;
const PORT = 53682;
const REDIRECT_URI = `http://localhost:${PORT}/oauth2/callback`;
// Pass --copy to skip terminal output and pipe refresh token to clipboard
// (macOS pbcopy / Linux xclip / Windows clip). Avoids leaking secrets via
// terminal scrollback or screenshots.
const COPY_TO_CLIPBOARD = process.argv.includes("--copy");

function copyToClipboard(text) {
	const cmd =
		process.platform === "darwin"
			? "pbcopy"
			: process.platform === "win32"
				? "clip"
				: "xclip"; // -selection clipboard handled by xclip default
	const p = spawn(cmd, process.platform === "linux" ? ["-selection", "clipboard"] : [], {
		stdio: ["pipe", "ignore", "ignore"],
	});
	p.stdin.end(text);
	return new Promise((resolve, reject) => {
		p.on("error", reject);
		p.on("exit", (code) =>
			code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`)),
		);
	});
}

if (!CLIENT_ID || !CLIENT_SECRET) {
	console.error(
		"❌ Set GOOGLE_DRIVE_CLIENT_ID + GOOGLE_DRIVE_CLIENT_SECRET env vars first.",
	);
	console.error("Example:");
	console.error(
		"  GOOGLE_DRIVE_CLIENT_ID=xxxxxx.apps.googleusercontent.com \\",
	);
	console.error("    GOOGLE_DRIVE_CLIENT_SECRET=GOCSPX-xxxxxxx \\");
	console.error("    node scripts/get-drive-refresh-token.mjs");
	process.exit(1);
}

const oauth2 = new OAuth2Client(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const authUrl = oauth2.generateAuthUrl({
	access_type: "offline",
	prompt: "consent",
	scope: ["https://www.googleapis.com/auth/drive"],
});

console.log("");
console.log("1. Buka URL ini di browser, sign-in sebagai tetraphotobooth@gmail.com:");
console.log("");
console.log(authUrl);
console.log("");
console.log(`2. Setelah authorize, browser akan redirect ke localhost:${PORT}.`);
console.log("3. Skrip ini akan otomatis tangkap auth code dan exchange jadi refresh token.");
console.log("");

const server = http.createServer(async (req, res) => {
	if (!req.url) return;
	const url = new URL(req.url, `http://localhost:${PORT}`);
	if (url.pathname !== "/oauth2/callback") {
		res.writeHead(404).end();
		return;
	}
	const code = url.searchParams.get("code");
	if (!code) {
		res.writeHead(400).end("Missing ?code");
		return;
	}
	res.writeHead(200, { "Content-Type": "text/html" });
	res.end(
		"<h2>Done. Kembali ke terminal.</h2><p>Refresh token sudah di-print. Tutup tab ini.</p>",
	);

	try {
		const { tokens } = await oauth2.getToken(code);
		const refreshToken = tokens.refresh_token;
		if (!refreshToken) {
			console.error(
				"❌ Refresh token MISSING — re-run with prompt=consent + revoke previous grant first.",
			);
			return;
		}
		if (COPY_TO_CLIPBOARD) {
			try {
				await copyToClipboard(refreshToken);
				console.log("");
				console.log(
					"✅ Refresh token copied to clipboard. Paste into Vercel env var GOOGLE_DRIVE_REFRESH_TOKEN.",
				);
				console.log("   (Token is NOT printed here — terminal-safe.)");
				console.log("");
			} catch (err) {
				console.error(
					"⚠ Clipboard copy failed:",
					err instanceof Error ? err.message : err,
				);
				console.error(
					"  Falling back to stdout (visible — careful with screenshots):",
				);
				console.log(`GOOGLE_DRIVE_REFRESH_TOKEN=${refreshToken}`);
			}
		} else {
			console.log("");
			console.log(
				"# === Drive OAuth tokens — paste these into Vercel env vars ===",
			);
			console.log(`GOOGLE_DRIVE_CLIENT_ID=${CLIENT_ID}`);
			console.log(`GOOGLE_DRIVE_CLIENT_SECRET=${CLIENT_SECRET}`);
			console.log(`GOOGLE_DRIVE_REFRESH_TOKEN=${refreshToken}`);
			console.log("");
			console.log(
				"# 💡 TIP: re-run with --copy flag to pipe token to clipboard",
			);
			console.log(
				"#        instead (terminal-safe; no token visible in output).",
			);
			console.log(
				"# Plus: create a parent folder in Drive (e.g. 'Tetra Ops Events'),",
			);
			console.log("# copy its ID from the URL (after /folders/), and set:");
			console.log("GOOGLE_DRIVE_PARENT_FOLDER_ID=<folder-id-here>");
			console.log("");
		}
	} catch (err) {
		console.error("Token exchange failed:", err);
	} finally {
		server.close();
	}
});

server.listen(PORT, () => {
	console.log(`Listening on http://localhost:${PORT} — waiting for callback…`);
});
