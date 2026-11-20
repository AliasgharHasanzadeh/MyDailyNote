import { Cloud, FileUp, Image as ImageIcon, Link2, Music, Upload, Video, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { uploadFileToDrive } from '../../db/googleDrive';
import { db } from '../../db/storage';
import {
  auth,
  getDriveAccessToken,
  googleSignIn,
  subscribeDriveAccessToken,
} from '../../googleAuth';
import { formatFileSize } from '../../utils/date';
import { GoogleSignInButton } from '../GoogleSignInButton';
import type { MediaKind } from './blockCommands';

interface MediaInsertDialogProps {
  kind: MediaKind;
  onClose: () => void;
  onInsert: (attrs: Record<string, unknown>) => void;
}

const KIND_META: Record<
  MediaKind,
  { title: string; accept: string; urlPlaceholder: string; icon: typeof ImageIcon; allowUrl: boolean }
> = {
  image: {
    title: 'Insert Image',
    accept: 'image/*',
    urlPlaceholder: 'https://example.com/photo.jpg',
    icon: ImageIcon,
    allowUrl: true,
  },
  audio: {
    title: 'Insert Audio',
    accept: 'audio/*',
    urlPlaceholder: 'https://example.com/track.mp3',
    icon: Music,
    allowUrl: true,
  },
  video: {
    title: 'Embed Video',
    accept: 'video/*',
    urlPlaceholder: 'https://www.youtube.com/watch?v=... or Vimeo URL',
    icon: Video,
    allowUrl: true,
  },
  file: {
    title: 'Attach File',
    accept: '*/*',
    urlPlaceholder: '',
    icon: FileUp,
    allowUrl: false,
  },
};

export function MediaInsertDialog({ kind, onClose, onInsert }: MediaInsertDialogProps) {
  const meta = KIND_META[kind];
  const Icon = meta.icon;
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [driveToken, setDriveToken] = useState<string | null>(() => getDriveAccessToken());
  const [connectingDrive, setConnectingDrive] = useState(false);

  useEffect(() => {
    return subscribeDriveAccessToken((token) => setDriveToken(token));
  }, []);

  const handleConnectDrive = async () => {
    setUploadError(null);
    setConnectingDrive(true);
    try {
      await googleSignIn();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Unable to connect Google Drive.');
    } finally {
      setConnectingDrive(false);
    }
  };

  const commitFileUpload = async (file: File) => {
    setUploadError(null);
    setUploading(true);
    try {
      const localAsset = await db.saveMediaFile(file);
      let driveFileId: string | null = null;

      const currentToken = getDriveAccessToken();
      if (currentToken) {
        const uploaded = await uploadFileToDrive(
          file,
          file.name,
          file.type || 'application/octet-stream',
          currentToken
        );
        driveFileId = uploaded.id;
      }

      if (kind === 'image') {
        onInsert({ mediaId: localAsset.id, driveFileId, caption: '', width: 'standard' });
      } else if (kind === 'audio') {
        onInsert({
          mediaId: localAsset.id,
          driveFileId,
          title: file.name.replace(/\.[^.]+$/, ''),
        });
      } else if (kind === 'video') {
        onInsert({ mediaId: localAsset.id, driveFileId, caption: file.name });
      } else {
        onInsert({
          mediaId: localAsset.id,
          driveFileId,
          fileName: localAsset.name,
          fileSize: localAsset.size,
          mimeType: localAsset.mimeType,
        });
      }
      onClose();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Failed to upload file.');
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    if (getDriveAccessToken()) {
      // Stage for explicit user confirmation before uploading to Google Drive
      setPendingFile(file);
    } else {
      void commitFileUpload(file);
    }
  };

  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) return;
    if (kind === 'image') {
      onInsert({ src: trimmed, caption: title.trim(), width: 'standard' });
    } else if (kind === 'audio') {
      onInsert({ src: trimmed, title: title.trim() || 'Audio Track' });
    } else if (kind === 'video') {
      onInsert({ src: trimmed, caption: title.trim() });
    }
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 shadow-[var(--shadow-popover)]"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)]">
              <Icon className="h-4 w-4" />
            </div>
            <h3 className="font-display text-base font-semibold text-[var(--text-primary)]">
              {meta.title}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 space-y-4">
          {!driveToken && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
              <div className="flex items-center gap-2 text-xs text-amber-800 dark:text-amber-200">
                <Cloud className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <span>
                  {auth.currentUser
                    ? 'Reconnect Google Drive first — otherwise media only stays in temporary browser cache.'
                    : 'Connect Google Drive first so media is saved permanently at full quality.'}
                </span>
              </div>
              <GoogleSignInButton
                label={
                  connectingDrive
                    ? 'Connecting...'
                    : auth.currentUser
                    ? 'Reconnect Drive'
                    : 'Connect Google Drive'
                }
                disabled={connectingDrive}
                onClick={handleConnectDrive}
              />
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept={meta.accept}
            onChange={handleFileChange}
            className="hidden"
          />

          {pendingFile ? (
            <div className="rounded-xl border border-[var(--accent)]/40 bg-[var(--bg-canvas)] p-4 space-y-3">
              <div className="space-y-1">
                <div className="text-xs font-semibold text-[var(--text-primary)] truncate">
                  {pendingFile.name}
                </div>
                <div className="text-[11px] text-[var(--text-muted)]">
                  {formatFileSize(pendingFile.size)} · Upload at 100% original quality to{' '}
                  <span className="font-medium text-[var(--text-secondary)]">
                    Google Drive › Vellum Workspace › Media
                  </span>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => {
                    setPendingFile(null);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                  className="rounded-lg border border-[var(--border-subtle)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] cursor-pointer disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => commitFileUpload(pendingFile)}
                  className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3.5 py-1.5 text-xs font-medium text-white hover:bg-[var(--accent-hover)] cursor-pointer disabled:opacity-50"
                >
                  <Upload className="h-3.5 w-3.5" />
                  {uploading ? 'Uploading...' : 'Confirm Upload & Insert'}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--border-strong)] bg-[var(--bg-secondary)]/50 px-4 py-7 text-center transition-colors hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]/30 cursor-pointer disabled:opacity-60"
            >
              <Upload className="h-5 w-5 text-[var(--accent)]" />
              <span className="text-sm font-medium text-[var(--text-primary)]">
                {uploading ? 'Saving to temporary cache...' : 'Upload from your device'}
              </span>
              <span className="text-xs text-[var(--text-muted)]">
                {driveToken
                  ? 'Saves at 100% original quality in Google Drive › Vellum Workspace › Media'
                  : 'Warning: Drive not connected (temporary browser cache only)'}
              </span>
            </button>
          )}

          {uploadError && (
            <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
              {uploadError}
            </p>
          )}

          {meta.allowUrl && !pendingFile && (
            <form
              onSubmit={handleUrlSubmit}
              className="space-y-3 border-t border-[var(--border-subtle)] pt-4"
            >
              <label className="block text-xs font-medium text-[var(--text-secondary)]">
                Or embed from URL
              </label>
              <div className="flex items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-2">
                <Link2 className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder={meta.urlPlaceholder}
                  className="w-full bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
                />
              </div>
              {kind === 'audio' && (
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Optional track title"
                  className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
                />
              )}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg px-3.5 py-2 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!url.trim()}
                  className="rounded-lg bg-[var(--accent)] px-4 py-2 text-xs font-medium text-white hover:bg-[var(--accent-hover)] disabled:opacity-40 cursor-pointer"
                >
                  Insert
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
