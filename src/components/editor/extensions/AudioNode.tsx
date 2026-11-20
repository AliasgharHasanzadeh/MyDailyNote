import { mergeAttributes, Node } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { Cloud, Music, Pause, Play, Trash2, Volume2, VolumeX } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { deleteDriveFile } from '../../../db/googleDrive';
import { getDriveAccessToken } from '../../../firebase';
import { formatDuration } from '../../../utils/date';
import { DriveConfirmDeleteModal } from '../../DriveConfirmDeleteModal';
import { useMediaUrl } from './useMediaUrl';

function AudioBlockView({ node, updateAttributes, deleteNode, selected }: NodeViewProps) {
  const mediaId = node.attrs.mediaId as string | null;
  const driveFileId = node.attrs.driveFileId as string | null;
  const fallbackSrc = node.attrs.src as string | null;
  const title = (node.attrs.title as string) || 'Audio Recording';

  const { url, loading, needsDriveAuth, connectDrive } = useMediaUrl(
    mediaId,
    fallbackSrc,
    driveFileId
  );
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [confirmDriveDelete, setConfirmDriveDelete] = useState(false);
  const [deletingDrive, setDeletingDrive] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTime = () => setCurrentTime(audio.currentTime);
    const onMeta = () => setDuration(audio.duration || 0);
    const onEnded = () => setIsPlaying(false);

    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('loadedmetadata', onMeta);
    audio.addEventListener('ended', onEnded);
    return () => {
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('loadedmetadata', onMeta);
      audio.removeEventListener('ended', onEnded);
    };
  }, [url]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;
    const next = Number(e.target.value);
    audio.currentTime = next;
    setCurrentTime(next);
  };

  const toggleMute = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.muted = !muted;
    setMuted(!muted);
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
    <NodeViewWrapper className="my-3.5" data-type="audioBlock">
      <div
        contentEditable={false}
        className={`group rounded-xl border p-3.5 transition-colors ${
          selected
            ? 'border-[var(--accent)] bg-[var(--bg-secondary)]'
            : 'border-[var(--border-subtle)] bg-[var(--bg-secondary)]'
        }`}
      >
        {url && <audio ref={audioRef} src={url} preload="metadata" />}
        <div className="flex items-center gap-3.5">
          <button
            type="button"
            disabled={!url || loading}
            onClick={togglePlay}
            aria-label={isPlaying ? 'Pause audio' : 'Play audio'}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] disabled:opacity-40 transition-colors cursor-pointer"
          >
            {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
          </button>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Music className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
              <input
                type="text"
                value={title}
                onChange={(e) => updateAttributes({ title: e.target.value })}
                className="w-full bg-transparent text-sm font-medium text-[var(--text-primary)] focus:outline-none"
                placeholder="Audio title"
              />
            </div>

            {needsDriveAuth ? (
              <div className="mt-2 flex items-center gap-2">
                <span className="text-xs text-[var(--text-muted)]">
                  Stored in Google Drive
                </span>
                <button
                  type="button"
                  onClick={connectDrive}
                  className="inline-flex items-center gap-1 rounded-md bg-[var(--accent)] px-2.5 py-1 text-[11px] font-medium text-white hover:bg-[var(--accent-hover)] cursor-pointer"
                >
                  <Cloud className="h-3 w-3" />
                  Connect Drive
                </button>
              </div>
            ) : (
              <div className="mt-2 flex items-center gap-2.5">
                <span className="font-mono-tabular text-[11px] text-[var(--text-muted)] w-9">
                  {formatDuration(currentTime)}
                </span>
                <input
                  type="range"
                  min={0}
                  max={duration || 100}
                  step={0.1}
                  value={currentTime}
                  onChange={handleSeek}
                  disabled={!url}
                  className="h-1.5 flex-1 accent-[var(--accent)] cursor-pointer"
                />
                <span className="font-mono-tabular text-[11px] text-[var(--text-muted)] w-9 text-right">
                  {formatDuration(duration)}
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={toggleMute}
              title={muted ? 'Unmute' : 'Mute'}
              className="rounded-md p-1.5 text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>
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
              title="Remove audio from note"
              className="opacity-0 group-hover:opacity-100 rounded-md p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-red-500 transition-opacity cursor-pointer"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <DriveConfirmDeleteModal
        open={confirmDriveDelete}
        title="Delete audio from Google Drive?"
        description={`This will permanently delete "${title}" from your Google Drive and remove it from this note.`}
        busy={deletingDrive}
        onConfirm={handleConfirmDriveDelete}
        onCancel={() => setConfirmDriveDelete(false)}
      />
    </NodeViewWrapper>
  );
}

export const AudioNode = Node.create({
  name: 'audioBlock',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      mediaId: { default: null },
      driveFileId: { default: null },
      src: { default: null },
      title: { default: 'Audio Track' },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="audioBlock"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'audioBlock' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(AudioBlockView);
  },
});
