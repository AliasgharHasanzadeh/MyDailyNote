import { clearDriveAccessToken } from '../googleAuth';
import type {
  Folder,
  Goal,
  Note,
  Task,
  WorkspacePreferences,
} from '../types/workspace';

export const VELLUM_ROOT_FOLDER_NAME = 'Vellum Workspace';
const VELLUM_MEDIA_SUBFOLDER_NAME = 'Media';
export const VELLUM_WORKSPACE_FILE_NAME = 'vellum-workspace.json';

const DRIVE_FILES_API = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3/files';

let cachedRootFolderId: string | null = null;
let cachedMediaFolderId: string | null = null;
const driveBlobUrlCache = new Map<string, string>();
const inFlightDownloads = new Map<string, Promise<string>>();

export type DriveSaveStatus = 'disconnected' | 'manual' | 'saving' | 'saved' | 'error';

export interface UploadedDriveFile {
  id: string;
  name: string;
  mimeType: string;
  size: number;
}

export interface DriveWorkspaceSnapshot {
  version: 1;
  updatedAt: string;
  folders: Folder[];
  notes: Note[];
  tasks: Task[];
  goals: Goal[];
  preferences: WorkspacePreferences;
}

export interface DriveWorkspaceReadResult {
  folderId: string;
  folderUrl: string | null;
  fileId: string | null;
  modifiedTime: string | null;
  data: DriveWorkspaceSnapshot | null;
}

