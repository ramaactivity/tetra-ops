"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Google OAuth sign-in button.
 *
 * A2 refactor (sesi 5): glow-crimson on idle, press-down on tap, fluid
 * type. No native confirm/alert — error renders inline.
 */
export function LoginButton({
	label = "Masuk dengan Google",
}: {
	label?: string;
}) {
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function signInWithGoogle() {
		setLoading(true);
		setError(null);
		const supabase = createClient();
		const { error: oauthError } = await supabase.auth.signInWithOAuth({
			provider: "google",
			options: {
				redirectTo: `${window.location.origin}/auth/callback`,
				queryParams: {
					// `access_type=offline` → minta refresh_token dari Google supaya
					// session bisa diperpanjang otomatis berhari-hari tanpa user
					// perlu login ulang.
					access_type: "offline",
					// `prompt` SENGAJA DIKOSONGKAN — kalau user sudah login Google
					// (sebagian besar staff), Google auto-login tanpa account picker.
					// Sebelumnya `prompt: "select_account"` selalu paksa picker
					// muncul → user feel "harus login lagi tiap kali" walaupun
					// session cookie masih valid.
				},
			},
		});
		if (oauthError) {
			setError(oauthError.message);
			setLoading(false);
		}
		// On success, browser navigates to Google. Keep loading state.
	}

	return (
		<>
			<button
				type="button"
				onClick={signInWithGoogle}
				disabled={loading}
				aria-busy={loading}
				className="press-down relative flex h-12 w-full items-center justify-center gap-3 rounded-full bg-primary text-fluid-body font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-progress disabled:opacity-90"
			>
				{loading ? (
					<>
						<Loader2 className="size-4 animate-spin" />
						<span>Mengarahkan ke Google…</span>
					</>
				) : (
					<>
						<GoogleIcon />
						<span>{label}</span>
					</>
				)}
			</button>
			{error && (
				<p className="text-center text-fluid-caption text-destructive">
					{error}
				</p>
			)}
		</>
	);
}

function GoogleIcon() {
	return (
		<svg
			width="18"
			height="18"
			viewBox="0 0 18 18"
			xmlns="http://www.w3.org/2000/svg"
			aria-hidden="true"
		>
			<path
				d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
				fill="#4285F4"
			/>
			<path
				d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
				fill="#34A853"
			/>
			<path
				d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z"
				fill="#FBBC05"
			/>
			<path
				d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.167 6.656 3.58 9 3.58z"
				fill="#EA4335"
			/>
		</svg>
	);
}
