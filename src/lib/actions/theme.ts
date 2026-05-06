"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

export type Theme = "dark" | "light";

const THEME_COOKIE = "theme";
const ONE_YEAR = 60 * 60 * 24 * 365;

export async function toggleTheme(current: Theme) {
	const next: Theme = current === "dark" ? "light" : "dark";
	const cookieStore = await cookies();
	cookieStore.set(THEME_COOKIE, next, {
		maxAge: ONE_YEAR,
		path: "/",
		sameSite: "lax",
	});
	revalidatePath("/", "layout");
}
