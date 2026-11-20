import { mergeAttributes, Node } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { Cloud, Download, FileText, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { deleteDriveFile } from '../../../db/googleDrive';
import { getDriveAccessToken } from '../../../firebase';
import { formatFileSize } from '../../../utils/date';
import { DriveConfirmDeleteModal } from '../../DriveConfirmDeleteModal';
import { useMediaUrl } from './useMediaUrl';

function FileAttachmentView({ node, deleteNode, selected }: NodeViewProps) {
  const mediaId = node.attrs.mediaId as string | null;
  const driveFileId = node.attrs.driveFileId as string | null;
  const fallbackSrc = node.attrs.src as string | null;
  const fileName = (node.attrs.fileName as string) || 'Attachment';
  const fileSize = Number(node.attrs.fileSize || 0);
  const mimeType = (node.attrs.mimeType as string) || '';

  const { url, needsDriveAuth, connectDrive } = useMediaUrl(
    mediaId,
    fallbackSrc,
    driveFileId
  );
  const [confirmDriveDelete, setConfirmDriveDelete] = useState(false);
  const [deletingDrive, setDeletingDrive] = useState(false);

  const handleDownload = () => {
    if (!url) return;
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

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
    <NodeViewWrapper className="my-3" data-type="fileAttachment">
      <div
        contentEditable={false}
        className={`group flex items-center justify-between gap-3 rounded-xl border px-4 py-3 transition-colors ${
          selected
            ? 'border-[var(--accent)] bg-[var(--bg-secondary)]'
            : 'border-[var(--border-subtle)] bg-[var(--bg-secondary)] hover:border-[var(--border-strong)]'
        }`}
      >
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--accent)]">
            <FileText className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-[var(--text-primary)]">{fileName}</p>
            <p className="text-xs text-[var(--text-muted)] tabular-nums">
              {fileSize > 0 ? formatFileSize(fileSize) : 'Attached file'}
              {mimeType ? ` · ${mimeType.split('/').pop()?.toUpperCase()}` : ''}
              {driveFileId ? ' · Google Drive' : ''}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {needsDriveAuth ? (
            <button
              type="button"
              onClick={connectDrive}
              className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[var(--accent-hover)] cursor-pointer whitespace-nowrap shrink-0"
            >
              <Cloud className="h-3.5 w-3.5" />
              Connect Drive
            </button>
          ) : (
            <button
              type="button"
              disabled={!url}
              onClick={handleDownload}
              className="flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-hover)] disabled:opacity-40 cursor-pointer whitespace-nowrap shrink-0"
            >
              <Download className="h-3.5 w-3.5" />
              Download
            </button>
          )}
          {driveFileId && getDriveAccessToken() && (
            <button
              type="button"
              onClick={() => setConfirmDriveDelete(true)}
              title="Delete from Google Drive"
              className="opacity-0 group-hover:opacity-100 rounded-md px-2 py-1 text-[11px] text-red-400 hover:bg-red-500/10 transition-opacity cursor-pointer"
            >
              Delete Drive file
            </button>
          )}
          <button
            type="button"
            onClick={deleteNode}
            title="Remove attachment from note"
            className="opacity-0 group-hover:opacity-100 rounded-md p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-red-500 transition-opacity cursor-pointer"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <DriveConfirmDeleteModal
        open={confirmDriveDelete}
        title="Delete file from Google Drive?"
        description={`This will permanently delete "${fileName}" from your Google Drive and remove it from this note.`}
        busy={deletingDrive}
        onConfirm={handleConfirmDriveDelete}
        onCancel={() => setConfirmDriveDelete(false)}
      />
    </NodeViewWrapper>
  );
}

export const FileAttachmentNode = Node.create({
  name: 'fileAttachment',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      mediaId: { default: null },
      driveFileId: { default: null },
      src: { default: null },
      fileName: { default: 'Attachment' },
      fileSize: { default: 0 },
      mimeType: { default: '' },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="fileAttachment"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'fileAttachment' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(FileAttachmentView);
  },
});
