import { mergeAttributes, Node } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { Cloud, Image as ImageIcon, Maximize2, Minimize2, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { deleteDriveFile } from '../../../db/googleDrive';
import { getDriveAccessToken } from '../../../googleAuth';
import { DriveConfirmDeleteModal } from '../../DriveConfirmDeleteModal';
import { useMediaUrl } from './useMediaUrl';

function ImageBlockView({ node, updateAttributes, deleteNode, selected }: NodeViewProps) {
  const mediaId = node.attrs.mediaId as string | null;
  const driveFileId = node.attrs.driveFileId as string | null;
  const fallbackSrc = node.attrs.src as string | null;
  const caption = (node.attrs.caption as string) || '';
  const width = (node.attrs.width as 'standard' | 'wide') || 'standard';

  const { url, loading, error, needsDriveAuth, connectDrive } = useMediaUrl(
    mediaId,
    fallbackSrc,
    driveFileId
  );
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [confirmDriveDelete, setConfirmDriveDelete] = useState(false);
  const [deletingDrive, setDeletingDrive] = useState(false);

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
    <NodeViewWrapper className="my-4" data-type="mediaImage">
      <div
        contentEditable={false}
        className={`group relative mx-auto overflow-hidden rounded-xl border transition-all ${
          width === 'wide' ? 'max-w-full' : 'max-w-xl'
        } ${
          selected
            ? 'border-[var(--accent)] ring-2 ring-[var(--accent-soft)]'
            : 'border-[var(--border-subtle)] bg-[var(--bg-secondary)]'
        }`}
      >
        <div className="absolute right-2.5 top-2.5 z-10 flex items-center gap-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)]/90 p-1 opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100">
          <button
            type="button"
            onClick={() => updateAttributes({ width: width === 'wide' ? 'standard' : 'wide' })}
            title={width === 'wide' ? 'Standard width' : 'Wide width'}
            className="rounded-md p-1.5 text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] cursor-pointer"
          >
            {width === 'wide' ? (
              <Minimize2 className="h-3.5 w-3.5" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5" />
            )}
          </button>
          {url && (
            <button
              type="button"
              onClick={() => setLightboxOpen(true)}
              title="View full image"
              className="rounded-md px-2 py-1 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              Preview
            </button>
          )}
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
            title="Remove image from note"
            className="rounded-md p-1.5 text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-red-500 cursor-pointer"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>

        {loading ? (
          <div className="flex h-52 items-center justify-center bg-[var(--bg-secondary)] text-xs text-[var(--text-muted)]">
            Loading image...
          </div>
        ) : needsDriveAuth ? (
          <div className="flex h-44 flex-col items-center justify-center gap-2.5 bg-[var(--bg-secondary)] px-4 text-center">
            <Cloud className="h-6 w-6 text-[var(--accent)]" />
            <span className="text-xs text-[var(--text-secondary)]">
              This image is stored in your Google Drive
            </span>
            <button
              type="button"
              onClick={connectDrive}
              className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[var(--accent-hover)] cursor-pointer"
            >
              Connect Google Drive
            </button>
          </div>
        ) : url && !error ? (
          <img
            src={url}
            alt={caption || 'Note image'}
            referrerPolicy="no-referrer"
            onClick={() => setLightboxOpen(true)}
            className="block max-h-[520px] w-full cursor-zoom-in object-cover"
          />
        ) : (
          <div className="flex h-44 flex-col items-center justify-center gap-2 bg-[var(--bg-secondary)] text-[var(--text-muted)]">
            <ImageIcon className="h-6 w-6" />
            <span className="text-xs">Image could not be loaded</span>
          </div>
        )}

        <div className="border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3.5 py-2">
          <input
            type="text"
            value={caption}
            onChange={(e) => updateAttributes({ caption: e.target.value })}
            placeholder="Add a caption..."
            className="w-full bg-transparent text-xs text-[var(--text-secondary)] placeholder:text-[var(--text-muted)] focus:outline-none"
          />
        </div>
      </div>

      {lightboxOpen && url && (
        <div
          contentEditable={false}
          onClick={() => setLightboxOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6 backdrop-blur-sm"
        >
          <button
            type="button"
            onClick={() => setLightboxOpen(false)}
            className="absolute right-5 top-5 rounded-lg bg-white/10 p-2 text-white hover:bg-white/20 cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
          <img
            src={url}
            alt={caption || 'Preview'}
            referrerPolicy="no-referrer"
            className="max-h-[90vh] max-w-[90vw] rounded-xl object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      <DriveConfirmDeleteModal
        open={confirmDriveDelete}
        title="Delete image from Google Drive?"
        description={`This will permanently delete "${caption || 'this image'}" from your Google Drive and remove it from this note.`}
        busy={deletingDrive}
        onConfirm={handleConfirmDriveDelete}
        onCancel={() => setConfirmDriveDelete(false)}
      />
    </NodeViewWrapper>
  );
}

export const MediaImageNode = Node.create({
  name: 'mediaImage',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      mediaId: { default: null },
      driveFileId: { default: null },
      src: { default: null },
      caption: { default: '' },
      width: { default: 'standard' },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="mediaImage"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'mediaImage' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageBlockView);
  },
});