export function clearDriveSessionCaches() {
  cachedRootFolderId = null;
  cachedMediaFolderId = null;
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

async function findFolderByName(
  name: string,
  accessToken: string,
  parentId?: string
): Promise<{ id: string; webViewLink?: string } | null> {
  const clauses = [
    `name='${name.replace(/'/g, "\\'")}'`,
    `mimeType='application/vnd.google-apps.folder'`,
    'trashed=false',
  ];
  if (parentId) {
    clauses.push(`'${parentId}' in parents`);
  }
  const q = encodeURIComponent(clauses.join(' and '));
  const res = await fetch(
    `${DRIVE_FILES_API}?q=${q}&fields=files(id,name,webViewLink)&pageSize=1`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  if (!res.ok) {
    handleDriveResponseError(res, 'Failed to check Google Drive folder');
  }
  const data = (await res.json()) as {
    files?: Array<{ id: string; name: string; webViewLink?: string }>;
  };
  return data.files && data.files.length > 0 ? data.files[0] : null;
}

async function createFolder(
  name: string,
  accessToken: string,
  parentId?: string
): Promise<{ id: string; webViewLink?: string }> {
  const body: Record<string, unknown> = {
    name,
    mimeType: 'application/vnd.google-apps.folder',
  };
  if (parentId) {
    body.parents = [parentId];
  }
  const res = await fetch(`${DRIVE_FILES_API}?fields=id,webViewLink`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    handleDriveResponseError(res, 'Failed to create Google Drive folder');
  }
  return (await res.json()) as { id: string; webViewLink?: string };
}

export async function ensureVellumWorkspaceFolder(accessToken: string): Promise<string> {
  if (cachedRootFolderId) return cachedRootFolderId;
  const existing = await findFolderByName(VELLUM_ROOT_FOLDER_NAME, accessToken);
  if (existing) {
    cachedRootFolderId = existing.id;
    return existing.id;
  }
  const created = await createFolder(VELLUM_ROOT_FOLDER_NAME, accessToken);
  cachedRootFolderId = created.id;
  return created.id;
}

export async function ensureVellumMediaFolder(accessToken: string): Promise<string> {
  if (cachedMediaFolderId) return cachedMediaFolderId;
  const rootId = await ensureVellumWorkspaceFolder(accessToken);
  const existing = await findFolderByName(VELLUM_MEDIA_SUBFOLDER_NAME, accessToken, rootId);
  if (existing) {
    cachedMediaFolderId = existing.id;
    return existing.id;
  }
  const created = await createFolder(VELLUM_MEDIA_SUBFOLDER_NAME, accessToken, rootId);
  cachedMediaFolderId = created.id;
  return created.id;
}

/**
 * Read-only lookup and download of Vellum Workspace/vellum-workspace.json from Google Drive.
 * Does NOT create or mutate any files on Google Drive.
 */
export async function readWorkspaceFromDrive(
  accessToken: string
): Promise<DriveWorkspaceReadResult | null> {
  const folder = await findFolderByName(VELLUM_ROOT_FOLDER_NAME, accessToken);
  if (!folder) {
    return null;
  }
  cachedRootFolderId = folder.id;

  const q = encodeURIComponent(
    `name='${VELLUM_WORKSPACE_FILE_NAME}' and '${folder.id}' in parents and trashed=false`
  );
  const searchRes = await fetch(
    `${DRIVE_FILES_API}?q=${q}&fields=files(id,name,modifiedTime)&pageSize=1`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  if (!searchRes.ok) {
    handleDriveResponseError(searchRes, 'Failed to locate workspace file in Google Drive');
  }
  const searchData = (await searchRes.json()) as {
    files?: Array<{ id: string; name: string; modifiedTime?: string }>;
  };

  const fileMeta = searchData.files?.[0];
  if (!fileMeta) {
    return {
      folderId: folder.id,
      folderUrl: folder.webViewLink || null,
      fileId: null,
      modifiedTime: null,
      data: null,
    };
  }

  const contentRes = await fetch(
    `${DRIVE_FILES_API}/${encodeURIComponent(fileMeta.id)}?alt=media`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  if (!contentRes.ok) {
    handleDriveResponseError(contentRes, 'Failed to read workspace data from Google Drive');
  }

  const parsed = (await contentRes.json()) as Partial<DriveWorkspaceSnapshot>;
  const data: DriveWorkspaceSnapshot = {
    version: 1,
    updatedAt: parsed.updatedAt || fileMeta.modifiedTime || new Date().toISOString(),
    folders: Array.isArray(parsed.folders) ? parsed.folders : [],
    notes: Array.isArray(parsed.notes) ? parsed.notes : [],
    tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
    goals: Array.isArray(parsed.goals) ? parsed.goals : [],
    preferences: parsed.preferences || {
      id: 'default',
      theme: 'dark',
      calendarLocale: 'en',
      rightSidebarOpen: true,
      leftSidebarCollapsed: false,
      leftSidebarWidth: 272,
      notesViewMode: 'list',
      journalViewMode: 'calendar',
      taskViewMode: 'list',
      activeNoteId: null,
      activeSection: 'dashboard',
      activeFolderId: null,
    },
  };

  return {
    folderId: folder.id,
    folderUrl: folder.webViewLink || null,
    fileId: fileMeta.id,
    modifiedTime: fileMeta.modifiedTime || data.updatedAt,
    data,
  };
}

/**
 * Creates or updates Vellum Workspace/vellum-workspace.json in Google Drive.
 * IMPORTANT: Always present an explicit user confirmation modal before calling this.
 */
export async function saveWorkspaceToDrive(
  payload: Omit<DriveWorkspaceSnapshot, 'version' | 'updatedAt'>,
  accessToken: string,
  existingFileId?: string | null
): Promise<{ folderId: string; folderUrl: string | null; fileId: string; modifiedTime: string }> {
  const folderId = await ensureVellumWorkspaceFolder(accessToken);

  let targetFileId = existingFileId || null;
  if (!targetFileId) {
    const q = encodeURIComponent(
      `name='${VELLUM_WORKSPACE_FILE_NAME}' and '${folderId}' in parents and trashed=false`
    );
    const checkRes = await fetch(`${DRIVE_FILES_API}?q=${q}&fields=files(id)&pageSize=1`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (checkRes.ok) {
      const checkData = (await checkRes.json()) as { files?: Array<{ id: string }> };
      targetFileId = checkData.files?.[0]?.id || null;
    }
  }

  const snapshot: DriveWorkspaceSnapshot = {
    version: 1,
    updatedAt: new Date().toISOString(),
    folders: payload.folders,
    notes: payload.notes,
    tasks: payload.tasks,
    goals: payload.goals,
    preferences: payload.preferences,
  };
  const jsonBlob = new Blob([JSON.stringify(snapshot, null, 2)], {
    type: 'application/json',
  });

  const endpoint = targetFileId
    ? `${DRIVE_UPLOAD_API}/${encodeURIComponent(targetFileId)}?uploadType=resumable&fields=id,modifiedTime`
    : `${DRIVE_UPLOAD_API}?uploadType=resumable&fields=id,modifiedTime`;

  const metadata = targetFileId
    ? { name: VELLUM_WORKSPACE_FILE_NAME, mimeType: 'application/json' }
    : { name: VELLUM_WORKSPACE_FILE_NAME, mimeType: 'application/json', parents: [folderId] };

  const initRes = await fetch(endpoint, {
    method: targetFileId ? 'PATCH' : 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': 'application/json',
      'X-Upload-Content-Length': String(jsonBlob.size),
    },
    body: JSON.stringify(metadata),
  });

  if (!initRes.ok) {
    handleDriveResponseError(initRes, 'Failed to start workspace upload to Google Drive');
  }

  const uploadUrl = initRes.headers.get('Location');
  if (!uploadUrl) {
    throw new Error('Google Drive did not return an upload URL.');
  }

  const putRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: jsonBlob,
  });

  if (!putRes.ok) {
    handleDriveResponseError(putRes, 'Failed to save workspace file to Google Drive');
  }

  const saved = (await putRes.json()) as { id: string; modifiedTime?: string };
  const folderMeta = await findFolderByName(VELLUM_ROOT_FOLDER_NAME, accessToken);

  return {
    folderId,
    folderUrl: folderMeta?.webViewLink || null,
    fileId: saved.id,
    modifiedTime: saved.modifiedTime || snapshot.updatedAt,
  };
}

/**
 * Uploads a File/Blob at 100% original quality into Google Drive › Vellum Workspace › Media.
 */
export async function uploadFileToDrive(
  file: File | Blob,
  fileName: string,
  mimeType: string,
  accessToken: string
): Promise<UploadedDriveFile> {
  const folderId = await ensureVellumMediaFolder(accessToken);
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
