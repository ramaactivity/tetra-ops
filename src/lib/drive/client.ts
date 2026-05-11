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
