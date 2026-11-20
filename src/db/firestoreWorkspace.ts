import type { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { OperationType, firestoreDb, handleFirestoreError } from '../firebase';
import type {
  Folder,
  Goal,
  JournalMetadata,
  Note,
  Task,
  WorkspacePreferences,
} from '../types/workspace';
import { EMPTY_DOC } from '../utils/tiptap';

const SAFE_ID_RE = /^[a-zA-Z0-9_-]+$/;
const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

const knownFolders = new Set<string>();
const knownNotes = new Set<string>();
const knownTasks = new Set<string>();
const knownGoals = new Set<string>();
const knownPrefs = new Set<string>();

export function clearKnownCloudIds() {
  knownFolders.clear();
  knownNotes.clear();
  knownTasks.clear();
  knownGoals.clear();
  knownPrefs.clear();
}

function toSafeId(val: string | null | undefined): string | null {
  if (!val || typeof val !== 'string') return null;
  const trimmed = val.trim().slice(0, 128);
  return SAFE_ID_RE.test(trimmed) ? trimmed : null;
}

function toSafeDateKey(val: string | null | undefined): string | null {
  if (!val || typeof val !== 'string') return null;
  const trimmed = val.trim();
  return DATE_KEY_RE.test(trimmed) ? trimmed : null;
}

function toIsoString(val: unknown): string {
  if (
    val &&
    typeof val === 'object' &&
    'toDate' in val &&
    typeof (val as { toDate: () => Date }).toDate === 'function'
  ) {
    return (val as { toDate: () => Date }).toDate().toISOString();
  }
  if (typeof val === 'string' && val.length > 0) return val;
  return new Date().toISOString();
}

function stripUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefinedDeep(item)) as unknown as T;
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (v !== undefined) {
        out[k] = stripUndefinedDeep(v);
      }
    }
    return out as T;
  }
  return value;
}

function sanitizeJournalMetadata(meta?: JournalMetadata): JournalMetadata | null {
  if (!meta) return null;
  const out: JournalMetadata = {};
  if (typeof meta.mood === 'string' && meta.mood.trim()) {
    out.mood = meta.mood.trim().slice(0, 40);
  }
  if (typeof meta.rating === 'number' && Number.isFinite(meta.rating)) {
    const r = Math.min(5, Math.max(1, Math.round(meta.rating)));
    out.rating = r;
  }
  if (Array.isArray(meta.highlights)) {
    const clean = meta.highlights
      .filter((h): h is string => typeof h === 'string' && h.trim().length > 0)
      .slice(0, 20)
      .map((h) => h.trim().slice(0, 200));
    if (clean.length > 0) {
      out.highlights = clean;
    }
  }
  return out;
}

function buildFolderMutable(folder: Folder) {
  return {
    name: (folder.name || 'Untitled Folder').trim().slice(0, 120) || 'Untitled Folder',
    parentId: toSafeId(folder.parentId),
    icon: (folder.icon || '📁').slice(0, 16),
    isPinned: Boolean(folder.isPinned),
    isExpanded: Boolean(folder.isExpanded),
    sortOrder: Math.min(100000, Math.max(-10000, Number(folder.sortOrder) || 0)),
    updatedAt: serverTimestamp(),
  };
}

function buildNoteMutable(note: Note) {
  const cleanTags = Array.isArray(note.tags)
    ? note.tags
        .filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
        .slice(0, 25)
        .map((t) => t.trim().slice(0, 40))
    : [];

  const cleanLinked = Array.isArray(note.linkedNoteIds)
    ? note.linkedNoteIds
        .map((id) => toSafeId(id))
        .filter((id): id is string => Boolean(id))
        .slice(0, 50)
    : [];

  const safeCover =
    typeof note.coverImage === 'string' && note.coverImage.length > 0 && note.coverImage.length <= 500000
      ? note.coverImage
      : null;

  const base: Record<string, unknown> = {
    title: (note.title || '').slice(0, 300),
    content: stripUndefinedDeep(note.content || EMPTY_DOC),
    plainText: (note.plainText || '').slice(0, 200000),
    parentFolderId: toSafeId(note.parentFolderId),
    icon: typeof note.icon === 'string' && note.icon.length > 0 ? note.icon.slice(0, 16) : null,
    coverImage: safeCover,
    tags: cleanTags,
    isFavorite: Boolean(note.isFavorite),
    isPinned: Boolean(note.isPinned),
    isArchived: Boolean(note.isArchived),
    sortOrder: Math.min(100000, Math.max(-10000, Number(note.sortOrder) || 0)),
    journalDate: toSafeDateKey(note.journalDate),
    isCustomJournalTitle:
      typeof note.isCustomJournalTitle === 'boolean' ? note.isCustomJournalTitle : null,
    journalMetadata: sanitizeJournalMetadata(note.journalMetadata),
    linkedNoteIds: cleanLinked,
    updatedAt: serverTimestamp(),
  };

  return base;
}

