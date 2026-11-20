import { AlertTriangle, CheckCircle2, Cloud, Download, FolderOpen, Upload, X } from 'lucide-react';

export interface WorkspaceStatsSummary {
  folders: number;
  notes: number;
  tasks: number;
  goals: number;
}

interface DriveSyncModalProps {
  mode: 'save' | 'conflict' | 'first_setup' | 'enable_autosave' | null;
  existingFileId: string | null;
  driveModifiedTime: string | null;
  localStats: WorkspaceStatsSummary;
  remoteStats?: WorkspaceStatsSummary | null;
  busy?: boolean;
  error?: string | null;
  onConfirmSaveToDrive: () => void;
  onConfirmEnableAutoSave?: () => void;
  onConfirmLoadFromDrive?: () => void;
  onCancel: () => void;
}

export function DriveSyncModal({
  mode,
  existingFileId,
  driveModifiedTime,
  localStats,
  remoteStats,
  busy = false,
  error = null,
  onConfirmSaveToDrive,
  onConfirmEnableAutoSave,
  onConfirmLoadFromDrive,
  onCancel,
}: DriveSyncModalProps) {
  if (!mode) return null;

  const isOverwrite = Boolean(existingFileId);
  const removedNotesCount =
    remoteStats && remoteStats.notes > localStats.notes
      ? remoteStats.notes - localStats.notes
      : 0;
  const removedFoldersCount =
    remoteStats && remoteStats.folders > localStats.folders
      ? remoteStats.folders - localStats.folders
      : 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px]"
      onClick={() => !busy && onCancel()}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 shadow-[var(--shadow-popover)] space-y-4"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
              {mode === 'conflict' ? (
                <AlertTriangle className="h-4.5 w-4.5 text-amber-400" />
              ) : mode === 'enable_autosave' ? (
                <CheckCircle2 className="h-4.5 w-4.5 text-emerald-400" />
              ) : (
                <Cloud className="h-4.5 w-4.5" />
              )}
            </div>
            <div>
              <h3 className="font-display text-sm font-semibold text-[var(--text-primary)]">
                {mode === 'conflict'
                  ? 'Google Drive Workspace Found'
                  : mode === 'first_setup'
                  ? 'Create Primary Workspace in Google Drive?'
                  : mode === 'enable_autosave'
                  ? 'Enable Auto-Save to Google Drive?'
                  : isOverwrite
                  ? 'Save Workspace to Google Drive?'
                  : 'Create Workspace File in Google Drive?'}
              </h3>
              <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                Google Drive › Vellum Workspace › vellum-workspace.json
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="rounded-lg p-1 text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] cursor-pointer disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {mode === 'conflict' && remoteStats ? (
          <div className="space-y-3 text-xs text-[var(--text-secondary)]">
            <p className="leading-relaxed">
              Your Google Drive folder already contains a saved workspace, and this browser also has
              unsaved local edits. Choose which copy to use as your primary Google Drive workspace:
            </p>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <div className="rounded-xl border border-[var(--accent)]/40 bg-[var(--bg-canvas)] p-3">
                <div className="flex items-center gap-1.5 font-semibold text-[var(--text-primary)]">
                  <FolderOpen className="h-3.5 w-3.5 text-[var(--accent)]" />
                  In Google Drive (Recommended)
                </div>
                <div className="mt-1.5 space-y-0.5 text-[11px] text-[var(--text-muted)] tabular-nums">
                  <div>{remoteStats.notes} notes · {remoteStats.folders} folders</div>
                  <div>{remoteStats.tasks} tasks · {remoteStats.goals} goals</div>
                  {driveModifiedTime && (
                    <div className="pt-1 text-[10px]">
                      Modified: {new Date(driveModifiedTime).toLocaleString()}
                    </div>
                  )}
                </div>
              </div>
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-3">
                <div className="font-semibold text-[var(--text-primary)]">
                  Temporary Browser Cache
                </div>
                <div className="mt-1.5 space-y-0.5 text-[11px] text-[var(--text-muted)] tabular-nums">
                  <div>{localStats.notes} notes · {localStats.folders} folders</div>
                  <div>{localStats.tasks} tasks · {localStats.goals} goals</div>
                </div>
              </div>
            </div>
          </div>
        ) : mode === 'enable_autosave' && remoteStats ? (
          <div className="space-y-3 text-xs text-[var(--text-secondary)]">
            <p className="leading-relaxed">
              Loaded your workspace from Google Drive. Confirm below to make Google Drive your
              primary storage and automatically save all edits to{' '}
              <span className="font-medium text-[var(--text-primary)]">
                Vellum Workspace/vellum-workspace.json
              </span>{' '}
              as you work.
            </p>
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-3 space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-[var(--text-muted)]">Workspace loaded</span>
                <span className="text-[var(--text-primary)] tabular-nums">
                  {remoteStats.notes} notes · {remoteStats.folders} folders · {remoteStats.tasks}{' '}
                  tasks · {remoteStats.goals} goals
                </span>
              </div>
              {driveModifiedTime && (
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-[var(--text-muted)]">Last saved in Drive</span>
                  <span className="text-[var(--text-secondary)] tabular-nums">
                    {new Date(driveModifiedTime).toLocaleString()}
                  </span>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3 text-xs text-[var(--text-secondary)]">
            <p className="leading-relaxed">
              {mode === 'first_setup'
                ? 'No Vellum Workspace folder was found in your Google Drive yet. Confirm below to create the folder, save your workspace to Google Drive, and enable automatic saving to Drive as you work.'
                : isOverwrite
                ? 'Confirm saving your current workspace to Google Drive (overwriting the previous snapshot):'
                : 'Confirm creating the workspace file in your Vellum Workspace Google Drive folder:'}
            </p>

            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-3 space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-[var(--text-muted)]">Destination</span>
                <span className="font-mono text-[var(--text-primary)]">
                  Vellum Workspace/vellum-workspace.json
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-[var(--text-muted)]">Contents</span>
                <span className="text-[var(--text-primary)] tabular-nums">
                  {localStats.notes} notes · {localStats.folders} folders · {localStats.tasks} tasks ·{' '}
                  {localStats.goals} goals
                </span>
              </div>
              {driveModifiedTime && isOverwrite && (
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-[var(--text-muted)]">Previous Drive save</span>
                  <span className="text-[var(--text-secondary)] tabular-nums">
                    {new Date(driveModifiedTime).toLocaleString()}
                  </span>
                </div>
              )}
            </div>

            {(removedNotesCount > 0 || removedFoldersCount > 0) && (
              <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-800 dark:text-amber-300">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>
                  This update will remove{' '}
                  {[
                    removedNotesCount > 0 ? `${removedNotesCount} note(s)` : null,
                    removedFoldersCount > 0 ? `${removedFoldersCount} folder(s)` : null,
                  ]
                    .filter(Boolean)
                    .join(' and ')}{' '}
                  compared to the previous Google Drive snapshot.
                </span>
              </div>
            )}
          </div>
        )}

        {error && (
          <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
            {error}
          </p>
        )}

        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="rounded-lg border border-[var(--border-subtle)] px-3.5 py-2 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] cursor-pointer disabled:opacity-50"
          >
            {mode === 'enable_autosave' ? 'Manual Save Only' : 'Cancel'}
          </button>

          {mode === 'conflict' && onConfirmLoadFromDrive && (
            <button
              type="button"
              disabled={busy}
              onClick={onConfirmLoadFromDrive}
              className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3.5 py-2 text-xs font-medium text-white hover:bg-[var(--accent-hover)] cursor-pointer disabled:opacity-50"
            >
              <Download className="h-3.5 w-3.5" />
              {busy ? 'Loading...' : 'Load from Drive & Auto-Save'}
            </button>
          )}

          {mode === 'enable_autosave' && onConfirmEnableAutoSave ? (
            <button
              type="button"
              disabled={busy}
              onClick={onConfirmEnableAutoSave}
              className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3.5 py-2 text-xs font-medium text-white hover:bg-[var(--accent-hover)] cursor-pointer disabled:opacity-50"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Enable Auto-Save to Drive
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={onConfirmSaveToDrive}
              className={`flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-medium cursor-pointer disabled:opacity-50 ${
                mode === 'conflict'
                  ? 'border border-[var(--border-subtle)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
                  : 'bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]'
              }`}
            >
              <Upload className="h-3.5 w-3.5" />
              {busy
                ? 'Saving to Drive...'
                : mode === 'conflict'
                ? 'Overwrite Drive with Local & Auto-Save'
                : mode === 'first_setup'
                ? 'Create Folder & Enable Auto-Save'
                : isOverwrite
                ? 'Confirm & Save to Drive'
                : 'Create & Save to Drive'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
