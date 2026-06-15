import "server-only";
import { Readable } from "node:stream";
import { type drive_v3, drive as driveApi } from "@googleapis/drive";
import { OAuth2Client } from "google-auth-library";

let cachedAccessToken: { token: string; expiresAt: number } | null = null;

function getRequiredEnv(): {
	clientId?: string;
	clientSecret?: string;
	refreshToken?: string;
	parentFolderId?: string;
	missing: string[];
} {
	const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID;
	const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET;
	const refreshToken = process.env.GOOGLE_DRIVE_REFRESH_TOKEN;
	const parentFolderId = process.env.GOOGLE_DRIVE_PARENT_FOLDER_ID;

	const missing: string[] = [];
	if (!clientId) missing.push("GOOGLE_DRIVE_CLIENT_ID");
	if (!clientSecret) missing.push("GOOGLE_DRIVE_CLIENT_SECRET");
	if (!refreshToken) missing.push("GOOGLE_DRIVE_REFRESH_TOKEN");
	if (!parentFolderId) missing.push("GOOGLE_DRIVE_PARENT_FOLDER_ID");

	return { clientId, clientSecret, refreshToken, parentFolderId, missing };
}

export function isDriveConfigured(): boolean {
	return getRequiredEnv().missing.length === 0;
}

export function getDriveConfigErrors(): string[] {
	return getRequiredEnv().missing;
}

export function getParentFolderId(): string | null {
	return process.env.GOOGLE_DRIVE_PARENT_FOLDER_ID ?? null;
}

function getOAuthClient(): OAuth2Client {
	const env = getRequiredEnv();
	if (env.missing.length > 0) {
		throw new Error(
			`Drive not configured. Missing env: ${env.missing.join(", ")}`,
		);
	}
	const oauth2 = new OAuth2Client(env.clientId, env.clientSecret);
	oauth2.setCredentials({ refresh_token: env.refreshToken });
	return oauth2;
}

async function getAccessToken(): Promise<string> {
	const now = Date.now();
	if (cachedAccessToken && cachedAccessToken.expiresAt > now + 60_000) {
		return cachedAccessToken.token;
	}
	const oauth2 = getOAuthClient();
	const res = await oauth2.getAccessToken();
	if (!res.token) throw new Error("Failed to refresh Drive access token");
	cachedAccessToken = {
		token: res.token,
		expiresAt: now + 55 * 60 * 1000,
	};
	return res.token;
}

export async function getDriveClient(): Promise<drive_v3.Drive> {
	const oauth2 = getOAuthClient();
	await getAccessToken();
	return driveApi({ version: "v3", auth: oauth2 });
}

export type CreatedFolder = {
	id: string;
	name: string;
	webViewLink: string;
};

export async function createDriveFolder(
	name: string,
	parentFolderId?: string,
): Promise<CreatedFolder> {
	const drive = await getDriveClient();
	const parents = [parentFolderId ?? getParentFolderId()].filter(
		(v): v is string => Boolean(v),
	);

	const res = await drive.files.create({
		requestBody: {
			name,
			mimeType: "application/vnd.google-apps.folder",
			parents,
		},
		fields: "id, name, webViewLink",
		supportsAllDrives: true,
	});

	const id = res.data.id;
	const webViewLink = res.data.webViewLink;
	const resolvedName = res.data.name;
	if (!id || !webViewLink || !resolvedName) {
		throw new Error("Drive folder created but response missing id/url/name");
	}
	return { id, name: resolvedName, webViewLink };
}

export async function getFolderWebViewLink(
	folderId: string,
): Promise<string | null> {
	try {
		const drive = await getDriveClient();
		const res = await drive.files.get({
			fileId: folderId,
			fields: "id, webViewLink",
			supportsAllDrives: true,
		});
		return res.data.webViewLink ?? null;
	} catch {
		return null;
	}
}

const MONTHS_ID = [
	"Januari",
	"Februari",
	"Maret",
	"April",
	"Mei",
	"Juni",
	"Juli",
	"Agustus",
	"September",
	"Oktober",
	"November",
	"Desember",
];