function buildTaskMutable(task: Task) {
  const status =
    task.status === 'in_progress' || task.status === 'done' ? task.status : 'todo';
  const priority =
    task.priority === 'low' || task.priority === 'high' ? task.priority : 'medium';

  return {
    title: (task.title || 'Untitled Task').trim().slice(0, 300) || 'Untitled Task',
    description: (task.description || '').slice(0, 5000),
    status,
    priority,
    dueDate: toSafeDateKey(task.dueDate),
    folderId: toSafeId(task.folderId),
    linkedNoteId: toSafeId(task.linkedNoteId),
    linkedGoalId: toSafeId(task.linkedGoalId),
    completedAt:
      typeof task.completedAt === 'string' && task.completedAt.length > 0
        ? task.completedAt.slice(0, 40)
        : null,
    updatedAt: serverTimestamp(),
  };
}

function buildGoalMutable(goal: Goal) {
  const milestones = Array.isArray(goal.milestones)
    ? goal.milestones.slice(0, 50).map((m, idx) => ({
        id: toSafeId(m.id) || `ms_${idx}`,
        title: (m.title || '').slice(0, 200),
        completed: Boolean(m.completed),
      }))
    : [];

  const linkedNoteIds = Array.isArray(goal.linkedNoteIds)
    ? goal.linkedNoteIds
        .map((id) => toSafeId(id))
        .filter((id): id is string => Boolean(id))
        .slice(0, 50)
    : [];

  return {
    title: (goal.title || 'Untitled Goal').trim().slice(0, 300) || 'Untitled Goal',
    description: (goal.description || '').slice(0, 5000),
    horizon: goal.horizon === 'long_term' ? 'long_term' : 'short_term',
    targetDate: toSafeDateKey(goal.targetDate),
    progressMode: goal.progressMode === 'manual' ? 'manual' : 'auto',
    manualProgress: Math.min(100, Math.max(0, Number(goal.manualProgress) || 0)),
    milestones,
    linkedNoteIds,
    status: goal.status === 'completed' ? 'completed' : 'active',
    updatedAt: serverTimestamp(),
  };
}

function buildPreferencesMutable(prefs: WorkspacePreferences) {
  return {
    theme: prefs.theme === 'light' ? 'light' : 'dark',
    calendarLocale: prefs.calendarLocale === 'fa' ? 'fa' : 'en',
    rightSidebarOpen: Boolean(prefs.rightSidebarOpen),
    leftSidebarCollapsed: Boolean(prefs.leftSidebarCollapsed),
    leftSidebarWidth: Math.min(600, Math.max(180, Number(prefs.leftSidebarWidth) || 272)),
    notesViewMode:
      prefs.notesViewMode === 'compact' || prefs.notesViewMode === 'grid'
        ? prefs.notesViewMode
        : 'list',
    journalViewMode:
      prefs.journalViewMode === 'timeline' || prefs.journalViewMode === 'list'
        ? prefs.journalViewMode
        : 'calendar',
    taskViewMode: prefs.taskViewMode === 'kanban' ? 'kanban' : 'list',
    activeNoteId: toSafeId(prefs.activeNoteId),
    activeSection: prefs.activeSection || 'dashboard',
    activeFolderId: toSafeId(prefs.activeFolderId),
    updatedAt: serverTimestamp(),
  };
}

