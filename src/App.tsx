import { Cloud, PanelLeftOpen, Plus, RotateCcw, Trash2, Upload, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DriveConfirmDeleteModal } from './components/DriveConfirmDeleteModal';
import { DriveSyncModal } from './components/DriveSyncModal';
import { GoogleSignInButton } from './components/GoogleSignInButton';
import { LeftSidebar } from './components/LeftSidebar';
import { NoteTabBar } from './components/NoteTabBar';
import { RightPanel } from './components/RightPanel';
import { SearchCommandPalette } from './components/SearchCommandPalette';
import { SettingsModal } from './components/SettingsModal';
import { NoteEditor } from './components/editor/NoteEditor';
import { DashboardView } from './components/views/DashboardView';
import { GoalsView } from './components/views/GoalsView';
import { JournalView } from './components/views/JournalView';
import { NotesBrowserView } from './components/views/NotesBrowserView';
import { TasksView } from './components/views/TasksView';
import { TrashView } from './components/views/TrashView';
import {
  type DriveSaveStatus,
  type DriveWorkspaceReadResult,
  clearDriveSessionCaches,
  readWorkspaceFromDrive,
  saveWorkspaceToDrive,
} from './db/googleDrive';
import { createId, db, seedInitialWorkspaceIfEmpty } from './db/storage';
import {
  type GoogleUser,
  getCurrentGoogleUser,
  getDriveAccessToken,
  googleSignIn,
  googleSignOut,
  onGoogleAuthChanged,
  preloadGoogleAuth,
  silentGoogleSignIn,
  subscribeDriveAccessToken,
} from './googleAuth';
import {
  type CalendarLocale,
  type Folder,
  type Goal,
  type Note,
  THEME_ORDER,
  type Task,
  type TaskPriority,
  type WorkspacePreferences,
  type WorkspaceSection,
  type WorkspaceTheme,
} from './types/workspace';
import { buildAutoJournalTitle, isAutoJournalTitle, isTrashExpired, toDateKey } from './utils/date';
import { EMPTY_DOC } from './utils/tiptap';

const DRIVE_DIRTY_STORAGE_KEY = 'vellum_drive_dirty_v1';
const DRIVE_LAST_SYNC_KEY = 'vellum_drive_last_sync_v1';
const DRIVE_AUTOSAVE_STORAGE_KEY = 'vellum_drive_autosave_v1';

function syncAutoJournalTitles(
  notesList: Note[],
  locale: CalendarLocale,
  onPersist?: (note: Note) => void
): Note[] {
  const indexByNoteId = new Map<string, number>();
  const byDate = new Map<string, Note[]>();
  for (const n of notesList) {
    if (!n.journalDate) continue;
    const arr = byDate.get(n.journalDate) || [];
    arr.push(n);
    byDate.set(n.journalDate, arr);
  }
  byDate.forEach((arr) => {
    arr
      .slice()
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .forEach((n, idx) => indexByNoteId.set(n.id, idx + 1));
  });

  return notesList.map((n) => {
    if (!n.journalDate || !isAutoJournalTitle(n.title, n.journalDate, n.isCustomJournalTitle)) {
      return n;
    }
    const nextTitle = buildAutoJournalTitle(
      n.journalDate,
      locale,
      indexByNoteId.get(n.id) || 1
    );
    if (nextTitle === n.title && n.isCustomJournalTitle === false) return n;
    const updated: Note = {
      ...n,
      title: nextTitle,
      isCustomJournalTitle: false,
      updatedAt: new Date().toISOString(),
    };
    onPersist?.(updated);
    return updated;
  });
}

