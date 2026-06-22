/**
 * Build a Google Drive thumbnail URL from a file id or a webViewLink.
 *
 * Drive's `webViewLink` (`https://drive.google.com/file/d/<ID>/view?...`) opens
 * the Drive viewer — it's not usable as an <img src>. The thumbnail endpoint
 * (`/thumbnail?id=<ID>&sz=w<px>`) renders a real image (and a first-page preview
 * for PDFs), which works for files shared "anyone with link" — exactly how
 * uploadFileToFolder() shares rekap proofs. No server-only deps here so it's
 * safe to import in client components.
 */

/** Pull the Drive file id out of a webViewLink, a thumbnail URL, or a bare id. */
export function driveFileId(urlOrId: string | null | undefined): string | null {
	if (!urlOrId) return null;
	const byPath = urlOrId.match(/\/file\/d\/([^/?#]+)/);
	if (byPath) return byPath[1];
	const byQuery = urlOrId.match(/[?&]id=([^&]+)/);
	if (byQuery) return byQuery[1];
	// Looks like a bare id already (no protocol / path separators).
	if (!urlOrId.includes("/") && !urlOrId.includes(":")) return urlOrId;
	return null;
}

export function driveThumbnailUrl(
	urlOrId: string | null | undefined,
	sizePx = 400,
): string | null {
	const id = driveFileId(urlOrId);
	return id
		? `https://drive.google.com/thumbnail?id=${id}&sz=w${sizePx}`
		: null;
}