export async function ensureUserProfile(user: User): Promise<void> {
  const path = `users/${user.uid}`;
  const ref = doc(firestoreDb, 'users', user.uid);
  const displayName = (user.displayName || 'Workspace User').slice(0, 120);
  const photoURL = (user.photoURL || '').slice(0, 1000);

  let exists = false;
  try {
    const snap = await getDoc(ref);
    exists = snap.exists();
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }

  if (!exists) {
    try {
      await setDoc(ref, {
        uid: user.uid,
        displayName,
        photoURL,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  } else {
    try {
      await updateDoc(ref, {
        displayName,
        photoURL,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  }
}

export async function seedOrMigrateCloudWorkspace(
  userId: string,
  localWorkspace: {
    folders: Folder[];
    notes: Note[];
    tasks: Task[];
    goals: Goal[];
    preferences: WorkspacePreferences;
  }
): Promise<void> {
  const foldersPath = `users/${userId}/folders`;
  const notesPath = `users/${userId}/notes`;
  const tasksPath = `users/${userId}/tasks`;
  const goalsPath = `users/${userId}/goals`;
  const prefsPath = `users/${userId}/preferences/default`;

  let hasAnyCloudData = false;
  try {
    const [fSnap, nSnap, tSnap, gSnap] = await Promise.all([
      getDocs(query(collection(firestoreDb, foldersPath), where('ownerId', '==', userId))),
      getDocs(query(collection(firestoreDb, notesPath), where('ownerId', '==', userId))),
      getDocs(query(collection(firestoreDb, tasksPath), where('ownerId', '==', userId))),
      getDocs(query(collection(firestoreDb, goalsPath), where('ownerId', '==', userId))),
    ]);
    hasAnyCloudData = !fSnap.empty || !nSnap.empty || !tSnap.empty || !gSnap.empty;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, notesPath);
  }

  if (hasAnyCloudData) {
    // Ensure preferences doc exists if missing
    try {
      const prefSnap = await getDoc(doc(firestoreDb, 'users', userId, 'preferences', 'default'));
      if (!prefSnap.exists()) {
        await setDoc(doc(firestoreDb, 'users', userId, 'preferences', 'default'), {
          id: 'default',
          ownerId: userId,
          ...buildPreferencesMutable(localWorkspace.preferences),
        });
      }
      knownPrefs.add('default');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, prefsPath);
    }
    return;
  }

  // Migrate local workspace to Firestore in chunks
  const writes: Array<{ ref: ReturnType<typeof doc>; data: Record<string, unknown> }> = [];

  for (const f of localWorkspace.folders) {
    const safeId = toSafeId(f.id);
    if (!safeId) continue;
    knownFolders.add(safeId);
    writes.push({
      ref: doc(firestoreDb, 'users', userId, 'folders', safeId),
      data: {
        id: safeId,
        ownerId: userId,
        ...buildFolderMutable(f),
        createdAt: serverTimestamp(),
      },
    });
  }

  for (const n of localWorkspace.notes) {
    const safeId = toSafeId(n.id);
    if (!safeId) continue;
    knownNotes.add(safeId);
    writes.push({
      ref: doc(firestoreDb, 'users', userId, 'notes', safeId),
      data: {
        id: safeId,
        ownerId: userId,
        ...buildNoteMutable(n),
        createdAt: serverTimestamp(),
      },
    });
  }

  for (const t of localWorkspace.tasks) {
    const safeId = toSafeId(t.id);
    if (!safeId) continue;
    knownTasks.add(safeId);
    writes.push({
      ref: doc(firestoreDb, 'users', userId, 'tasks', safeId),
      data: {
        id: safeId,
        ownerId: userId,
        ...buildTaskMutable(t),
        createdAt: serverTimestamp(),
      },
    });
  }

  for (const g of localWorkspace.goals) {
    const safeId = toSafeId(g.id);
    if (!safeId) continue;
    knownGoals.add(safeId);
    writes.push({
      ref: doc(firestoreDb, 'users', userId, 'goals', safeId),
      data: {
        id: safeId,
        ownerId: userId,
        ...buildGoalMutable(g),
        createdAt: serverTimestamp(),
      },
    });
  }

  knownPrefs.add('default');
  writes.push({
    ref: doc(firestoreDb, 'users', userId, 'preferences', 'default'),
    data: {
      id: 'default',
      ownerId: userId,
      ...buildPreferencesMutable(localWorkspace.preferences),
    },
  });

  const CHUNK_SIZE = 400;
  for (let i = 0; i < writes.length; i += CHUNK_SIZE) {
    const batch = writeBatch(firestoreDb);
    const slice = writes.slice(i, i + CHUNK_SIZE);
    for (const item of slice) {
      batch.set(item.ref, item.data);
    }
    try {
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${userId}`);
    }
  }
}

export function subscribeCloudWorkspace(
  userId: string,
  callbacks: {
    onFolders: (folders: Folder[]) => void;
    onNotes: (notes: Note[]) => void;
    onTasks: (tasks: Task[]) => void;
    onGoals: (goals: Goal[]) => void;
    onPreferences: (prefs: WorkspacePreferences) => void;
    onError: (err: unknown) => void;
  }
): () => void {
  const foldersPath = `users/${userId}/folders`;
  const notesPath = `users/${userId}/notes`;
  const tasksPath = `users/${userId}/tasks`;
  const goalsPath = `users/${userId}/goals`;
  const prefsPath = `users/${userId}/preferences/default`;

  const unsubFolders = onSnapshot(
    query(collection(firestoreDb, foldersPath), where('ownerId', '==', userId)),
    (snapshot) => {
      knownFolders.clear();
      const items: Folder[] = snapshot.docs.map((d) => {
        knownFolders.add(d.id);
        const raw = d.data({ serverTimestamps: 'estimate' });
        return {
          id: raw.id || d.id,
          name: raw.name || 'Untitled',
          parentId: raw.parentId ?? null,
          icon: raw.icon || '📁',
          isPinned: Boolean(raw.isPinned),
          isExpanded: Boolean(raw.isExpanded),
          sortOrder: Number(raw.sortOrder) || 0,
          createdAt: toIsoString(raw.createdAt),
          updatedAt: toIsoString(raw.updatedAt),
        };
      });
      callbacks.onFolders(items);
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.LIST, foldersPath);
      } catch (wrapped) {
        callbacks.onError(wrapped);
      }
    }
  );

  const unsubNotes = onSnapshot(
    query(collection(firestoreDb, notesPath), where('ownerId', '==', userId)),
    (snapshot) => {
      knownNotes.clear();
      const items: Note[] = snapshot.docs.map((d) => {
        knownNotes.add(d.id);
        const raw = d.data({ serverTimestamps: 'estimate' });
        return {
          id: raw.id || d.id,
          title: raw.title || '',
          content: raw.content || EMPTY_DOC,
          plainText: raw.plainText || '',
          parentFolderId: raw.parentFolderId ?? null,
          icon: raw.icon ?? null,
          coverImage: raw.coverImage ?? null,
          tags: Array.isArray(raw.tags) ? raw.tags : [],
          isFavorite: Boolean(raw.isFavorite),
          isPinned: Boolean(raw.isPinned),
          isArchived: Boolean(raw.isArchived),
          sortOrder: Number(raw.sortOrder) || 0,
          journalDate: raw.journalDate ?? null,
          isCustomJournalTitle:
            typeof raw.isCustomJournalTitle === 'boolean' ? raw.isCustomJournalTitle : undefined,
          journalMetadata: raw.journalMetadata ?? undefined,
          linkedNoteIds: Array.isArray(raw.linkedNoteIds) ? raw.linkedNoteIds : [],
          createdAt: toIsoString(raw.createdAt),
          updatedAt: toIsoString(raw.updatedAt),
        };
      });
      callbacks.onNotes(items);
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.LIST, notesPath);
      } catch (wrapped) {
        callbacks.onError(wrapped);
      }
    }
  );

  const unsubTasks = onSnapshot(
    query(collection(firestoreDb, tasksPath), where('ownerId', '==', userId)),
    (snapshot) => {
      knownTasks.clear();
      const items: Task[] = snapshot.docs.map((d) => {
        knownTasks.add(d.id);
        const raw = d.data({ serverTimestamps: 'estimate' });
        return {
          id: raw.id || d.id,
          title: raw.title || 'Untitled Task',
          description: raw.description || '',
          status: raw.status || 'todo',
          priority: raw.priority || 'medium',
          dueDate: raw.dueDate ?? null,
          folderId: raw.folderId ?? null,
          linkedNoteId: raw.linkedNoteId ?? null,
          linkedGoalId: raw.linkedGoalId ?? null,
          completedAt: raw.completedAt ?? null,
          createdAt: toIsoString(raw.createdAt),
          updatedAt: toIsoString(raw.updatedAt),
        };
      });
      callbacks.onTasks(items);
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.LIST, tasksPath);
      } catch (wrapped) {
        callbacks.onError(wrapped);
      }
    }
  );

  const unsubGoals = onSnapshot(
    query(collection(firestoreDb, goalsPath), where('ownerId', '==', userId)),
    (snapshot) => {
      knownGoals.clear();
      const items: Goal[] = snapshot.docs.map((d) => {
        knownGoals.add(d.id);
        const raw = d.data({ serverTimestamps: 'estimate' });
        return {
          id: raw.id || d.id,
          title: raw.title || 'Untitled Goal',
          description: raw.description || '',
          horizon: raw.horizon || 'short_term',
          targetDate: raw.targetDate ?? null,
          progressMode: raw.progressMode || 'auto',
          manualProgress: Number(raw.manualProgress) || 0,
          milestones: Array.isArray(raw.milestones) ? raw.milestones : [],
          linkedNoteIds: Array.isArray(raw.linkedNoteIds) ? raw.linkedNoteIds : [],
          status: raw.status || 'active',
          createdAt: toIsoString(raw.createdAt),
          updatedAt: toIsoString(raw.updatedAt),
        };
      });
      callbacks.onGoals(items);
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.LIST, goalsPath);
      } catch (wrapped) {
        callbacks.onError(wrapped);
      }
    }
  );

  const unsubPrefs = onSnapshot(
    doc(firestoreDb, 'users', userId, 'preferences', 'default'),
    (snap) => {
      if (!snap.exists()) return;
      knownPrefs.add('default');
      const raw = snap.data({ serverTimestamps: 'estimate' });
      callbacks.onPreferences({
        id: 'default',
        theme: raw.theme || 'dark',
        calendarLocale: raw.calendarLocale || 'en',
        rightSidebarOpen: Boolean(raw.rightSidebarOpen),
        leftSidebarCollapsed: Boolean(raw.leftSidebarCollapsed),
        leftSidebarWidth: Number(raw.leftSidebarWidth) || 272,
        notesViewMode: raw.notesViewMode || 'list',
        journalViewMode: raw.journalViewMode || 'calendar',
        taskViewMode: raw.taskViewMode || 'list',
        activeNoteId: raw.activeNoteId ?? null,
        activeSection: raw.activeSection || 'dashboard',
        activeFolderId: raw.activeFolderId ?? null,
      });
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.GET, prefsPath);
      } catch (wrapped) {
        callbacks.onError(wrapped);
      }
    }
  );

  return () => {
    unsubFolders();
    unsubNotes();
    unsubTasks();
    unsubGoals();
    unsubPrefs();
  };
}

export const cloudDb = {
  async saveFolder(userId: string, folder: Folder): Promise<void> {
    const safeId = toSafeId(folder.id);
    if (!safeId) return;
    const path = `users/${userId}/folders/${safeId}`;
    const ref = doc(firestoreDb, 'users', userId, 'folders', safeId);
    const mutable = buildFolderMutable(folder);

    if (knownFolders.has(safeId)) {
      try {
        await updateDoc(ref, mutable);
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, path);
      }
    } else {
      knownFolders.add(safeId);
      try {
        await setDoc(ref, {
          id: safeId,
          ownerId: userId,
          ...mutable,
          createdAt: serverTimestamp(),
        });
      } catch (error) {
        knownFolders.delete(safeId);
        handleFirestoreError(error, OperationType.CREATE, path);
      }
    }
  },

  async deleteFolder(userId: string, folderId: string): Promise<void> {
    const safeId = toSafeId(folderId);
    if (!safeId) return;
    const path = `users/${userId}/folders/${safeId}`;
    knownFolders.delete(safeId);
    try {
      await deleteDoc(doc(firestoreDb, 'users', userId, 'folders', safeId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  },

  async saveNote(userId: string, note: Note): Promise<void> {
    const safeId = toSafeId(note.id);
    if (!safeId) return;
    const path = `users/${userId}/notes/${safeId}`;
    const ref = doc(firestoreDb, 'users', userId, 'notes', safeId);
    const mutable = buildNoteMutable(note);

    if (knownNotes.has(safeId)) {
      try {
        await updateDoc(ref, mutable);
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, path);
      }
    } else {
      knownNotes.add(safeId);
      try {
        await setDoc(ref, {
          id: safeId,
          ownerId: userId,
          ...mutable,
          createdAt: serverTimestamp(),
        });
      } catch (error) {
        knownNotes.delete(safeId);
        handleFirestoreError(error, OperationType.CREATE, path);
      }
    }
  },

  async deleteNote(userId: string, noteId: string): Promise<void> {
    const safeId = toSafeId(noteId);
    if (!safeId) return;
    const path = `users/${userId}/notes/${safeId}`;
    knownNotes.delete(safeId);
    try {
      await deleteDoc(doc(firestoreDb, 'users', userId, 'notes', safeId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  },

  async saveTask(userId: string, task: Task): Promise<void> {
    const safeId = toSafeId(task.id);
    if (!safeId) return;
    const path = `users/${userId}/tasks/${safeId}`;
    const ref = doc(firestoreDb, 'users', userId, 'tasks', safeId);
    const mutable = buildTaskMutable(task);

    if (knownTasks.has(safeId)) {
      try {
        await updateDoc(ref, mutable);
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, path);
      }
    } else {
      knownTasks.add(safeId);
      try {
        await setDoc(ref, {
          id: safeId,
          ownerId: userId,
          ...mutable,
          createdAt: serverTimestamp(),
        });
      } catch (error) {
        knownTasks.delete(safeId);
        handleFirestoreError(error, OperationType.CREATE, path);
      }
    }
  },

  async deleteTask(userId: string, taskId: string): Promise<void> {
    const safeId = toSafeId(taskId);
    if (!safeId) return;
    const path = `users/${userId}/tasks/${safeId}`;
    knownTasks.delete(safeId);
    try {
      await deleteDoc(doc(firestoreDb, 'users', userId, 'tasks', safeId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  },

  async saveGoal(userId: string, goal: Goal): Promise<void> {
    const safeId = toSafeId(goal.id);
    if (!safeId) return;
    const path = `users/${userId}/goals/${safeId}`;
    const ref = doc(firestoreDb, 'users', userId, 'goals', safeId);
    const mutable = buildGoalMutable(goal);

    if (knownGoals.has(safeId)) {
      try {
        await updateDoc(ref, mutable);
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, path);
      }
    } else {
      knownGoals.add(safeId);
      try {
        await setDoc(ref, {
          id: safeId,
          ownerId: userId,
          ...mutable,
          createdAt: serverTimestamp(),
        });
      } catch (error) {
        knownGoals.delete(safeId);
        handleFirestoreError(error, OperationType.CREATE, path);
      }
    }
  },

  async deleteGoal(userId: string, goalId: string): Promise<void> {
    const safeId = toSafeId(goalId);
    if (!safeId) return;
    const path = `users/${userId}/goals/${safeId}`;
    knownGoals.delete(safeId);
    try {
      await deleteDoc(doc(firestoreDb, 'users', userId, 'goals', safeId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  },

  async savePreferences(userId: string, prefs: WorkspacePreferences): Promise<void> {
    const path = `users/${userId}/preferences/default`;
    const ref = doc(firestoreDb, 'users', userId, 'preferences', 'default');
    const mutable = buildPreferencesMutable(prefs);

    if (knownPrefs.has('default')) {
      try {
        await updateDoc(ref, mutable);
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, path);
      }
    } else {
      knownPrefs.add('default');
      try {
        await setDoc(ref, {
          id: 'default',
          ownerId: userId,
          ...mutable,
        });
      } catch (error) {
        knownPrefs.delete('default');
        handleFirestoreError(error, OperationType.CREATE, path);
      }
    }
  },
};