export default function App() {
  const [loading, setLoading] = useState(true);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [prefs, setPrefs] = useState<WorkspacePreferences>({
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
    openTabIds: [],
  });

  const [user, setUser] = useState<GoogleUser | null>(() => getCurrentGoogleUser());
  const [driveConnected, setDriveConnected] = useState<boolean>(() => Boolean(getDriveAccessToken()));
  const [driveRestoring, setDriveRestoring] = useState<boolean>(() =>
    Boolean(getCurrentGoogleUser() && !getDriveAccessToken())
  );
  const [silentRestoreFailed, setSilentRestoreFailed] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [driveFileId, setDriveFileId] = useState<string | null>(null);
  const [driveFolderUrl, setDriveFolderUrl] = useState<string | null>(null);
  const [driveModifiedTime, setDriveModifiedTime] = useState<string | null>(null);
  const [lastDriveSyncAt, setLastDriveSyncAt] = useState<string | null>(() => {
    try {
      return localStorage.getItem(DRIVE_LAST_SYNC_KEY);
    } catch {
      return null;
    }
  });
  const [hasPendingDriveChanges, setHasPendingDriveChanges] = useState<boolean>(() => {
    try {
      return localStorage.getItem(DRIVE_DIRTY_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [driveSyncModalMode, setDriveSyncModalMode] = useState<
    'save' | 'conflict' | 'first_setup' | 'enable_autosave' | null
  >(null);
  const [driveAutoSaveEnabled, setDriveAutoSaveEnabled] = useState<boolean>(() => {
    try {
      return (
        Boolean(getCurrentGoogleUser()) &&
        localStorage.getItem(DRIVE_AUTOSAVE_STORAGE_KEY) === 'true'
      );
    } catch {
      return false;
    }
  });
  const [isAutoSavingToDrive, setIsAutoSavingToDrive] = useState(false);
  const [driveRemoteResult, setDriveRemoteResult] = useState<DriveWorkspaceReadResult | null>(null);
  const [driveSyncBusy, setDriveSyncBusy] = useState(false);
  const [driveSyncError, setDriveSyncError] = useState<string | null>(null);
  const [pendingPermanentDelete, setPendingPermanentDelete] = useState<
    { kind: 'note'; note: Note } | { kind: 'empty_trash'; count: number } | null
  >(null);
  const [trashToast, setTrashToast] = useState<{ noteId: string; title: string } | null>(null);

  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [saveState, setSaveState] = useState<'saved' | 'saving'>('saved');
  const [quickTaskOpen, setQuickTaskOpen] = useState(false);
  const [quickTaskTitle, setQuickTaskTitle] = useState('');
  const [quickTaskPriority, setQuickTaskPriority] = useState<TaskPriority>('medium');
  const [quickTaskDate, setQuickTaskDate] = useState(toDateKey());

  const saveTimersRef = useRef<Map<string, number>>(new Map());
  const autoSaveTimerRef = useRef<number | null>(null);
  const trashToastTimerRef = useRef<number | null>(null);
  const workspaceRef = useRef({ folders, notes, tasks, goals, prefs });
  workspaceRef.current = { folders, notes, tasks, goals, prefs };
  const driveFileIdRef = useRef<string | null>(driveFileId);
  driveFileIdRef.current = driveFileId;
  const hasPendingDriveChangesRef = useRef(hasPendingDriveChanges);
  hasPendingDriveChangesRef.current = hasPendingDriveChanges;
  const driveAutoSaveEnabledRef = useRef(driveAutoSaveEnabled);
  driveAutoSaveEnabledRef.current = driveAutoSaveEnabled;
  const lastDriveSyncAtRef = useRef<string | null>(lastDriveSyncAt);
  lastDriveSyncAtRef.current = lastDriveSyncAt;

  const setDriveAutoSave = useCallback((enabled: boolean) => {
    driveAutoSaveEnabledRef.current = enabled;
    setDriveAutoSaveEnabled(enabled);
    try {
      if (enabled) {
        localStorage.setItem(DRIVE_AUTOSAVE_STORAGE_KEY, 'true');
      } else {
        localStorage.removeItem(DRIVE_AUTOSAVE_STORAGE_KEY);
      }
    } catch {
      // Ignore storage errors
    }
  }, []);

  const setDriveDirty = useCallback((dirty: boolean) => {
    hasPendingDriveChangesRef.current = dirty;
    setHasPendingDriveChanges(dirty);
    try {
      if (dirty) {
        localStorage.setItem(DRIVE_DIRTY_STORAGE_KEY, 'true');
      } else {
        localStorage.removeItem(DRIVE_DIRTY_STORAGE_KEY);
      }
    } catch {
      // Ignore storage errors
    }
  }, []);

  const recordDriveSyncTime = useCallback((iso: string | null) => {
    lastDriveSyncAtRef.current = iso;
    setLastDriveSyncAt(iso);
    try {
      if (iso) {
        localStorage.setItem(DRIVE_LAST_SYNC_KEY, iso);
      } else {
        localStorage.removeItem(DRIVE_LAST_SYNC_KEY);
      }
    } catch {
      // Ignore storage errors
    }
  }, []);

  const persistNote = useCallback(
    (note: Note) => {
      setDriveDirty(true);
      return db.saveNote(note);
    },
    [setDriveDirty]
  );

  const removeNote = useCallback(
    (noteId: string) => {
      setDriveDirty(true);
      void db.deleteNote(noteId);
    },
    [setDriveDirty]
  );

  const persistFolder = useCallback(
    (folder: Folder) => {
      setDriveDirty(true);
      void db.saveFolder(folder);
    },
    [setDriveDirty]
  );

  const removeFolder = useCallback(
    (folderId: string) => {
      setDriveDirty(true);
      void db.deleteFolder(folderId);
    },
    [setDriveDirty]
  );

  const persistTask = useCallback(
    (task: Task) => {
      setDriveDirty(true);
      void db.saveTask(task);
    },
    [setDriveDirty]
  );

  const removeTask = useCallback(
    (taskId: string) => {
      setDriveDirty(true);
      void db.deleteTask(taskId);
    },
    [setDriveDirty]
  );

  const persistGoal = useCallback(
    (goal: Goal) => {
      setDriveDirty(true);
      void db.saveGoal(goal);
    },
    [setDriveDirty]
  );

  const removeGoal = useCallback(
    (goalId: string) => {
      setDriveDirty(true);
      void db.deleteGoal(goalId);
    },
    [setDriveDirty]
  );

  const persistPrefs = useCallback(
    (nextPrefs: WorkspacePreferences, markDirty = false) => {
      if (markDirty) {
        setDriveDirty(true);
      }
      void db.savePreferences(nextPrefs);
    },
    [setDriveDirty]
  );

  // Google Auth & Google Drive access token listeners
  useEffect(() => {
    preloadGoogleAuth();
    const unsub = onGoogleAuthChanged((googleUser) => {
      setUser(googleUser);
      if (!googleUser) {
        clearDriveSessionCaches();
        setDriveFileId(null);
        setDriveFolderUrl(null);
        setDriveModifiedTime(null);
        setDriveAutoSave(false);
        setSilentRestoreFailed(false);
        setDriveRestoring(false);
      }
    });
    const unsubDrive = subscribeDriveAccessToken((token) => {
      const connected = Boolean(token);
      setDriveConnected(connected);
      if (connected) {
        setDriveRestoring(false);
        setSilentRestoreFailed(false);
      }
    });
    return () => {
      unsub();
      unsubDrive();
    };
  }, [setDriveAutoSave]);

  // Hydrate workspace from local IndexedDB cache on startup & purge notes past 30-day Trash retention
  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      const localData = await seedInitialWorkspaceIfEmpty();
      if (cancelled) return;
      const expiredIds = localData.notes
        .filter((n) => isTrashExpired(n.deletedAt))
        .map((n) => n.id);
      if (expiredIds.length > 0) {
        expiredIds.forEach((id) => void db.deleteNote(id));
      }
      const validNotes = localData.notes.filter((n) => !isTrashExpired(n.deletedAt));
      setFolders(localData.folders);
      setNotes(
        syncAutoJournalTitles(validNotes, localData.preferences.calendarLocale, (n) =>
          db.saveNote(n)
        )
      );
      setTasks(localData.tasks);
      setGoals(localData.goals);
      setPrefs(localData.preferences);
      setLoading(false);
    };
    void init();
    return () => {
      cancelled = true;
    };
  }, []);

  // Periodically purge any trashed notes whose 30-day recovery window expires while the app is open
  useEffect(() => {
    if (!notes.some((n) => Boolean(n.deletedAt))) return;
    const interval = window.setInterval(() => {
      setNotes((prev) => {
        const expired = prev.filter((n) => isTrashExpired(n.deletedAt));
        if (expired.length === 0) return prev;
        expired.forEach((n) => removeNote(n.id));
        return prev.filter((n) => !isTrashExpired(n.deletedAt));
      });
    }, 60_000);
    return () => window.clearInterval(interval);
  }, [notes, removeNote]);

  const applyDriveSnapshot = useCallback(
    async (result: DriveWorkspaceReadResult) => {
      if (!result.data) return;
      const validRemoteNotes = result.data.notes.filter((n) => !isTrashExpired(n.deletedAt));
      const hadExpiredTrash = validRemoteNotes.length !== result.data.notes.length;
      const hydratedNotes = syncAutoJournalTitles(
        validRemoteNotes,
        result.data.preferences.calendarLocale
      );
      const nextSnapshot = {
        folders: result.data.folders,
        notes: hydratedNotes,
        tasks: result.data.tasks,
        goals: result.data.goals,
        preferences: result.data.preferences,
      };
      await db.replaceWorkspace(nextSnapshot);
      setFolders(nextSnapshot.folders);
      setNotes(nextSnapshot.notes);
      setTasks(nextSnapshot.tasks);
      setGoals(nextSnapshot.goals);
      setPrefs(nextSnapshot.preferences);
      setDriveFileId(result.fileId);
      setDriveFolderUrl(result.folderUrl);
      setDriveModifiedTime(result.modifiedTime);
      setDriveDirty(hadExpiredTrash);
      recordDriveSyncTime(result.modifiedTime || result.data.updatedAt);
    },
    [setDriveDirty, recordDriveSyncTime]
  );

  const inspectDriveWorkspace = useCallback(
    async (accessToken: string, forceConflictCheck = false, isAutoRestore = false) => {
      const result = await readWorkspaceFromDrive(accessToken);
      if (!result || !result.data) {
        setDriveFileId(result?.fileId || null);
        setDriveFolderUrl(result?.folderUrl || null);
        setDriveModifiedTime(null);
        setDriveRemoteResult(null);
        setDriveSyncError(null);
        if (!isAutoRestore) {
          setDriveSyncModalMode('first_setup');
        }
        return;
      }

      setDriveFileId(result.fileId);
      setDriveFolderUrl(result.folderUrl);
      setDriveModifiedTime(result.modifiedTime);
      setDriveRemoteResult(result);

      const remoteMatchesLastSync = Boolean(
        result.modifiedTime &&
          lastDriveSyncAtRef.current &&
          result.modifiedTime === lastDriveSyncAtRef.current
      );

      if (!forceConflictCheck && driveAutoSaveEnabledRef.current) {
        if (hasPendingDriveChangesRef.current) {
          if (remoteMatchesLastSync) {
            // Local edits are strictly newer than the untouched Drive snapshot; let auto-save flush them cleanly
            setDriveSyncError(null);
            return;
          }
          setDriveSyncError(null);
          setDriveSyncModalMode('conflict');
          return;
        }
        await applyDriveSnapshot(result);
        setDriveSyncError(null);
        return;
      }

      if (hasPendingDriveChangesRef.current || forceConflictCheck) {
        setDriveSyncError(null);
        setDriveSyncModalMode('conflict');
        return;
      }

      await applyDriveSnapshot(result);
      setDriveSyncError(null);
      if (!isAutoRestore) {
        setDriveSyncModalMode('enable_autosave');
      }
    },
    [applyDriveSnapshot]
  );

  // Silently restore Google Drive session across page reloads when user previously signed in
  useEffect(() => {
    if (loading) return;
    const remembered = getCurrentGoogleUser();
    if (!remembered || getDriveAccessToken()) {
      setDriveRestoring(false);
      return;
    }

    let cancelled = false;
    setDriveRestoring(true);

    const restore = async () => {
      try {
        const res = await silentGoogleSignIn();
        if (cancelled) return;
        if (res?.accessToken) {
          setSilentRestoreFailed(false);
          await inspectDriveWorkspace(res.accessToken, false, true);
        } else {
          setSilentRestoreFailed(true);
        }
      } catch {
        if (!cancelled) {
          setSilentRestoreFailed(true);
        }
      } finally {
        if (!cancelled) {
          setDriveRestoring(false);
        }
      }
    };

    void restore();

    return () => {
      cancelled = true;
    };
  }, [loading, inspectDriveWorkspace]);

  // Live debounced auto-save directly to Google Drive whenever driveAutoSaveEnabled is confirmed
  useEffect(() => {
    if (!driveConnected || !driveAutoSaveEnabled || !hasPendingDriveChanges) return;
    const token = getDriveAccessToken();
    if (!token) return;

    if (autoSaveTimerRef.current) window.clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = window.setTimeout(async () => {
      const activeToken = getDriveAccessToken();
      if (!activeToken) return;
      setIsAutoSavingToDrive(true);
      setDriveSyncError(null);
      const persistSnapshot = async (tok: string) => {
        const current = workspaceRef.current;
        const saved = await saveWorkspaceToDrive(
          {
            folders: current.folders,
            notes: current.notes,
            tasks: current.tasks,
            goals: current.goals,
            preferences: current.prefs,
          },
          tok,
          driveFileIdRef.current
        );
        setDriveFileId(saved.fileId);
        setDriveFolderUrl(saved.folderUrl);
        setDriveModifiedTime(saved.modifiedTime);
        setDriveDirty(false);
        recordDriveSyncTime(saved.modifiedTime);
      };

      try {
        await persistSnapshot(activeToken);
      } catch (error) {
        if (!getDriveAccessToken()) {
          const refreshed = await silentGoogleSignIn();
          if (refreshed?.accessToken) {
            try {
              await persistSnapshot(refreshed.accessToken);
              return;
            } catch (retryErr) {
              setDriveSyncError(
                retryErr instanceof Error ? retryErr.message : 'Auto-save to Google Drive failed.'
              );
              return;
            }
          }
        }
        setDriveSyncError(
          error instanceof Error ? error.message : 'Auto-save to Google Drive failed.'
        );
      } finally {
        setIsAutoSavingToDrive(false);
      }
    }, 1000);

    return () => {
      if (autoSaveTimerRef.current) window.clearTimeout(autoSaveTimerRef.current);
    };
  }, [
    driveConnected,
    driveAutoSaveEnabled,
    hasPendingDriveChanges,
    folders,
    notes,
    tasks,
    goals,
    prefs,
    setDriveDirty,
    recordDriveSyncTime,
  ]);

  const driveSaveStatus: DriveSaveStatus = !driveConnected
    ? 'disconnected'
    : isAutoSavingToDrive || driveSyncBusy || (driveAutoSaveEnabled && hasPendingDriveChanges)
    ? 'saving'
    : driveSyncError
    ? 'error'
    : !driveAutoSaveEnabled
    ? 'manual'
    : 'saved';

  const handleSignIn = useCallback(async () => {
    setAuthError(null);
    setAuthBusy(true);
    try {
      const res = await googleSignIn();
      if (res.accessToken) {
        await inspectDriveWorkspace(res.accessToken);
      } else {
        setAuthError(
          'Google Drive permission was not granted. Please try connecting again and allow Google Drive access.'
        );
      }
    } catch (error) {
      const code =
        error && typeof error === 'object' && 'code' in error
          ? String((error as { code: unknown }).code)
          : '';
      if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') {
        setAuthError(
          error instanceof Error ? error.message : 'Unable to connect Google Drive.'
        );
      }
    } finally {
      setAuthBusy(false);
    }
  }, [inspectDriveWorkspace]);

  const handleSignOut = useCallback(async () => {
    setAuthError(null);
    setAuthBusy(true);
    try {
      await googleSignOut();
      clearDriveSessionCaches();
      setDriveFileId(null);
      setDriveFolderUrl(null);
      setDriveModifiedTime(null);
      setDriveRemoteResult(null);
      setDriveAutoSave(false);
      recordDriveSyncTime(null);
      setSilentRestoreFailed(false);
      setDriveRestoring(false);
      setDriveSyncModalMode(null);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Unable to sign out.');
    } finally {
      setAuthBusy(false);
    }
  }, [setDriveAutoSave, recordDriveSyncTime]);

  const handleRequestSaveToDrive = useCallback(() => {
    const token = getDriveAccessToken();
    if (!token) {
      void handleSignIn();
      return;
    }
    setDriveSyncError(null);
    setDriveSyncModalMode('save');
  }, [handleSignIn]);

  const handleReloadFromDrive = useCallback(async () => {
    const token = getDriveAccessToken();
    if (!token) {
      void handleSignIn();
      return;
    }
    setAuthError(null);
    setAuthBusy(true);
    try {
      await inspectDriveWorkspace(token, hasPendingDriveChangesRef.current);
    } catch (error) {
      setAuthError(
        error instanceof Error ? error.message : 'Failed to reload workspace from Google Drive.'
      );
    } finally {
      setAuthBusy(false);
    }
  }, [handleSignIn, inspectDriveWorkspace]);

  const handleConfirmSaveToDrive = useCallback(async () => {
    const token = getDriveAccessToken();
    if (!token) {
      setDriveSyncModalMode(null);
      void handleSignIn();
      return;
    }
    setDriveSyncBusy(true);
    setDriveSyncError(null);
    try {
      const current = workspaceRef.current;
      const saved = await saveWorkspaceToDrive(
        {
          folders: current.folders,
          notes: current.notes,
          tasks: current.tasks,
          goals: current.goals,
          preferences: current.prefs,
        },
        token,
        driveFileId
      );
      setDriveFileId(saved.fileId);
      setDriveFolderUrl(saved.folderUrl);
      setDriveModifiedTime(saved.modifiedTime);
      setDriveDirty(false);
      setDriveAutoSave(true);
      recordDriveSyncTime(saved.modifiedTime);
      setDriveSyncModalMode(null);
    } catch (error) {
      setDriveSyncError(
        error instanceof Error ? error.message : 'Failed to save workspace to Google Drive.'
      );
    } finally {
      setDriveSyncBusy(false);
    }
  }, [driveFileId, handleSignIn, setDriveDirty, setDriveAutoSave, recordDriveSyncTime]);

  const handleConfirmEnableAutoSave = useCallback(() => {
    setDriveAutoSave(true);
    setDriveSyncModalMode(null);
  }, [setDriveAutoSave]);

  const handleToggleDriveAutoSave = useCallback(() => {
    if (driveAutoSaveEnabled) {
      setDriveAutoSave(false);
    } else {
      setDriveSyncError(null);
      setDriveSyncModalMode('save');
    }
  }, [driveAutoSaveEnabled, setDriveAutoSave]);

  const handleConfirmLoadFromDrive = useCallback(async () => {
    if (!driveRemoteResult?.data) return;
    setDriveSyncBusy(true);
    setDriveSyncError(null);
    try {
      await applyDriveSnapshot(driveRemoteResult);
      setDriveAutoSave(true);
      setDriveSyncModalMode(null);
    } catch (error) {
      setDriveSyncError(
        error instanceof Error ? error.message : 'Failed to load workspace from Google Drive.'
      );
    } finally {
      setDriveSyncBusy(false);
    }
  }, [driveRemoteResult, applyDriveSnapshot, setDriveAutoSave]);

  // Sync theme classes on <html>
  useEffect(() => {
    const root = document.documentElement;
    const isDarkSurface = prefs.theme === 'dark' || prefs.theme === 'cybery';
    root.classList.toggle('dark', isDarkSurface);
    root.classList.toggle('theme-cybery', prefs.theme === 'cybery');
    root.classList.toggle('theme-pink', prefs.theme === 'pink');
    root.dataset.theme = prefs.theme;
  }, [prefs.theme]);

  const cycleTheme = useCallback(
    (current: WorkspaceTheme): WorkspaceTheme => {
      const idx = THEME_ORDER.indexOf(current);
      return THEME_ORDER[(idx + 1) % THEME_ORDER.length];
    },
    []
  );

  const updatePrefs = useCallback(
    (patch: Partial<WorkspacePreferences>) => {
      const isSyncablePrefChange =
        patch.theme !== undefined || patch.calendarLocale !== undefined;
      setPrefs((prev) => {
        const next = { ...prev, ...patch };
        persistPrefs(next, isSyncablePrefChange);
        return next;
      });
    },
    [persistPrefs]
  );

  const handleChangeCalendarLocale = useCallback(
    (locale: CalendarLocale) => {
      updatePrefs({ calendarLocale: locale });
      setNotes((prev) => syncAutoJournalTitles(prev, locale, persistNote));
    },
    [updatePrefs, persistNote]
  );

  const buildTabListWithActiveFallback = useCallback((p: WorkspacePreferences): string[] => {
    const base = Array.isArray(p.openTabIds) ? [...p.openTabIds] : [];
    if (p.activeSection === 'editor' && p.activeNoteId && !base.includes(p.activeNoteId)) {
      base.push(p.activeNoteId);
    }
    return base;
  }, []);

  // Note CRUD with reliable per-note debounced autosave so rapid tab switches never drop edits
  const handleUpdateNote = useCallback(
    (updated: Note) => {
      setNotes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
      setSaveState('saving');
      const existingTimer = saveTimersRef.current.get(updated.id);
      if (existingTimer) window.clearTimeout(existingTimer);
      const timerId = window.setTimeout(() => {
        saveTimersRef.current.delete(updated.id);
        persistNote(updated).then(() => {
          if (saveTimersRef.current.size === 0) {
            setSaveState('saved');
          }
        });
      }, 360);
      saveTimersRef.current.set(updated.id, timerId);
    },
    [persistNote]
  );

  const openNoteInTab = useCallback(
    (noteId: string, extraPatch?: Partial<WorkspacePreferences>) => {
      setPrefs((prev) => {
        const tabs = buildTabListWithActiveFallback(prev);
        const nextTabs = tabs.includes(noteId) ? tabs : [...tabs, noteId];
        const next: WorkspacePreferences = {
          ...prev,
          ...extraPatch,
          openTabIds: nextTabs,
          activeSection: 'editor',
          activeNoteId: noteId,
        };
        persistPrefs(next, false);
        return next;
      });
    },
    [buildTabListWithActiveFallback, persistPrefs]
  );

  const handleCreateNote = useCallback(
    (parentFolderId: string | null = null) => {
      const now = new Date().toISOString();
      const newNote: Note = {
        id: createId('note'),
        title: '',
        content: EMPTY_DOC,
        plainText: '',
        parentFolderId,
        icon: null,
        coverImage: null,
        tags: [],
        isFavorite: false,
        isPinned: false,
        isArchived: false,
        sortOrder: 0,
        journalDate: null,
        linkedNoteIds: [],
        createdAt: now,
        updatedAt: now,
      };
      setNotes((prev) => [newNote, ...prev]);
      persistNote(newNote);
      openNoteInTab(newNote.id, { activeFolderId: parentFolderId });
    },
    [openNoteInTab, persistNote]
  );

  const handleDuplicateNote = useCallback(
    (source: Note) => {
      const now = new Date().toISOString();
      const copy: Note = {
        ...source,
        id: createId('note'),
        title: `${source.title || 'Untitled'} (Copy)`,
        isPinned: false,
        createdAt: now,
        updatedAt: now,
      };
      setNotes((prev) => [copy, ...prev]);
      persistNote(copy);
      setPrefs((prev) => {
        const tabs = buildTabListWithActiveFallback(prev);
        const srcIdx = tabs.indexOf(source.id);
        const nextTabs = [...tabs];
        if (srcIdx >= 0) {
          nextTabs.splice(srcIdx + 1, 0, copy.id);
        } else {
          nextTabs.push(copy.id);
        }
        const next: WorkspacePreferences = {
          ...prev,
          openTabIds: nextTabs,
          activeSection: 'editor',
          activeNoteId: copy.id,
        };
        persistPrefs(next, false);
        return next;
      });
    },
    [buildTabListWithActiveFallback, persistNote, persistPrefs]
  );

  const showTrashUndoToast = useCallback((noteId: string, title: string) => {
    if (trashToastTimerRef.current) {
      window.clearTimeout(trashToastTimerRef.current);
    }
    setTrashToast({ noteId, title });
    trashToastTimerRef.current = window.setTimeout(() => {
      setTrashToast(null);
      trashToastTimerRef.current = null;
    }, 6500);
  }, []);

  useEffect(() => {
    const timers = saveTimersRef.current;
    return () => {
      timers.forEach((id) => window.clearTimeout(id));
      timers.clear();
      if (trashToastTimerRef.current) {
        window.clearTimeout(trashToastTimerRef.current);
      }
    };
  }, []);

  // Soft-delete note into 30-day Trash (or prompt permanent deletion if already trashed)
  const handleDeleteNote = useCallback(
    (noteId: string) => {
      const target = notes.find((n) => n.id === noteId);
      if (!target) return;
      if (target.deletedAt) {
        setPendingPermanentDelete({ kind: 'note', note: target });
        return;
      }

      const pendingTimer = saveTimersRef.current.get(noteId);
      if (pendingTimer) {
        window.clearTimeout(pendingTimer);
        saveTimersRef.current.delete(noteId);
        if (saveTimersRef.current.size === 0) {
          setSaveState('saved');
        }
      }

      const now = new Date().toISOString();
      const trashedNote: Note = {
        ...target,
        deletedAt: now,
        isPinned: false,
        updatedAt: now,
      };

      setNotes((prev) => prev.map((n) => (n.id === noteId ? trashedNote : n)));
      persistNote(trashedNote);

      setPrefs((prev) => {
        const tabs = buildTabListWithActiveFallback(prev);
        const closedIdx = tabs.indexOf(noteId);
        const nextTabs = tabs.filter((id) => id !== noteId);
        const wasActive = prev.activeNoteId === noteId;
        if (!wasActive && closedIdx === -1) return prev;

        const nextActiveId = wasActive
          ? nextTabs[closedIdx] ?? nextTabs[closedIdx - 1] ?? null
          : prev.activeNoteId;
        const nextSection: WorkspaceSection = wasActive
          ? nextActiveId
            ? 'editor'
            : 'all_notes'
          : prev.activeSection;

        const next: WorkspacePreferences = {
          ...prev,
          openTabIds: nextTabs,
          activeNoteId: nextActiveId,
          activeSection: nextSection,
        };
        persistPrefs(next, false);
        return next;
      });
      showTrashUndoToast(trashedNote.id, trashedNote.title || 'Untitled');
    },
    [notes, buildTabListWithActiveFallback, persistNote, persistPrefs, showTrashUndoToast]
  );

  const handleRestoreNote = useCallback(
    (noteId: string) => {
      const target = notes.find((n) => n.id === noteId);
      if (!target) return;
      const folderStillExists =
        target.parentFolderId && folders.some((f) => f.id === target.parentFolderId);
      const restored: Note = {
        ...target,
        deletedAt: null,
        parentFolderId: folderStillExists ? target.parentFolderId : null,
        updatedAt: new Date().toISOString(),
      };
      setNotes((prev) => prev.map((n) => (n.id === noteId ? restored : n)));
      persistNote(restored);
      setTrashToast((prev) => (prev?.noteId === noteId ? null : prev));
    },
    [notes, folders, persistNote]
  );

  const handlePermanentDeleteNote = useCallback(
    (noteId: string) => {
      const target = notes.find((n) => n.id === noteId);
      if (!target) return;
      setPendingPermanentDelete({ kind: 'note', note: target });
    },
    [notes]
  );

  const handleEmptyTrash = useCallback(() => {
    const count = notes.filter((n) => Boolean(n.deletedAt)).length;
    if (count === 0) return;
    setPendingPermanentDelete({ kind: 'empty_trash', count });
  }, [notes]);

  const handleSelectNote = useCallback(
    (noteId: string) => {
      openNoteInTab(noteId);
    },
    [openNoteInTab]
  );

  const handleActivateTab = useCallback(
    (noteId: string) => {
      updatePrefs({ activeSection: 'editor', activeNoteId: noteId });
    },
    [updatePrefs]
  );

  const handleCloseTab = useCallback(
    (noteId: string) => {
      setPrefs((prev) => {
        const tabs = buildTabListWithActiveFallback(prev);
        const closedIdx = tabs.indexOf(noteId);
        if (closedIdx === -1) return prev;
        const nextTabs = tabs.filter((id) => id !== noteId);
        const closingActive = prev.activeSection === 'editor' && prev.activeNoteId === noteId;
        const nextActiveId = closingActive
          ? nextTabs[closedIdx] ?? nextTabs[closedIdx - 1] ?? null
          : prev.activeNoteId;
        const nextSection: WorkspaceSection = closingActive
          ? nextActiveId
            ? 'editor'
            : 'all_notes'
          : prev.activeSection;

        const next: WorkspacePreferences = {
          ...prev,
          openTabIds: nextTabs,
          activeNoteId: nextActiveId,
          activeSection: nextSection,
        };
        persistPrefs(next, false);
        return next;
      });
    },
    [buildTabListWithActiveFallback, persistPrefs]
  );

  const handleCloseOtherTabs = useCallback(
    (keepNoteId: string) => {
      setPrefs((prev) => {
        const next: WorkspacePreferences = {
          ...prev,
          openTabIds: [keepNoteId],
          activeNoteId: keepNoteId,
          activeSection: 'editor',
        };
        persistPrefs(next, false);
        return next;
      });
    },
    [persistPrefs]
  );

  const handleCloseTabsToRight = useCallback(
    (noteId: string) => {
      setPrefs((prev) => {
        const tabs = buildTabListWithActiveFallback(prev);
        const idx = tabs.indexOf(noteId);
        if (idx === -1) return prev;
        const nextTabs = tabs.slice(0, idx + 1);
        const activeStillOpen = Boolean(prev.activeNoteId && nextTabs.includes(prev.activeNoteId));
        const nextActiveId =
          prev.activeSection === 'editor' && !activeStillOpen ? noteId : prev.activeNoteId;
        const next: WorkspacePreferences = {
          ...prev,
          openTabIds: nextTabs,
          activeNoteId: nextActiveId,
        };
        persistPrefs(next, false);
        return next;
      });
    },
    [buildTabListWithActiveFallback, persistPrefs]
  );

  const handleCloseAllTabs = useCallback(() => {
    setPrefs((prev) => {
      const next: WorkspacePreferences = {
        ...prev,
        openTabIds: [],
        activeNoteId: null,
        activeSection: prev.activeSection === 'editor' ? 'all_notes' : prev.activeSection,
      };
      persistPrefs(next, false);
      return next;
    });
  }, [persistPrefs]);

  const handleReorderTabs = useCallback(
    (draggedId: string, targetId: string) => {
      if (draggedId === targetId) return;
      setPrefs((prev) => {
        const tabs = buildTabListWithActiveFallback(prev);
        const fromIdx = tabs.indexOf(draggedId);
        const toIdx = tabs.indexOf(targetId);
        if (fromIdx === -1 || toIdx === -1) return prev;
        const nextTabs = [...tabs];
        const [moved] = nextTabs.splice(fromIdx, 1);
        nextTabs.splice(toIdx, 0, moved);
        const next: WorkspacePreferences = {
          ...prev,
          openTabIds: nextTabs,
        };
        persistPrefs(next, false);
        return next;
      });
    },
    [buildTabListWithActiveFallback, persistPrefs]
  );

  const handleSelectFolder = useCallback(
    (folderId: string | null) => {
      if (!folderId) {
        updatePrefs({ activeSection: 'all_notes', activeFolderId: null });
      } else {
        updatePrefs({ activeSection: 'folder', activeFolderId: folderId });
      }
    },
    [updatePrefs]
  );

  // Open or create Daily Journal entry using the unified Note model
  const handleOpenJournalDate = useCallback(
    (dateKey: string, createAdditional = false) => {
      if (!createAdditional) {
        const existing = notes.find(
          (n) => !n.isArchived && !n.deletedAt && n.journalDate === dateKey
        );
        if (existing) {
          openNoteInTab(existing.id);
          return;
        }
      }

      const dailyLifeFolder = folders.find(
        (f) => f.name.toLowerCase() === 'daily life'
      );
      const now = new Date().toISOString();
      const suffixCount = notes.filter((n) => !n.deletedAt && n.journalDate === dateKey).length;
      const localizedTitle = buildAutoJournalTitle(
        dateKey,
        prefs.calendarLocale,
        suffixCount + 1
      );

      const newEntry: Note = {
        id: createId('note'),
        title: localizedTitle,
        content: EMPTY_DOC,
        plainText: '',
        parentFolderId: dailyLifeFolder ? dailyLifeFolder.id : null,
        icon: '📔',
        coverImage: null,
        tags: ['journal'],
        isFavorite: false,
        isPinned: false,
        isArchived: false,
        deletedAt: null,
        sortOrder: 0,
        journalDate: dateKey,
        isCustomJournalTitle: false,
        journalMetadata: {},
        linkedNoteIds: [],
        createdAt: now,
        updatedAt: now,
      };
      setNotes((prev) => [newEntry, ...prev]);
      persistNote(newEntry);
      openNoteInTab(newEntry.id);
    },
    [notes, folders, prefs.calendarLocale, openNoteInTab, persistNote]
  );

  // Folder CRUD
  const handleCreateFolder = useCallback(
    (name: string, parentId: string | null, icon = '📁') => {
      const now = new Date().toISOString();
      const folder: Folder = {
        id: createId('fld'),
        name,
        parentId,
        icon,
        isPinned: false,
        isExpanded: true,
        sortOrder: folders.filter((f) => f.parentId === parentId).length,
        createdAt: now,
        updatedAt: now,
      };
      setFolders((prev) => [...prev, folder]);
      persistFolder(folder);
      if (parentId) {
        const parent = folders.find((f) => f.id === parentId);
        if (parent && !parent.isExpanded) {
          const expandedParent = { ...parent, isExpanded: true };
          setFolders((prev) =>
            prev.map((f) => (f.id === parentId ? expandedParent : f))
          );
          persistFolder(expandedParent);
        }
      }
    },
    [folders, persistFolder]
  );

  const handleUpdateFolder = useCallback(
    (folder: Folder) => {
      setFolders((prev) => prev.map((f) => (f.id === folder.id ? folder : f)));
      persistFolder(folder);
    },
    [persistFolder]
  );

  const handleExpandCollapseAllFolders = useCallback(
    (expanded: boolean) => {
      setFolders((prev) => {
        const next = prev.map((f) => ({ ...f, isExpanded: expanded }));
        next.forEach((f) => persistFolder(f));
        return next;
      });
    },
    [persistFolder]
  );

  const handleDeleteFolder = useCallback(
    (folderId: string, strategy: 'move_to_parent' | 'delete_contents') => {
      const target = folders.find((f) => f.id === folderId);
      if (!target) return;

      if (strategy === 'move_to_parent') {
        const nextFolders = folders
          .filter((f) => f.id !== folderId)
          .map((f) => {
            if (f.parentId === folderId) {
              const updated = { ...f, parentId: target.parentId };
              persistFolder(updated);
              return updated;
            }
            return f;
          });
        const nextNotes = notes.map((n) => {
          if (n.parentFolderId === folderId) {
            const updated = { ...n, parentFolderId: target.parentId };
            persistNote(updated);
            return updated;
          }
          return n;
        });
        setFolders(nextFolders);
        setNotes(nextNotes);
        removeFolder(folderId);
      } else {
        // Recursively collect all descendant folder IDs
        const toDeleteIds = new Set<string>([folderId]);
        let added = true;
        while (added) {
          added = false;
          for (const f of folders) {
            if (f.parentId && toDeleteIds.has(f.parentId) && !toDeleteIds.has(f.id)) {
              toDeleteIds.add(f.id);
              added = true;
            }
          }
        }
        toDeleteIds.forEach((id) => removeFolder(id));
        const now = new Date().toISOString();
        const affectedNoteIds = new Set<string>();
        const nextNotes = notes.map((n) => {
          if (n.parentFolderId && toDeleteIds.has(n.parentFolderId)) {
            affectedNoteIds.add(n.id);
            const movedToTrash: Note = {
              ...n,
              parentFolderId: null,
              isPinned: false,
              deletedAt: n.deletedAt || now,
              updatedAt: now,
            };
            persistNote(movedToTrash);
            return movedToTrash;
          }
          return n;
        });
        setFolders((prev) => prev.filter((f) => !toDeleteIds.has(f.id)));
        setNotes(nextNotes);
        if (affectedNoteIds.size > 0) {
          setPrefs((prev) => {
            const tabs = buildTabListWithActiveFallback(prev);
            const nextTabs = tabs.filter((id) => !affectedNoteIds.has(id));
            const wasActiveAffected = Boolean(
              prev.activeNoteId && affectedNoteIds.has(prev.activeNoteId)
            );
            const nextActiveId = wasActiveAffected ? nextTabs[0] ?? null : prev.activeNoteId;
            const nextSection: WorkspaceSection = wasActiveAffected
              ? nextActiveId
                ? 'editor'
                : 'dashboard'
              : prev.activeSection;
            const next: WorkspacePreferences = {
              ...prev,
              openTabIds: nextTabs,
              activeNoteId: nextActiveId,
              activeSection: nextSection,
            };
            persistPrefs(next, false);
            return next;
          });
        }
      }

      if (prefs.activeFolderId === folderId) {
        updatePrefs({ activeFolderId: null, activeSection: 'all_notes' });
      }
    },
    [
      folders,
      notes,
      prefs.activeFolderId,
      buildTabListWithActiveFallback,
      updatePrefs,
      persistFolder,
      persistNote,
      persistPrefs,
      removeFolder,
    ]
  );

  const handleMoveNote = useCallback(
    (noteId: string, targetFolderId: string | null) => {
      setNotes((prev) =>
        prev.map((n) => {
          if (n.id !== noteId) return n;
          const updated = {
            ...n,
            parentFolderId: targetFolderId,
            updatedAt: new Date().toISOString(),
          };
          persistNote(updated);
          return updated;
        })
      );
    },
    [persistNote]
  );

  const handleMoveFolder = useCallback(
    (folderId: string, targetParentId: string | null) => {
      if (folderId === targetParentId) return;
      // Circular nesting protection
      let curr: string | null = targetParentId;
      const seen = new Set<string>();
      while (curr && !seen.has(curr)) {
        if (curr === folderId) return;
        seen.add(curr);
        const f = folders.find((item) => item.id === curr);
        curr = f ? f.parentId : null;
      }

      setFolders((prev) =>
        prev.map((f) => {
          if (f.id !== folderId) return f;
          const updated = {
            ...f,
            parentId: targetParentId,
            updatedAt: new Date().toISOString(),
          };
          persistFolder(updated);
          return updated;
        })
      );
    },
    [folders, persistFolder]
  );

  // Tasks & Goals CRUD
  const handleSaveTask = useCallback(
    (task: Task) => {
      setTasks((prev) => {
        const exists = prev.some((t) => t.id === task.id);
        return exists ? prev.map((t) => (t.id === task.id ? task : t)) : [task, ...prev];
      });
      persistTask(task);
    },
    [persistTask]
  );

  const handleDeleteTask = useCallback(
    (taskId: string) => {
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
      removeTask(taskId);
    },
    [removeTask]
  );

  const handleToggleTask = useCallback(
    (taskId: string) => {
      const target = tasks.find((t) => t.id === taskId);
      if (!target) return;
      const nextStatus = target.status === 'done' ? 'todo' : 'done';
      handleSaveTask({
        ...target,
        status: nextStatus,
        completedAt: nextStatus === 'done' ? new Date().toISOString() : null,
        updatedAt: new Date().toISOString(),
      });
    },
    [tasks, handleSaveTask]
  );

  const handleCreateLinkedTask = useCallback(
    (title: string, noteId: string) => {
      const now = new Date().toISOString();
      const newTask: Task = {
        id: createId('task'),
        title,
        description: '',
        status: 'todo',
        priority: 'medium',
        dueDate: toDateKey(),
        folderId: null,
        linkedNoteId: noteId,
        linkedGoalId: null,
        createdAt: now,
        updatedAt: now,
        completedAt: null,
      };
      handleSaveTask(newTask);
    },
    [handleSaveTask]
  );

  const handleCreateTaskForGoal = useCallback(
    (title: string, goalId: string) => {
      const now = new Date().toISOString();
      const newTask: Task = {
        id: createId('task'),
        title,
        description: '',
        status: 'todo',
        priority: 'medium',
        dueDate: null,
        folderId: null,
        linkedNoteId: null,
        linkedGoalId: goalId,
        createdAt: now,
        updatedAt: now,
        completedAt: null,
      };
      handleSaveTask(newTask);
    },
    [handleSaveTask]
  );

  const handleSaveGoal = useCallback(
    (goal: Goal) => {
      setGoals((prev) => {
        const exists = prev.some((g) => g.id === goal.id);
        return exists ? prev.map((g) => (g.id === goal.id ? goal : g)) : [goal, ...prev];
      });
      persistGoal(goal);
    },
    [persistGoal]
  );

  const handleDeleteGoal = useCallback(
    (goalId: string) => {
      setGoals((prev) => prev.filter((g) => g.id !== goalId));
      removeGoal(goalId);
    },
    [removeGoal]
  );

  // Global keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleRequestSaveToDrive();
      } else if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
        e.preventDefault();
        updatePrefs({ leftSidebarCollapsed: !prefs.leftSidebarCollapsed });
      } else if ((e.metaKey || e.ctrlKey) && e.key === '.') {
        e.preventDefault();
        updatePrefs({ rightSidebarOpen: !prefs.rightSidebarOpen });
      } else if (e.altKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        handleCreateNote(prefs.activeSection === 'folder' ? prefs.activeFolderId : null);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [prefs, updatePrefs, handleCreateNote, handleRequestSaveToDrive]);

  const activeNote = useMemo(
    () => notes.find((n) => n.id === prefs.activeNoteId && !n.deletedAt) || null,
    [notes, prefs.activeNoteId]
  );

  const openTabNotes = useMemo(() => {
    const activeById = new Map<string, Note>();
    for (const n of notes) {
      if (!n.deletedAt) activeById.set(n.id, n);
    }
    const rawIds = buildTabListWithActiveFallback(prefs);
    const seen = new Set<string>();
    const resolved: Note[] = [];
    for (const id of rawIds) {
      if (seen.has(id)) continue;
      const note = activeById.get(id);
      if (note) {
        seen.add(id);
        resolved.push(note);
      }
    }
    return resolved;
  }, [notes, prefs, buildTabListWithActiveFallback]);

  const activeFolder = useMemo(
    () => folders.find((f) => f.id === prefs.activeFolderId) || null,
    [folders, prefs.activeFolderId]
  );

  const trashedNotes = useMemo(
    () => notes.filter((n) => Boolean(n.deletedAt)),
    [notes]
  );

  // Filtered note collections for browser views
  const browserViewMeta = useMemo(() => {
    const nonArchived = notes.filter((n) => !n.isArchived && !n.deletedAt);
    if (prefs.activeSection === 'quick_access') {
      return {
        title: 'Quick Access',
        subtitle: 'Pinned notes and folders',
        items: nonArchived.filter((n) => n.isPinned),
        pinnedFolders: folders.filter((f) => f.isPinned),
      };
    }
    if (prefs.activeSection === 'favorites') {
      return {
        title: 'Favorites',
        subtitle: 'Starred pages and entries',
        items: nonArchived.filter((n) => n.isFavorite),
        pinnedFolders: [],
      };
    }
    if (prefs.activeSection === 'recent') {
      return {
        title: 'Recent Notes',
        subtitle: 'Ordered by last modified',
        items: [...nonArchived].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
        pinnedFolders: [],
      };
    }
    if (prefs.activeSection === 'archived') {
      return {
        title: 'Archived Notes',
        subtitle: 'Restore or remove archived pages',
        items: notes.filter((n) => n.isArchived && !n.deletedAt),
        pinnedFolders: [],
      };
    }
    if (prefs.activeSection === 'folder' && activeFolder) {
      // Collect notes inside activeFolder and its subfolders
      const subtreeIds = new Set<string>([activeFolder.id]);
      let added = true;
      while (added) {
        added = false;
        for (const f of folders) {
          if (f.parentId && subtreeIds.has(f.parentId) && !subtreeIds.has(f.id)) {
            subtreeIds.add(f.id);
            added = true;
          }
        }
      }
      return {
        title: `${activeFolder.icon} ${activeFolder.name}`,
        subtitle: 'Notes in this folder and its subfolders',
        items: nonArchived.filter(
          (n) => n.parentFolderId && subtreeIds.has(n.parentFolderId)
        ),
        pinnedFolders: [],
      };
    }
    return {
      title: 'All Notes',
      subtitle: `${nonArchived.length} active pages`,
      items: nonArchived,
      pinnedFolders: [],
    };
  }, [notes, folders, prefs.activeSection, activeFolder]);

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[var(--bg-canvas)] text-sm text-[var(--text-secondary)]">
        Loading workspace...
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[var(--bg-canvas)] text-[var(--text-primary)]">
      {/* Left Sidebar */}
      {!prefs.leftSidebarCollapsed ? (
        <LeftSidebar
          folders={folders}
          notes={notes}
          activeSection={prefs.activeSection}
          activeNoteId={prefs.activeNoteId}
          activeFolderId={prefs.activeFolderId}
          theme={prefs.theme}
          calendarLocale={prefs.calendarLocale}
          sidebarWidth={prefs.leftSidebarWidth}
          mobileOpen={mobileSidebarOpen}
          onCloseMobile={() => setMobileSidebarOpen(false)}
          onCollapseDesktop={() => updatePrefs({ leftSidebarCollapsed: true })}
          onResizeWidth={(leftSidebarWidth) => updatePrefs({ leftSidebarWidth })}
          onToggleTheme={() => updatePrefs({ theme: cycleTheme(prefs.theme) })}
          onOpenSettings={() => setSettingsOpen(true)}
          onSelectSection={(section: WorkspaceSection) =>
            updatePrefs({ activeSection: section, activeFolderId: null })
          }
          onSelectFolder={(folderId) => handleSelectFolder(folderId)}
          onSelectNote={handleSelectNote}
          onCreateNote={handleCreateNote}
          onCreateFolder={handleCreateFolder}
          onUpdateFolder={handleUpdateFolder}
          onDeleteFolder={handleDeleteFolder}
          onExpandCollapseAllFolders={handleExpandCollapseAllFolders}
          onMoveNote={handleMoveNote}
          onMoveFolder={handleMoveFolder}
          onUpdateNote={handleUpdateNote}
          onDuplicateNote={handleDuplicateNote}
          onDeleteNote={handleDeleteNote}
          onOpenSearch={() => setSearchOpen(true)}
          user={user}
          driveConnected={driveConnected}
          driveRestoring={driveRestoring}
          driveSaveStatus={driveSaveStatus}
          driveAutoSaveEnabled={driveAutoSaveEnabled}
          hasPendingDriveChanges={hasPendingDriveChanges}
          authBusy={authBusy}
          onSignIn={handleSignIn}
          onSignOut={handleSignOut}
          onRequestSaveToDrive={handleRequestSaveToDrive}
          onReloadFromDrive={handleReloadFromDrive}
        />
      ) : (
        <>
          <button
            type="button"
            onClick={() => updatePrefs({ leftSidebarCollapsed: false })}
            title="Expand sidebar (Ctrl+\)"
            className="hidden lg:flex fixed left-3 top-2.5 z-30 h-8 w-8 items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] cursor-pointer"
          >
            <PanelLeftOpen className="h-4 w-4" />
          </button>
          {mobileSidebarOpen && (
            <LeftSidebar
              folders={folders}
              notes={notes}
              activeSection={prefs.activeSection}
              activeNoteId={prefs.activeNoteId}
              activeFolderId={prefs.activeFolderId}
              theme={prefs.theme}
              calendarLocale={prefs.calendarLocale}
              sidebarWidth={prefs.leftSidebarWidth}
              mobileOpen={mobileSidebarOpen}
              onCloseMobile={() => setMobileSidebarOpen(false)}
              onCollapseDesktop={() => updatePrefs({ leftSidebarCollapsed: true })}
              onResizeWidth={(leftSidebarWidth) => updatePrefs({ leftSidebarWidth })}
              onToggleTheme={() => updatePrefs({ theme: cycleTheme(prefs.theme) })}
              onOpenSettings={() => setSettingsOpen(true)}
              onSelectSection={(section: WorkspaceSection) =>
                updatePrefs({ activeSection: section, activeFolderId: null })
              }
              onSelectFolder={(folderId) => handleSelectFolder(folderId)}
              onSelectNote={handleSelectNote}
              onCreateNote={handleCreateNote}
              onCreateFolder={handleCreateFolder}
              onUpdateFolder={handleUpdateFolder}
              onDeleteFolder={handleDeleteFolder}
              onExpandCollapseAllFolders={handleExpandCollapseAllFolders}
              onMoveNote={handleMoveNote}
              onMoveFolder={handleMoveFolder}
              onUpdateNote={handleUpdateNote}
              onDuplicateNote={handleDuplicateNote}
              onDeleteNote={handleDeleteNote}
              onOpenSearch={() => setSearchOpen(true)}
              user={user}
              driveConnected={driveConnected}
              driveRestoring={driveRestoring}
              driveSaveStatus={driveSaveStatus}
              driveAutoSaveEnabled={driveAutoSaveEnabled}
              hasPendingDriveChanges={hasPendingDriveChanges}
              authBusy={authBusy}
              onSignIn={handleSignIn}
              onSignOut={handleSignOut}
              onRequestSaveToDrive={handleRequestSaveToDrive}
              onReloadFromDrive={handleReloadFromDrive}
            />
          )}
        </>
      )}

      {/* Main Content Area */}
      <main className="vellum-main-canvas relative min-w-0 flex-1 h-full overflow-hidden flex flex-col">
        {authError && (
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-red-500/30 bg-red-500/10 px-4 py-2 text-xs text-red-400">
            <span className="truncate">{authError}</span>
            <button
              type="button"
              onClick={() => setAuthError(null)}
              className="shrink-0 rounded p-0.5 hover:bg-red-500/20 cursor-pointer"
              aria-label="Dismiss message"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        {!driveConnected && driveRestoring && (
          <div className="flex shrink-0 items-center gap-2 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-1.5 text-xs text-[var(--text-secondary)]">
            <Cloud className="h-3.5 w-3.5 shrink-0 animate-pulse text-[var(--accent)]" />
            <span className="truncate">
              Restoring Google Drive sync for {user?.email || user?.displayName || 'your account'}...
            </span>
          </div>
        )}
        {!driveConnected && !driveRestoring && (
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2.5 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs text-amber-800 dark:text-amber-200">
            <span className="flex items-center gap-2 min-w-0">
              <Cloud className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <span className="truncate">
                {user && silentRestoreFailed
                  ? `Drive sync paused after refresh (Google requires 1 click to resume access for ${
                      user.email || 'your account'
                    }). Your Drive data is safe.`
                  : user
                  ? 'Google Drive disconnected — browser storage is temporary. Reconnect to load & auto-save your workspace to Drive.'
                  : 'Google Drive is your primary storage — connect Google Drive to load & auto-save all notes, tasks, goals, and media.'}
              </span>
            </span>
            <GoogleSignInButton
              label={
                authBusy
                  ? 'Connecting...'
                  : user
                  ? 'Reconnect Google Drive'
                  : 'Connect Google Drive'
              }
              disabled={authBusy}
              onClick={handleSignIn}
            />
          </div>
        )}
        {driveConnected && hasPendingDriveChanges && (!driveAutoSaveEnabled || driveSaveStatus === 'error') && prefs.activeSection !== 'editor' && (
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--border-subtle)] bg-[var(--accent-soft)]/40 px-4 py-1.5 text-xs text-[var(--text-primary)]">
            <span className="flex items-center gap-2 truncate">
              <Cloud className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
              <span className="truncate">
                {driveSaveStatus === 'error'
                  ? 'Auto-save to Google Drive failed. Retry saving to Vellum Workspace.'
                  : 'Auto-save to Drive is paused. Save your changes to Google Drive (Vellum Workspace).'}
              </span>
            </span>
            <button
              type="button"
              onClick={handleRequestSaveToDrive}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[var(--accent)] px-2.5 py-1 text-[11px] font-medium text-white hover:bg-[var(--accent-hover)] cursor-pointer"
            >
              <Upload className="h-3 w-3" />
              Save to Drive
            </button>
          </div>
        )}
        {openTabNotes.length > 0 && (
          <NoteTabBar
            tabs={openTabNotes}
            activeNoteId={prefs.activeNoteId}
            isEditorActive={prefs.activeSection === 'editor'}
            leftSidebarCollapsed={prefs.leftSidebarCollapsed}
            onActivateTab={handleActivateTab}
            onCloseTab={handleCloseTab}
            onCloseOtherTabs={handleCloseOtherTabs}
            onCloseTabsToRight={handleCloseTabsToRight}
            onCloseAllTabs={handleCloseAllTabs}
            onCreateNewTab={() =>
              handleCreateNote(prefs.activeSection === 'folder' ? prefs.activeFolderId : null)
            }
            onDuplicateNote={handleDuplicateNote}
            onReorderTabs={handleReorderTabs}
          />
        )}
        <div className="min-h-0 flex-1 overflow-hidden">
        {prefs.activeSection === 'editor' && activeNote ? (
          <NoteEditor
            note={activeNote}
            folders={folders}
            calendarLocale={prefs.calendarLocale}
            saveState={saveState}
            driveSaveStatus={driveSaveStatus}
            hasRememberedDriveAccount={Boolean(user)}
            driveRestoring={driveRestoring}
            hasPendingDriveChanges={hasPendingDriveChanges}
            onRequestSaveToDrive={handleRequestSaveToDrive}
            onRequestConnectDrive={handleSignIn}
            rightPanelOpen={prefs.rightSidebarOpen}
            onToggleRightPanel={() =>
              updatePrefs({ rightSidebarOpen: !prefs.rightSidebarOpen })
            }
            onOpenMobileSidebar={() => setMobileSidebarOpen(true)}
            onUpdateNote={handleUpdateNote}
            onDuplicateNote={handleDuplicateNote}
            onDeleteNote={handleDeleteNote}
            onSelectFolder={handleSelectFolder}
            onOpenJournalDate={(dk) => handleOpenJournalDate(dk)}
            onOpenJournalCalendar={() => updatePrefs({ activeSection: 'journal' })}
          />
        ) : prefs.activeSection === 'journal' ? (
          <JournalView
            notes={notes}
            viewMode={prefs.journalViewMode}
            calendarLocale={prefs.calendarLocale}
            onChangeViewMode={(mode) => updatePrefs({ journalViewMode: mode })}
            onChangeCalendarLocale={handleChangeCalendarLocale}
            onOpenMobileSidebar={() => setMobileSidebarOpen(true)}
            onOpenJournalDate={handleOpenJournalDate}
            onSelectNote={handleSelectNote}
            onUpdateNote={handleUpdateNote}
          />
        ) : prefs.activeSection === 'tasks' ? (
          <TasksView
            tasks={tasks}
            folders={folders}
            notes={notes}
            goals={goals}
            viewMode={prefs.taskViewMode}
            calendarLocale={prefs.calendarLocale}
            onChangeViewMode={(mode) => updatePrefs({ taskViewMode: mode })}
            onOpenMobileSidebar={() => setMobileSidebarOpen(true)}
            onSaveTask={handleSaveTask}
            onDeleteTask={handleDeleteTask}
            onSelectNote={handleSelectNote}
          />
        ) : prefs.activeSection === 'goals' ? (
          <GoalsView
            goals={goals}
            notes={notes}
            tasks={tasks}
            calendarLocale={prefs.calendarLocale}
            onOpenMobileSidebar={() => setMobileSidebarOpen(true)}
            onSaveGoal={handleSaveGoal}
            onDeleteGoal={handleDeleteGoal}
            onSelectNote={handleSelectNote}
            onToggleTask={handleToggleTask}
            onCreateTaskForGoal={handleCreateTaskForGoal}
          />
        ) : prefs.activeSection === 'trash' ? (
          <TrashView
            notes={trashedNotes}
            folders={folders}
            calendarLocale={prefs.calendarLocale}
            onOpenMobileSidebar={() => setMobileSidebarOpen(true)}
            onRestoreNote={handleRestoreNote}
            onPermanentDeleteNote={handlePermanentDeleteNote}
            onEmptyTrash={handleEmptyTrash}
          />
        ) : prefs.activeSection === 'all_notes' ||
          prefs.activeSection === 'quick_access' ||
          prefs.activeSection === 'favorites' ||
          prefs.activeSection === 'recent' ||
          prefs.activeSection === 'archived' ||
          prefs.activeSection === 'folder' ? (
          <NotesBrowserView
            title={browserViewMeta.title}
            subtitle={browserViewMeta.subtitle}
            notes={browserViewMeta.items}
            folders={folders}
            pinnedFolders={browserViewMeta.pinnedFolders}
            viewMode={prefs.notesViewMode}
            calendarLocale={prefs.calendarLocale}
            onChangeViewMode={(mode) => updatePrefs({ notesViewMode: mode })}
            onOpenMobileSidebar={() => setMobileSidebarOpen(true)}
            onSelectNote={handleSelectNote}
            onSelectFolder={(fid) => handleSelectFolder(fid)}
            onCreateNote={() =>
              handleCreateNote(prefs.activeSection === 'folder' ? prefs.activeFolderId : null)
            }
            onUpdateNote={handleUpdateNote}
            onDeleteNote={handleDeleteNote}
          />
        ) : (
          <DashboardView
            notes={notes}
            folders={folders}
            tasks={tasks}
            goals={goals}
            calendarLocale={prefs.calendarLocale}
            onOpenMobileSidebar={() => setMobileSidebarOpen(true)}
            onSelectNote={handleSelectNote}
            onOpenTodayJournal={() => handleOpenJournalDate(toDateKey())}
            onCreateNote={() => handleCreateNote(null)}
            onToggleTask={handleToggleTask}
            onNavigateSection={(section) => updatePrefs({ activeSection: section })}
            onQuickCreateTask={() => {
              setQuickTaskTitle('');
              setQuickTaskPriority('medium');
              setQuickTaskDate(toDateKey());
              setQuickTaskOpen(true);
            }}
          />
        )}
        </div>
      </main>

      {/* Right Contextual Sidebar */}
      {prefs.activeSection === 'editor' && activeNote && prefs.rightSidebarOpen && (
        <div className="hidden xl:block h-full shrink-0">
          <RightPanel
            note={activeNote}
            allNotes={notes}
            folders={folders}
            tasks={tasks}
            goals={goals}
            calendarLocale={prefs.calendarLocale}
            onUpdateNote={handleUpdateNote}
            onSelectNote={handleSelectNote}
            onToggleTask={handleToggleTask}
            onCreateLinkedTask={handleCreateLinkedTask}
            onClose={() => updatePrefs({ rightSidebarOpen: false })}
          />
        </div>
      )}

      {/* Right Panel Drawer on smaller screens when toggled open */}
      {prefs.activeSection === 'editor' && activeNote && prefs.rightSidebarOpen && (
        <div
          className="fixed inset-0 z-40 flex justify-end bg-black/45 xl:hidden"
          onClick={() => updatePrefs({ rightSidebarOpen: false })}
        >
          <div onClick={(e) => e.stopPropagation()} className="h-full">
            <RightPanel
              note={activeNote}
              allNotes={notes}
              folders={folders}
              tasks={tasks}
              goals={goals}
              calendarLocale={prefs.calendarLocale}
              onUpdateNote={handleUpdateNote}
              onSelectNote={handleSelectNote}
              onToggleTask={handleToggleTask}
              onCreateLinkedTask={handleCreateLinkedTask}
              onClose={() => updatePrefs({ rightSidebarOpen: false })}
            />
          </div>
        </div>
      )}

      {/* Global Search Palette */}
      <SearchCommandPalette
        open={searchOpen}
        notes={notes}
        folders={folders}
        tasks={tasks}
        goals={goals}
        onClose={() => setSearchOpen(false)}
        onSelectNote={handleSelectNote}
        onSelectFolder={(fid) => handleSelectFolder(fid)}
        onSelectSection={(sec) => updatePrefs({ activeSection: sec })}
        onCreateNote={() => handleCreateNote(null)}
        onOpenTodayJournal={() => handleOpenJournalDate(toDateKey())}
      />

      {/* Workspace Settings Modal */}
      <SettingsModal
        open={settingsOpen}
        theme={prefs.theme}
        calendarLocale={prefs.calendarLocale}
        user={user}
        driveConnected={driveConnected}
        driveRestoring={driveRestoring}
        driveAutoSaveEnabled={driveAutoSaveEnabled}
        driveSaveStatus={driveSaveStatus}
        hasPendingDriveChanges={hasPendingDriveChanges}
        driveFolderUrl={driveFolderUrl}
        lastDriveSyncAt={lastDriveSyncAt}
        authBusy={authBusy}
        authError={authError}
        onChangeTheme={(theme) => updatePrefs({ theme })}
        onChangeCalendarLocale={handleChangeCalendarLocale}
        onSignIn={handleSignIn}
        onSignOut={handleSignOut}
        onToggleDriveAutoSave={handleToggleDriveAutoSave}
        onRequestSaveToDrive={handleRequestSaveToDrive}
        onReloadFromDrive={handleReloadFromDrive}
        onClose={() => setSettingsOpen(false)}
      />

      {/* Explicit Confirmation Modal for Google Drive Workspace Save / Auto-Save / Conflict */}
      <DriveSyncModal
        mode={driveSyncModalMode}
        existingFileId={driveFileId}
        driveModifiedTime={driveModifiedTime}
        localStats={{
          folders: folders.length,
          notes: notes.length,
          tasks: tasks.length,
          goals: goals.length,
        }}
        remoteStats={
          driveRemoteResult?.data
            ? {
                folders: driveRemoteResult.data.folders.length,
                notes: driveRemoteResult.data.notes.length,
                tasks: driveRemoteResult.data.tasks.length,
                goals: driveRemoteResult.data.goals.length,
              }
            : null
        }
        busy={driveSyncBusy}
        error={driveSyncError}
        onConfirmSaveToDrive={handleConfirmSaveToDrive}
        onConfirmEnableAutoSave={handleConfirmEnableAutoSave}
        onConfirmLoadFromDrive={handleConfirmLoadFromDrive}
        onCancel={() => {
          if (!driveSyncBusy) setDriveSyncModalMode(null);
        }}
      />

      <DriveConfirmDeleteModal
        open={Boolean(pendingPermanentDelete)}
        title={
          pendingPermanentDelete?.kind === 'empty_trash'
            ? `Empty Trash (${pendingPermanentDelete.count} notes)?`
            : 'Delete note permanently?'
        }
        description={
          pendingPermanentDelete?.kind === 'empty_trash'
            ? `All ${pendingPermanentDelete.count} note(s) in Trash will be permanently deleted and cannot be recovered.`
            : `"${
                pendingPermanentDelete?.note.title || 'Untitled'
              }" will be permanently deleted and cannot be recovered.`
        }
        confirmLabel={
          pendingPermanentDelete?.kind === 'empty_trash' ? 'Empty Trash' : 'Delete Forever'
        }
        onConfirm={() => {
          if (!pendingPermanentDelete) return;
          if (pendingPermanentDelete.kind === 'note') {
            const targetId = pendingPermanentDelete.note.id;
            setNotes((prev) => prev.filter((n) => n.id !== targetId));
            removeNote(targetId);
          } else {
            const trashedIds = notes.filter((n) => Boolean(n.deletedAt)).map((n) => n.id);
            trashedIds.forEach((id) => removeNote(id));
            setNotes((prev) => prev.filter((n) => !n.deletedAt));
          }
          setPendingPermanentDelete(null);
        }}
        onCancel={() => setPendingPermanentDelete(null)}
      />

      {trashToast && (
        <div className="fixed bottom-4 right-4 left-4 sm:left-auto z-50 flex items-center justify-between gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3.5 py-2.5 text-xs shadow-[var(--shadow-popover)] sm:max-w-md">
          <div className="flex min-w-0 items-center gap-2 text-[var(--text-primary)]">
            <Trash2 className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
            <span dir="auto" className="truncate">
              Moved &ldquo;{trashToast.title}&rdquo; to Trash (30 days left)
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => handleRestoreNote(trashToast.noteId)}
              className="inline-flex items-center gap-1 rounded-lg bg-[var(--accent-soft)] px-2.5 py-1 text-[11px] font-semibold text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white transition-colors cursor-pointer"
            >
              <RotateCcw className="h-3 w-3" />
              Undo
            </button>
            <button
              type="button"
              onClick={() => {
                setTrashToast(null);
                updatePrefs({ activeSection: 'trash', activeFolderId: null });
              }}
              className="rounded-lg px-2 py-1 text-[11px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              View
            </button>
            <button
              type="button"
              onClick={() => setTrashToast(null)}
              className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--bg-hover)] cursor-pointer"
              aria-label="Dismiss notification"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Quick Create Task Modal (from Dashboard) */}
      {quickTaskOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setQuickTaskOpen(false)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              if (!quickTaskTitle.trim()) return;
              const now = new Date().toISOString();
              handleSaveTask({
                id: createId('task'),
                title: quickTaskTitle.trim(),
                description: '',
                status: 'todo',
                priority: quickTaskPriority,
                dueDate: quickTaskDate || null,
                folderId: null,
                linkedNoteId: null,
                linkedGoalId: null,
                createdAt: now,
                updatedAt: now,
                completedAt: null,
              });
              setQuickTaskOpen(false);
            }}
            className="w-full max-w-md rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 shadow-[var(--shadow-popover)] space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-semibold text-[var(--text-primary)]">
                Quick Create Task
              </h3>
              <button
                type="button"
                onClick={() => setQuickTaskOpen(false)}
                className="text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <input
              type="text"
              autoFocus
              required
              value={quickTaskTitle}
              onChange={(e) => setQuickTaskTitle(e.target.value)}
              placeholder="What needs to get done?"
              className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none"
            />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-[11px] text-[var(--text-muted)]">Priority</label>
                <select
                  value={quickTaskPriority}
                  onChange={(e) => setQuickTaskPriority(e.target.value as TaskPriority)}
                  className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-2.5 py-1.5 text-xs text-[var(--text-primary)]"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[11px] text-[var(--text-muted)]">Due date</label>
                <input
                  type="date"
                  value={quickTaskDate}
                  onChange={(e) => setQuickTaskDate(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] tabular-nums"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setQuickTaskOpen(false)}
                className="rounded-lg px-3.5 py-2 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-4 py-2 text-xs font-medium text-white hover:bg-[var(--accent-hover)] cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Task
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
