import { clearDriveAccessToken } from '../firebase';

const VELLUM_DRIVE_FOLDER_NAME = 'Vellum Workspace Media';
const DRIVE_FILES_API = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3/files';

let cachedFolderId: string | null = null;
const driveBlobUrlCache = new Map<string, string>();
const inFlightDownloads = new Map<string, Promise<string>>();

export interface UploadedDriveFile {
  id: string;
  name: string;
  mimeType: string;
  size: number;
}

export function clearDriveSessionCaches() {
  cachedFolderId = null;
  driveBlobUrlCache.forEach((url) => URL.revokeObjectURL(url));
  driveBlobUrlCache.clear();
  inFlightDownloads.clear();
}

function handleDriveResponseError(res: Response, fallbackMsg: string): never {
  if (res.status === 401) {
    clearDriveAccessToken();
    throw new Error('Google Drive session expired. Please reconnect your Google account.');
  }
  throw new Error(`${fallbackMsg} (${res.status})`);
}

export async function ensureVellumDriveFolder(accessToken: string): Promise<string> {
  if (cachedFolderId) return cachedFolderId;

  const q = encodeURIComponent(
    `name='${VELLUM_DRIVE_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`
  );
  const searchRes = await fetch(`${DRIVE_FILES_API}?q=${q}&fields=files(id,name)&pageSize=1`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!searchRes.ok) {
    handleDriveResponseError(searchRes, 'Failed to check Google Drive folder');
  }

  const searchData = (await searchRes.json()) as { files?: Array<{ id: string; name: string }> };
  if (searchData.files && searchData.files.length > 0) {
    cachedFolderId = searchData.files[0].id;
    return cachedFolderId;
  }

  const createRes = await fetch(`${DRIVE_FILES_API}?fields=id`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: VELLUM_DRIVE_FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
    }),
  });

  if (!createRes.ok) {
    handleDriveResponseError(createRes, 'Failed to create Google Drive folder');
  }

  const created = (await createRes.json()) as { id: string };
  cachedFolderId = created.id;
  return created.id;
}

/**
 * Uploads a File/Blob at 100% original quality using Google Drive resumable upload.
 */
export async function uploadFileToDrive(
  file: File | Blob,
  fileName: string,
  mimeType: string,
  accessToken: string
): Promise<UploadedDriveFile> {
  const folderId = await ensureVellumDriveFolder(accessToken);
  const safeMime = mimeType || 'application/octet-stream';

  const initRes = await fetch(
    `${DRIVE_UPLOAD_API}?uploadType=resumable&fields=id,name,mimeType,size`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': safeMime,
        'X-Upload-Content-Length': String(file.size),
      },
      body: JSON.stringify({
        name: fileName,
        parents: [folderId],
      }),
    }
  );

  if (!initRes.ok) {
    handleDriveResponseError(initRes, 'Failed to start Google Drive upload');
  }

  const uploadUrl = initRes.headers.get('Location');
  if (!uploadUrl) {
    throw new Error('Google Drive did not return an upload URL.');
  }

  const putRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': safeMime,
    },
    body: file,
  });

  if (!putRes.ok) {
    handleDriveResponseError(putRes, 'Failed to upload file to Google Drive');
  }

  const data = (await putRes.json()) as {
    id: string;
    name?: string;
    mimeType?: string;
    size?: string | number;
  };

  // Pre-cache an object URL immediately so the uploader sees it without re-downloading
  const objectUrl = URL.createObjectURL(file);
  driveBlobUrlCache.set(data.id, objectUrl);

  return {
    id: data.id,
    name: data.name || fileName,
    mimeType: data.mimeType || safeMime,
    size: Number(data.size || file.size),
  };
}

export async function fetchDriveFileObjectUrl(
  fileId: string,
  accessToken: string
): Promise<string> {
  const existing = driveBlobUrlCache.get(fileId);
  if (existing) return existing;

  const inflight = inFlightDownloads.get(fileId);
  if (inflight) return inflight;

  const promise = (async () => {
    try {
      const res = await fetch(`${DRIVE_FILES_API}/${encodeURIComponent(fileId)}?alt=media`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!res.ok) {
        handleDriveResponseError(res, 'Failed to download file from Google Drive');
      }

      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      driveBlobUrlCache.set(fileId, objUrl);
      return objUrl;
    } finally {
      inFlightDownloads.delete(fileId);
    }
  })();

  inFlightDownloads.set(fileId, promise);
  return promise;
}

/**
 * Permanently deletes a file from Google Drive.
 * IMPORTANT: Always present an explicit user confirmation modal before calling this.
 */
export async function deleteDriveFile(fileId: string, accessToken: string): Promise<void> {
  const res = await fetch(`${DRIVE_FILES_API}/${encodeURIComponent(fileId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok && res.status !== 404) {
    handleDriveResponseError(res, 'Failed to delete file from Google Drive');
  }

  const cachedUrl = driveBlobUrlCache.get(fileId);
  if (cachedUrl) {
    URL.revokeObjectURL(cachedUrl);
    driveBlobUrlCache.delete(fileId);
  }
}

export function extractDriveFileIdFromCover(coverImage: string | null | undefined): string | null {
  if (!coverImage || !coverImage.startsWith('drive:')) return null;
  const id = coverImage.slice('drive:'.length).trim();
  return id || null;
}
