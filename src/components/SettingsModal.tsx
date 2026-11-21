import {
  Calendar,
  Check,
  ChevronDown,
  Cloud,
  ExternalLink,
  Heart,
  LogOut,
  Moon,
  Palette,
  RefreshCw,
  Settings,
  Sun,
  Terminal,
  Upload,
  X,
} from 'lucide-react';
import type { DriveSaveStatus } from '../db/googleDrive';
import type { GoogleUser } from '../googleAuth';
import {
  type CalendarLocale,
  WORKSPACE_THEMES,
  type WorkspaceTheme,
} from '../types/workspace';
import { formatFullDate, toDateKey } from '../utils/date';
import { GoogleSignInButton } from './GoogleSignInButton';

interface SettingsModalProps {
  open: boolean;
  theme: WorkspaceTheme;
  calendarLocale: CalendarLocale;
  user: GoogleUser | null;
  driveConnected: boolean;
  driveRestoring?: boolean;
  driveAutoSaveEnabled: boolean;
  driveSaveStatus: DriveSaveStatus;
  hasPendingDriveChanges: boolean;
  driveFolderUrl: string | null;
  lastDriveSyncAt: string | null;
  authBusy: boolean;
  authError: string | null;
  onChangeTheme: (theme: WorkspaceTheme) => void;
  onChangeCalendarLocale: (locale: CalendarLocale) => void;
  onSignIn: () => void;
  onSignOut: () => void;
  onToggleDriveAutoSave: () => void;
  onRequestSaveToDrive: () => void;
  onReloadFromDrive: () => void;
  onClose: () => void;
}

