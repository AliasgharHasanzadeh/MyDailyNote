import type { User } from 'firebase/auth';
import { Calendar, Check, Cloud, LogOut, Moon, Settings, Sun, X } from 'lucide-react';
import type { CalendarLocale } from '../types/workspace';
import { formatFullDate, toDateKey } from '../utils/date';
import { GoogleSignInButton } from './GoogleSignInButton';

interface SettingsModalProps {
  open: boolean;
  theme: 'dark' | 'light';
  calendarLocale: CalendarLocale;
  user: User | null;
  driveConnected: boolean;
  authBusy: boolean;
  authError: string | null;
  onChangeTheme: (theme: 'dark' | 'light') => void;
  onChangeCalendarLocale: (locale: CalendarLocale) => void;
  onSignIn: () => void;
  onSignOut: () => void;
  onClose: () => void;
}

export function SettingsModal({
  open,
  theme,
  calendarLocale,
  user,
  driveConnected,
  authBusy,
  authError,
  onChangeTheme,
  onChangeCalendarLocale,
  onSignIn,
  onSignOut,
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
                Customize appearance, calendar, and cloud sync
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
          {/* Cloud Sync (Firebase Firestore + Google Drive Media) */}
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <Cloud className="h-4 w-4 text-[var(--accent)]" />
              <div>
                <h3 className="text-sm font-medium text-[var(--text-primary)]">
                  Cloud Sync (Firestore + Google Drive)
                </h3>
                <p className="text-xs text-[var(--text-muted)]">
                  Notes & tasks sync via Firestore; original-quality media files save to Google Drive (Vellum Workspace Media)
                </p>
              </div>
            </div>

            {user ? (
              <div className="space-y-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-3.5">
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

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border-subtle)] pt-2.5">
                  <span className="text-[11px] text-[var(--text-secondary)]">
                    {driveConnected
                      ? 'Google Drive connected (100% original-quality media uploads active)'
                      : 'Drive session token not loaded in memory yet — reconnect to upload or load Drive media'}
                  </span>
                  {!driveConnected && (
                    <GoogleSignInButton
                      label={authBusy ? 'Connecting...' : 'Reconnect Drive'}
                      disabled={authBusy}
                      onClick={onSignIn}
                    />
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-3.5">
                <div className="text-xs text-[var(--text-secondary)]">
                  Currently saving locally in this browser (IndexedDB).
                </div>
                <GoogleSignInButton
                  label={authBusy ? 'Connecting...' : 'Sign in with Google'}
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
            <div>
              <h3 className="text-sm font-medium text-[var(--text-primary)]">Appearance</h3>
              <p className="text-xs text-[var(--text-muted)]">
                Switch between dark and light workspace themes
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => onChangeTheme('dark')}
                className={`flex items-center justify-between rounded-xl border p-3.5 text-left transition-colors cursor-pointer ${
                  theme === 'dark'
                    ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                    : 'border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:border-[var(--border-strong)]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-[#0C0D19] text-[#8B7CFF]">
                    <Moon className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-[var(--text-primary)]">Dark</div>
                    <div className="text-[11px] text-[var(--text-muted)]">Deep slate</div>
                  </div>
                </div>
                {theme === 'dark' && <Check className="h-4 w-4 text-[var(--accent)]" />}
              </button>

              <button
                type="button"
                onClick={() => onChangeTheme('light')}
                className={`flex items-center justify-between rounded-xl border p-3.5 text-left transition-colors cursor-pointer ${
                  theme === 'light'
                    ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                    : 'border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:border-[var(--border-strong)]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-black/10 bg-[#FBFBFC] text-[#6B5CE7]">
                    <Sun className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-[var(--text-primary)]">Light</div>
                    <div className="text-[11px] text-[var(--text-muted)]">Clean paper</div>
                  </div>
                </div>
                {theme === 'light' && <Check className="h-4 w-4 text-[var(--accent)]" />}
              </button>
            </div>
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
