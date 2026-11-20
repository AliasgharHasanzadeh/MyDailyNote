import { type User, onAuthStateChanged } from 'firebase/auth';
import { PanelLeftOpen, Plus, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LeftSidebar } from './components/LeftSidebar';
import { RightPanel } from './components/RightPanel';
import { SearchCommandPalette } from './components/SearchCommandPalette';
import { SettingsModal } from './components/SettingsModal';
import { NoteEditor } from './components/editor/NoteEditor';
import { DashboardView } from './components/views/DashboardView';
import { GoalsView } from './components/views/GoalsView';
import { JournalView } from './components/views/JournalView';
import { NotesBrowserView } from './components/views/NotesBrowserView';
import { TasksView } from './components/views/TasksView';
import {
  clearKnownCloudIds,
  cloudDb,
  ensureUserProfile,
  seedOrMigrateCloudWorkspace,
  subscribeCloudWorkspace,
} from './db/firestoreWorkspace';
import { clearDriveSessionCaches } from './db/googleDrive';
import { createId, db, seedInitialWorkspaceIfEmpty } from './db/storage';
import {
  auth,
  getDriveAccessToken,
  googleSignIn,
  googleSignOut,
  subscribeDriveAccessToken,
} from './firebase';
import type {
  CalendarLocale,
  Folder,
  Goal,
  Note,
  Task,
  TaskPriority,
  WorkspacePreferences,
  WorkspaceSection,
} from './types/workspace';
import { buildAutoJournalTitle, isAutoJournalTitle, toDateKey } from './utils/date';
import { EMPTY_DOC } from './utils/tiptap';

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
  });

  const [user, setUser] = useState<User | null>(null);
  const [driveConnected, setDriveConnected] = useState<boolean>(() => Boolean(getDriveAccessToken()));
  const [authReady, setAuthReady] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<Error | null>(null);

  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [saveState, setSaveState] = useState<'saved' | 'saving'>('saved');
  const [quickTaskOpen, setQuickTaskOpen] = useState(false);
  const [quickTaskTitle, setQuickTaskTitle] = useState('');
  const [quickTaskPriority, setQuickTaskPriority] = useState<TaskPriority>('medium');
  const [quickTaskDate, setQuickTaskDate] = useState(toDateKey());

  const saveTimerRef = useRef<number | null>(null);
  const userRef = useRef<User | null>(null);
  userRef.current = user;
  const calendarLocaleRef = useRef<CalendarLocale>(prefs.calendarLocale);
  calendarLocaleRef.current = prefs.calendarLocale;

  if (syncError) {
    throw syncError;
  }

  const handleCloudFailure = useCallback((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('Quota exceeded')) {
      setAuthError(
        'Firestore daily free-tier quota exceeded. Your changes remain saved locally and cloud quota resets tomorrow.'
      );
      return;
    }
    setSyncError(err instanceof Error ? err : new Error(message));
  }, []);

  const persistNote = useCallback(
    (note: Note) => {
      db.saveNote(note);
      const u = userRef.current;
      if (u) {
        return cloudDb.saveNote(u.uid, note).catch(handleCloudFailure);
      }
      return Promise.resolve();
    },
    [handleCloudFailure]
  );

  const removeNote = useCallback(
    (noteId: string) => {
      db.deleteNote(noteId);
      const u = userRef.current;
      if (u) {
        cloudDb.deleteNote(u.uid, noteId).catch(handleCloudFailure);
      }
    },
    [handleCloudFailure]
  );

  const persistFolder = useCallback(
    (folder: Folder) => {
      db.saveFolder(folder);
      const u = userRef.current;
      if (u) {
        cloudDb.saveFolder(u.uid, folder).catch(handleCloudFailure);
      }
    },
    [handleCloudFailure]
  );

  const removeFolder = useCallback(
    (folderId: string) => {
      db.deleteFolder(folderId);
      const u = userRef.current;
      if (u) {
        cloudDb.deleteFolder(u.uid, folderId).catch(handleCloudFailure);
      }
    },
    [handleCloudFailure]
  );

  const persistTask = useCallback(
    (task: Task) => {
      db.saveTask(task);
      const u = userRef.current;
      if (u) {
        cloudDb.saveTask(u.uid, task).catch(handleCloudFailure);
      }
    },
    [handleCloudFailure]
  );

  const removeTask = useCallback(
    (taskId: string) => {
      db.deleteTask(taskId);
      const u = userRef.current;
      if (u) {
        cloudDb.deleteTask(u.uid, taskId).catch(handleCloudFailure);
      }
    },
    [handleCloudFailure]
  );

  const persistGoal = useCallback(
    (goal: Goal) => {
      db.saveGoal(goal);
      const u = userRef.current;
      if (u) {
        cloudDb.saveGoal(u.uid, goal).catch(handleCloudFailure);
      }
    },
    [handleCloudFailure]
  );

  const removeGoal = useCallback(
    (goalId: string) => {
      db.deleteGoal(goalId);
      const u = userRef.current;
      if (u) {
        cloudDb.deleteGoal(u.uid, goalId).catch(handleCloudFailure);
      }
    },
    [handleCloudFailure]
  );

  const persistPrefs = useCallback(
    (nextPrefs: WorkspacePreferences) => {
      db.savePreferences(nextPrefs);
      const u = userRef.current;
      if (u) {
        cloudDb.savePreferences(u.uid, nextPrefs).catch(handleCloudFailure);
      }
    },
    [handleCloudFailure]
  );

  // Firebase Auth & Google Drive access token listeners
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setAuthReady(true);
      if (!firebaseUser) {
        clearDriveSessionCaches();
      }
    });
    const unsubDrive = subscribeDriveAccessToken((token) => {
      setDriveConnected(Boolean(token));
    });
    return () => {
      unsub();
      unsubDrive();
    };
  }, []);

  // Hydrate from IndexedDB when signed out, or connect Firestore real-time listeners when authenticated
  useEffect(() => {
    if (!authReady) return;
    let cancelled = false;
    let unsubCloud: (() => void) | null = null;

    const init = async () => {
      const localData = await seedInitialWorkspaceIfEmpty();
      if (cancelled) return;

      if (!user) {
        clearKnownCloudIds();
        setFolders(localData.folders);
        setNotes(
          syncAutoJournalTitles(localData.notes, localData.preferences.calendarLocale, (n) =>
            db.saveNote(n)
          )
        );
        setTasks(localData.tasks);
        setGoals(localData.goals);
        setPrefs(localData.preferences);
        setLoading(false);
        return;
      }

      // Authenticated with Firebase: ensure user doc exists, migrate local data if cloud is empty, then attach onSnapshot
      try {
        await ensureUserProfile(user);
        await seedOrMigrateCloudWorkspace(user.uid, localData);
        if (cancelled) return;

        unsubCloud = subscribeCloudWorkspace(user.uid, {
          onFolders: (cloudFolders) => {
            setFolders(cloudFolders);
            setLoading(false);
          },
          onNotes: (cloudNotes) => {
            setNotes(
              syncAutoJournalTitles(cloudNotes, calendarLocaleRef.current, (updated) => {
                cloudDb.saveNote(user.uid, updated).catch(handleCloudFailure);
              })
            );
            setLoading(false);
          },
          onTasks: (cloudTasks) => {
            setTasks(cloudTasks);
            setLoading(false);
          },
          onGoals: (cloudGoals) => {
            setGoals(cloudGoals);
            setLoading(false);
          },
          onPreferences: (cloudPrefs) => {
            setPrefs(cloudPrefs);
            setNotes((prev) =>
              syncAutoJournalTitles(prev, cloudPrefs.calendarLocale, (updated) => {
                cloudDb.saveNote(user.uid, updated).catch(handleCloudFailure);
              })
            );
            setLoading(false);
          },
          onError: handleCloudFailure,
        });
      } catch (err) {
        if (!cancelled) {
          handleCloudFailure(err);
          setLoading(false);
        }
      }
    };

    void init();

    return () => {
      cancelled = true;
      if (unsubCloud) unsubCloud();
    };
  }, [authReady, user, handleCloudFailure]);

  const handleSignIn = useCallback(async () => {
    setAuthError(null);
    setAuthBusy(true);
    try {
      await googleSignIn();
    } catch (error) {
      const code =
        error && typeof error === 'object' && 'code' in error
          ? String((error as { code: unknown }).code)
          : '';
      if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') {
        setAuthError(
          error instanceof Error ? error.message : 'Unable to sign in with Google.'
        );
      }
    } finally {
      setAuthBusy(false);
    }
  }, []);

  const handleSignOut = useCallback(async () => {
    setAuthError(null);
    setAuthBusy(true);
    try {
      await googleSignOut();
      clearDriveSessionCaches();
      clearKnownCloudIds();
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Unable to sign out.');
    } finally {
      setAuthBusy(false);
    }
  }, []);

  // Sync theme class on <html>
  useEffect(() => {
    const root = document.documentElement;
    if (prefs.theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [prefs.theme]);

  const updatePrefs = useCallback(
    (patch: Partial<WorkspacePreferences>) => {
      setPrefs((prev) => {
        const next = { ...prev, ...patch };
        persistPrefs(next);
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

  // Note CRUD with reliable autosave
  const handleUpdateNote = useCallback(
    (updated: Note) => {
      setNotes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
      setSaveState('saving');
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = window.setTimeout(() => {
        persistNote(updated).then(() => setSaveState('saved'));
      }, 360);
    },
    [persistNote]
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
      updatePrefs({
        activeSection: 'editor',
        activeNoteId: newNote.id,
        activeFolderId: parentFolderId,
      });
    },
    [updatePrefs, persistNote]
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
      updatePrefs({ activeSection: 'editor', activeNoteId: copy.id });
    },
    [updatePrefs, persistNote]
  );

  const handleDeleteNote = useCallback(
    (noteId: string) => {
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
      removeNote(noteId);
      if (prefs.activeNoteId === noteId) {
        updatePrefs({ activeNoteId: null, activeSection: 'all_notes' });
      }
    },
    [prefs.activeNoteId, updatePrefs, removeNote]
  );

  const handleSelectNote = useCallback(
    (noteId: string) => {
      updatePrefs({ activeSection: 'editor', activeNoteId: noteId });
    },
    [updatePrefs]
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
        const existing = notes.find((n) => !n.isArchived && n.journalDate === dateKey);
        if (existing) {
          updatePrefs({ activeSection: 'editor', activeNoteId: existing.id });
          return;
        }
      }

      const dailyLifeFolder = folders.find(
        (f) => f.name.toLowerCase() === 'daily life'
      );
      const now = new Date().toISOString();
      const suffixCount = notes.filter((n) => n.journalDate === dateKey).length;
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
      updatePrefs({ activeSection: 'editor', activeNoteId: newEntry.id });
    },
    [notes, folders, prefs.calendarLocale, updatePrefs, persistNote]
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
        const deletedNoteIds = new Set<string>();
        notes.forEach((n) => {
          if (n.parentFolderId && toDeleteIds.has(n.parentFolderId)) {
            deletedNoteIds.add(n.id);
            removeNote(n.id);
          }
        });
        setFolders((prev) => prev.filter((f) => !toDeleteIds.has(f.id)));
        setNotes((prev) => prev.filter((n) => !deletedNoteIds.has(n.id)));
        if (prefs.activeNoteId && deletedNoteIds.has(prefs.activeNoteId)) {
          updatePrefs({ activeNoteId: null, activeSection: 'dashboard' });
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
      prefs.activeNoteId,
      updatePrefs,
      persistFolder,
      persistNote,
      removeFolder,
      removeNote,
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
  }, [prefs, updatePrefs, handleCreateNote]);

  const activeNote = useMemo(
    () => notes.find((n) => n.id === prefs.activeNoteId) || null,
    [notes, prefs.activeNoteId]
  );

  const activeFolder = useMemo(
    () => folders.find((f) => f.id === prefs.activeFolderId) || null,
    [folders, prefs.activeFolderId]
  );

  // Filtered note collections for browser views
  const browserViewMeta = useMemo(() => {
    const nonArchived = notes.filter((n) => !n.isArchived);
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
        subtitle: 'Restore or permanently remove archived pages',
        items: notes.filter((n) => n.isArchived),
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
          onToggleTheme={() =>
            updatePrefs({ theme: prefs.theme === 'dark' ? 'light' : 'dark' })
          }
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
          authBusy={authBusy}
          onSignIn={handleSignIn}
          onSignOut={handleSignOut}
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
              onToggleTheme={() =>
                updatePrefs({ theme: prefs.theme === 'dark' ? 'light' : 'dark' })
              }
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
              authBusy={authBusy}
              onSignIn={handleSignIn}
              onSignOut={handleSignOut}
            />
          )}
        </>
      )}

      {/* Main Content Area */}
      <main className="relative min-w-0 flex-1 h-full overflow-hidden flex flex-col">
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
        <div className="min-h-0 flex-1 overflow-hidden">
        {prefs.activeSection === 'editor' && activeNote ? (
          <NoteEditor
            note={activeNote}
            folders={folders}
            calendarLocale={prefs.calendarLocale}
            saveState={saveState}
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
        authBusy={authBusy}
        authError={authError}
        onChangeTheme={(theme) => updatePrefs({ theme })}
        onChangeCalendarLocale={handleChangeCalendarLocale}
        onSignIn={handleSignIn}
        onSignOut={handleSignOut}
        onClose={() => setSettingsOpen(false)}
      />

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