export function SettingsModal({
  open,
  theme,
  calendarLocale,
  user,
  driveConnected,
  driveRestoring = false,
  driveAutoSaveEnabled,
  driveSaveStatus,
  hasPendingDriveChanges,
  driveFolderUrl,
  lastDriveSyncAt,
  authBusy,
  authError,
  onChangeTheme,
  onChangeCalendarLocale,
  onSignIn,
  onSignOut,
  onToggleDriveAutoSave,
  onRequestSaveToDrive,
  onReloadFromDrive,
  onClose,
}: SettingsModalProps) {
  if (!open) return null;

  const todayKey = toDateKey();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 shadow-[var(--shadow-popover)]"
      >
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)]">
              <Settings className="h-4 w-4" />
            </div>
            <div>
              <h2 className="font-display text-base font-semibold text-[var(--text-primary)]">
                Workspace Settings
              </h2>
              <p className="text-xs text-[var(--text-muted)]">
                Customize appearance, calendar, and primary Google Drive storage
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] cursor-pointer"
            aria-label="Close settings"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 space-y-6">
          {/* Primary Google Drive Storage */}
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <Cloud className="h-4 w-4 text-[var(--accent)]" />
              <div>
                <h3 className="text-sm font-medium text-[var(--text-primary)]">
                  Primary Storage: Google Drive
                </h3>
                <p className="text-xs text-[var(--text-muted)]">
                  All notes, journals, folders, tasks, goals, and original-quality media save directly to{' '}
                  <span className="font-medium text-[var(--text-secondary)]">
                    Google Drive › Vellum Workspace
                  </span>
                  . Browser storage is only a temporary cache.
                </p>
              </div>
            </div>

            {user ? (
              <div className="space-y-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-3.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    {user.photoURL ? (
                      <img
                        src={user.photoURL}
                        alt={user.displayName || 'Account'}
                        referrerPolicy="no-referrer"
                        className="h-9 w-9 shrink-0 rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-sm font-semibold text-[var(--accent)]">
                        {(user.displayName || user.email || 'U').slice(0, 1).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="truncate text-xs font-semibold text-[var(--text-primary)]">
                        {user.displayName || 'Google Account'}
                      </div>
                      <div className="truncate text-[11px] text-[var(--text-muted)]">
                        {user.email}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={onSignOut}
                    disabled={authBusy}
                    className="flex shrink-0 items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] cursor-pointer disabled:opacity-50"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    Sign out
                  </button>
                </div>

                <div className="space-y-2.5 border-t border-[var(--border-subtle)] pt-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                    <span className="text-[var(--text-secondary)]">
                      {!driveConnected && driveRestoring
                        ? 'Restoring Google Drive sync session...'
                        : !driveConnected
                        ? 'Google Drive disconnected — reconnect to load & auto-save directly to Drive'
                        : driveSaveStatus === 'saving'
                        ? 'Saving workspace to Google Drive...'
                        : driveAutoSaveEnabled && !hasPendingDriveChanges
                        ? `Auto-save active · Last saved ${
                            lastDriveSyncAt ? new Date(lastDriveSyncAt).toLocaleString() : 'just now'
                          }`
                        : hasPendingDriveChanges
                        ? 'Pending changes waiting to save to Google Drive.'
                        : 'Google Drive connected'}
                    </span>
                    {driveFolderUrl && (
                      <a
                        href={driveFolderUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-medium text-[var(--accent)] hover:underline"
                      >
                        Open folder
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>

                  {driveConnected ? (
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2">
                        <div>
                          <div className="text-xs font-medium text-[var(--text-primary)]">
                            Auto-Save to Google Drive
                          </div>
                          <div className="text-[11px] text-[var(--text-muted)]">
                            Automatically save changes to Vellum Workspace as you edit
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={onToggleDriveAutoSave}
                          className={`rounded-lg px-2.5 py-1 text-[11px] font-medium cursor-pointer transition-colors ${
                            driveAutoSaveEnabled
                              ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30'
                              : 'bg-[var(--bg-hover)] text-[var(--text-secondary)] border border-[var(--border-subtle)]'
                          }`}
                        >
                          {driveAutoSaveEnabled ? 'Enabled' : 'Enable'}
                        </button>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            onRequestSaveToDrive();
                          }}
                          className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[var(--accent-hover)] cursor-pointer"
                        >
                          <Upload className="h-3.5 w-3.5" />
                          Save Now to Drive
                        </button>
                        <button
                          type="button"
                          onClick={onReloadFromDrive}
                          disabled={authBusy}
                          className="flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] cursor-pointer disabled:opacity-50"
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                          Reload from Drive
                        </button>
                      </div>
                    </div>
                  ) : !driveRestoring ? (
                    <GoogleSignInButton
                      label={authBusy ? 'Connecting...' : 'Reconnect Google Drive'}
                      disabled={authBusy}
                      onClick={onSignIn}
                    />
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5">
                <div className="text-xs text-amber-800 dark:text-amber-200">
                  Google Drive is not connected. Browser storage is temporary — connect Google Drive to store your workspace safely.
                </div>
                <GoogleSignInButton
                  label={authBusy ? 'Connecting...' : 'Connect Google Drive'}
                  disabled={authBusy}
                  onClick={onSignIn}
                />
              </div>
            )}

            {authError && (
              <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
                {authError}
              </p>
            )}
          </section>

          {/* Theme Setting */}
          <section className="space-y-3 border-t border-[var(--border-subtle)] pt-5">
            <div className="flex items-center gap-2">
              <Palette className="h-4 w-4 text-[var(--accent)]" />
              <div>
                <h3 className="text-sm font-medium text-[var(--text-primary)]">Appearance</h3>
                <p className="text-xs text-[var(--text-muted)]">
                  Select a workspace theme from the menu below
                </p>
              </div>
            </div>

            {(() => {
              const activeThemeMeta =
                WORKSPACE_THEMES.find((item) => item.id === theme) || WORKSPACE_THEMES[1];
              return (
                <div className="space-y-2.5">
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--accent)]">
                      {theme === 'light' ? (
                        <Sun className="h-4 w-4" />
                      ) : theme === 'dark' ? (
                        <Moon className="h-4 w-4" />
                      ) : theme === 'cybery' ? (
                        <Terminal className="h-4 w-4" />
                      ) : (
                        <Heart className="h-4 w-4" />
                      )}
                    </span>
                    <select
                      aria-label="Workspace theme"
                      value={theme}
                      onChange={(e) => onChangeTheme(e.target.value as WorkspaceTheme)}
                      className="w-full appearance-none rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] py-2.5 pl-10 pr-10 text-sm font-medium text-[var(--text-primary)] transition-colors hover:border-[var(--border-strong)] focus:border-[var(--accent)] focus:outline-none cursor-pointer"
                    >
                      {WORKSPACE_THEMES.map((item) => (
                        <option
                          key={item.id}
                          value={item.id}
                          className="bg-[var(--bg-surface)] text-[var(--text-primary)]"
                        >
                          {item.label} — {item.subtitle}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                  </div>

                  <div className="flex items-center justify-between rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3.5 py-2.5">
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-[var(--text-primary)]">
                        {activeThemeMeta.label} Theme
                      </div>
                      <div className="text-[11px] text-[var(--text-muted)]">
                        {activeThemeMeta.subtitle}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5" aria-hidden="true">
                      <span
                        className="h-4 w-4 rounded-full border border-[var(--border-strong)]"
                        style={{ backgroundColor: activeThemeMeta.canvas }}
                        title="Canvas"
                      />
                      <span
                        className="h-4 w-4 rounded-full border border-[var(--border-strong)]"
                        style={{ backgroundColor: activeThemeMeta.surface }}
                        title="Surface"
                      />
                      <span
                        className="h-4 w-4 rounded-full border border-[var(--border-strong)]"
                        style={{ backgroundColor: activeThemeMeta.accent }}
                        title="Accent"
                      />
                    </div>
                  </div>
                </div>
              );
            })()}
          </section>

          {/* Calendar & Date System Setting */}
          <section className="space-y-3 border-t border-[var(--border-subtle)] pt-5">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-[var(--accent)]" />
              <div>
                <h3 className="text-sm font-medium text-[var(--text-primary)]">
                  Calendar & Date Format
                </h3>
                <p className="text-xs text-[var(--text-muted)]">
                  Choose between Persian (Jalali / شمسی) and English (Gregorian) dates
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => onChangeCalendarLocale('en')}
                className={`flex items-start justify-between rounded-xl border p-3.5 text-left transition-colors cursor-pointer ${
                  calendarLocale === 'en'
                    ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                    : 'border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:border-[var(--border-strong)]'
                }`}
              >
                <div className="min-w-0 pr-2">
                  <div className="text-xs font-semibold text-[var(--text-primary)]">
                    English (Gregorian)
                  </div>
                  <div className="mt-1 truncate text-[11px] text-[var(--text-secondary)] tabular-nums">
                    {formatFullDate(todayKey, 'en')}
                  </div>
                </div>
                {calendarLocale === 'en' && (
                  <Check className="h-4 w-4 shrink-0 text-[var(--accent)]" />
                )}
              </button>

              <button
                type="button"
                onClick={() => onChangeCalendarLocale('fa')}
                className={`flex items-start justify-between rounded-xl border p-3.5 text-left transition-colors cursor-pointer ${
                  calendarLocale === 'fa'
                    ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                    : 'border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:border-[var(--border-strong)]'
                }`}
              >
                <div className="min-w-0 pr-2">
                  <div className="text-xs font-semibold text-[var(--text-primary)]">
                    فارسی (تقویم شمسی)
                  </div>
                  <div
                    dir="rtl"
                    className="mt-1 truncate text-[11px] text-[var(--text-secondary)] tabular-nums"
                  >
                    {formatFullDate(todayKey, 'fa')}
                  </div>
                </div>
                {calendarLocale === 'fa' && (
                  <Check className="h-4 w-4 shrink-0 text-[var(--accent)]" />
                )}
              </button>
            </div>

            <p className="text-[11px] leading-relaxed text-[var(--text-muted)]">
              Journal entries, tasks, and goals remain synced seamlessly when switching between
              Persian and English calendar views.
            </p>
          </section>
        </div>

        <div className="mt-6 flex justify-end border-t border-[var(--border-subtle)] pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-[var(--accent)] px-4 py-2 text-xs font-medium text-white hover:bg-[var(--accent-hover)] cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