function sanitizeFolderName(raw: string, maxLen = 80): string {
	return (
		raw
			.replace(/[\\/:*?"<>|]/g, " ")
			.replace(/\s+/g, " ")
			.trim()
			.slice(0, maxLen) || "Event"
	);
}

/** Find a folder by exact name under a parent, or create it. Idempotent. */
export async function ensureFolder(
	name: string,
	parentFolderId: string,
): Promise<CreatedFolder> {
	const drive = await getDriveClient();
	const escaped = name.replace(/'/g, "\\'");
	const res = await drive.files.list({
		q: `name = '${escaped}' and '${parentFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
		fields: "files(id, name, webViewLink)",
		pageSize: 1,
		supportsAllDrives: true,
		includeItemsFromAllDrives: true,
	});
	const found = res.data.files?.[0];
	if (found?.id && found.webViewLink && found.name) {
		return { id: found.id, name: found.name, webViewLink: found.webViewLink };
	}
	return createDriveFolder(name, parentFolderId);
}

/**
 * Find-or-create the human-friendly event folder tree:
 *   Parent / <Year> / <MM — Month> / <Event Name — d Month yyyy>
 * Year/month folders are reused across events. Returns the event folder.
 */
export async function ensureEventTree(event: {
	clientName: string;
	eventDate: string | null;
}): Promise<CreatedFolder> {
	const parent = getParentFolderId();
	if (!parent) throw new Error("GOOGLE_DRIVE_PARENT_FOLDER_ID missing");

	const d = event.eventDate ? new Date(`${event.eventDate}T00:00:00`) : null;
	const valid = d != null && !Number.isNaN(d.getTime());

	const yearName = valid ? String((d as Date).getFullYear()) : "Tanpa Tanggal";
	const yearFolder = await ensureFolder(yearName, parent);

	let monthParentId = yearFolder.id;
	let datePart = "";
	if (valid) {
		const dd = d as Date;
		const mm = String(dd.getMonth() + 1).padStart(2, "0");
		const monthFolder = await ensureFolder(
			`${mm} — ${MONTHS_ID[dd.getMonth()]}`,
			yearFolder.id,
		);
		monthParentId = monthFolder.id;
		datePart = ` — ${dd.getDate()} ${MONTHS_ID[dd.getMonth()]} ${dd.getFullYear()}`;
	}

	const folderName = `${sanitizeFolderName(event.clientName)}${datePart}`;
	return ensureFolder(folderName, monthParentId);
}

/**
 * Find-or-create folder bulanan untuk Nota Manual:
 *   Parent / Arsip Nota Manual / <Year> / <MM - Month>
 * Folder dipisah per BULAN UPLOAD (bukan tanggal nota) sesuai kebutuhan arsip.
 * Idempotent (reuse folder yang sudah ada). Return folder bulan tujuan.
 */
export async function ensureManualNotaMonthFolder(
	uploadDate: Date = new Date(),
): Promise<CreatedFolder> {
	const parent = getParentFolderId();
	if (!parent) throw new Error("GOOGLE_DRIVE_PARENT_FOLDER_ID missing");

	const root = await ensureFolder("Arsip Nota Manual", parent);
	const yearFolder = await ensureFolder(String(uploadDate.getFullYear()), root.id);
	const mm = String(uploadDate.getMonth() + 1).padStart(2, "0");
	return ensureFolder(`${mm} - ${MONTHS_ID[uploadDate.getMonth()]}`, yearFolder.id);
}

/** Count non-folder files directly in a folder (used for footage status). */
export async function countFolderFiles(folderId: string): Promise<number> {
	try {
		const drive = await getDriveClient();
		const res = await drive.files.list({
			q: `'${folderId}' in parents and trashed = false and mimeType != 'application/vnd.google-apps.folder'`,
			fields: "files(id)",
			pageSize: 1000,
			supportsAllDrives: true,
			includeItemsFromAllDrives: true,
		});
		return res.data.files?.length ?? 0;
	} catch {
		return 0;
	}
}

export type UploadedFile = {
	id: string;
	name: string;
	webViewLink: string;
	mimeType: string;
};

/**
 * Upload a single file into the given Drive folder. Auto-makes the file
 * shareable (anyone with link → viewer) so the saved webViewLink works
 * for clients receiving the URL outside the team.
 */
export async function uploadFileToFolder(
	folderId: string,
	fileName: string,
	mimeType: string,
	body: Buffer,
): Promise<UploadedFile> {
	const drive = await getDriveClient();

	const res = await drive.files.create({
		requestBody: {
			name: fileName,
			parents: [folderId],
			mimeType,
		},
		media: {
			mimeType,
			body: bufferToReadable(body),
		},
		fields: "id, name, mimeType, webViewLink",
		supportsAllDrives: true,
	});

	const id = res.data.id;
	const webViewLink = res.data.webViewLink;
	const resolvedName = res.data.name;
	const resolvedMime = res.data.mimeType;
	if (!id || !webViewLink || !resolvedName) {
		throw new Error("Drive upload succeeded but response missing id/url/name");
	}

	// Make link-accessible (anyone with link → reader)
	try {
		await drive.permissions.create({
			fileId: id,
			requestBody: { role: "reader", type: "anyone" },
			supportsAllDrives: true,
		});
	} catch {
		// Permissions failure non-fatal — file still uploaded; URL works for
		// authenticated Drive users. Client can manually share later.
	}

	return {
		id,
		name: resolvedName,
		webViewLink,
		mimeType: resolvedMime ?? mimeType,
	};
}

function bufferToReadable(buf: Buffer): Readable {
	return Readable.from(buf);
}
