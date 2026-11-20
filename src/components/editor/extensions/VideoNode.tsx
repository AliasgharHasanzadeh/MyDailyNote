import { mergeAttributes, Node } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { Cloud, Trash2, Video } from 'lucide-react';
import { useState } from 'react';
import { deleteDriveFile } from '../../../db/googleDrive';
import { getDriveAccessToken } from '../../../googleAuth';
import { DriveConfirmDeleteModal } from '../../DriveConfirmDeleteModal';
import { useMediaUrl } from './useMediaUrl';

function toEmbedUrl(raw: string): string | null {
  try {
    const parsed = new URL(raw);
    if (parsed.hostname.includes('youtube.com')) {
      const v = parsed.searchParams.get('v');
      if (v) return `https://www.youtube.com/embed/${v}`;
      if (parsed.pathname.startsWith('/embed/')) return raw;
    }
    if (parsed.hostname.includes('youtu.be')) {
      const id = parsed.pathname.replace('/', '');
      if (id) return `https://www.youtube.com/embed/${id}`;
    }
    if (parsed.hostname.includes('vimeo.com')) {
      const id = parsed.pathname.split('/').filter(Boolean).pop();
      if (id) return `https://player.vimeo.com/video/${id}`;
    }
    if (parsed.hostname.includes('loom.com') && parsed.pathname.includes('/share/')) {
      return raw.replace('/share/', '/embed/');
    }
    return null;
  } catch {
    return null;
  }
}

function VideoBlockView({ node, deleteNode, selected }: NodeViewProps) {
  const mediaId = node.attrs.mediaId as string | null;
  const driveFileId = node.attrs.driveFileId as string | null;
  const src = (node.attrs.src as string | null) || '';
  const caption = (node.attrs.caption as string) || '';
  const { url, loading, needsDriveAuth, connectDrive } = useMediaUrl(
    mediaId,
    src,
    driveFileId
  );
  const [confirmDriveDelete, setConfirmDriveDelete] = useState(false);
  const [deletingDrive, setDeletingDrive] = useState(false);

  const embedUrl = !mediaId && !driveFileId && src ? toEmbedUrl(src) : null;

  const handleConfirmDriveDelete = async () => {
    const token = getDriveAccessToken();
    if (!driveFileId || !token) {
      setConfirmDriveDelete(false);
      return;
    }
    setDeletingDrive(true);
    try {
      await deleteDriveFile(driveFileId, token);
      setConfirmDriveDelete(false);
      deleteNode();
    } finally {
      setDeletingDrive(false);
    }
  };

  return (
    <NodeViewWrapper className="my-4" data-type="videoBlock">
      <div
        contentEditable={false}
        className={`group relative overflow-hidden rounded-xl border ${
          selected
            ? 'border-[var(--accent)] ring-2 ring-[var(--accent-soft)]'
            : 'border-[var(--border-subtle)] bg-[var(--bg-secondary)]'
        }`}
      >
        <div className="absolute right-2.5 top-2.5 z-10 flex items-center gap-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)]/90 p-1 opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100">
          {driveFileId && getDriveAccessToken() && (
            <button
              type="button"
              onClick={() => setConfirmDriveDelete(true)}
              title="Delete from Google Drive"
              className="rounded-md px-2 py-1 text-[11px] font-medium text-red-400 hover:bg-red-500/10 cursor-pointer"
            >
              Delete Drive file
            </button>
          )}
          <button
            type="button"
            onClick={deleteNode}
            title="Remove video from note"
            className="rounded-md p-1.5 text-[var(--text-secondary)] hover:text-red-500 cursor-pointer"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>

        {loading ? (
          <div className="flex h-56 items-center justify-center text-xs text-[var(--text-muted)]">
            Loading video...
          </div>
        ) : needsDriveAuth ? (
          <div className="flex h-48 flex-col items-center justify-center gap-2.5 px-4 text-center">
            <Cloud className="h-6 w-6 text-[var(--accent)]" />
            <span className="text-xs text-[var(--text-secondary)]">
              This video is stored in your Google Drive
            </span>
            <button
              type="button"
              onClick={connectDrive}
              className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[var(--accent-hover)] cursor-pointer"
            >
              Connect Google Drive
            </button>
          </div>
        ) : embedUrl ? (
          <div className="aspect-video w-full bg-black">
            <iframe
              src={embedUrl}
              title={caption || 'Embedded video'}
              className="h-full w-full border-0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        ) : url ? (
          <video src={url} controls className="aspect-video w-full bg-black object-contain" />
        ) : (
          <div className="flex h-44 flex-col items-center justify-center gap-2 text-[var(--text-muted)]">
            <Video className="h-6 w-6" />
            <span className="text-xs">Video source unavailable</span>
          </div>
        )}
      </div>

      <DriveConfirmDeleteModal
        open={confirmDriveDelete}
        title="Delete video from Google Drive?"
        description={`This will permanently delete "${caption || 'this video'}" from your Google Drive and remove it from this note.`}
        busy={deletingDrive}
        onConfirm={handleConfirmDriveDelete}
        onCancel={() => setConfirmDriveDelete(false)}
      />
    </NodeViewWrapper>
  );
}

export const VideoNode = Node.create({
  name: 'videoBlock',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      mediaId: { default: null },
      driveFileId: { default: null },
      src: { default: null },
      caption: { default: '' },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="videoBlock"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'videoBlock' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(VideoBlockView);
  },
});
