import type {
  Folder,
  Goal,
  MediaAsset,
  Note,
  Task,
  WorkspacePreferences,
} from '../types/workspace';
import { BUILT_IN_COVERS } from '../types/workspace';
import { addDaysToKey, toDateKey } from '../utils/date';
import { extractPlainText } from '../utils/tiptap';

const DB_NAME = 'vellum_workspace_v1';
const DB_VERSION = 1;

const STORES = {
  folders: 'folders',
  notes: 'notes',
  tasks: 'tasks',
  goals: 'goals',
  media: 'media',
  preferences: 'preferences',
} as const;

type StoreName = (typeof STORES)[keyof typeof STORES];

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORES.folders)) {
        db.createObjectStore(STORES.folders, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.notes)) {
        db.createObjectStore(STORES.notes, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.tasks)) {
        db.createObjectStore(STORES.tasks, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.goals)) {
        db.createObjectStore(STORES.goals, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.media)) {
        db.createObjectStore(STORES.media, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.preferences)) {
        db.createObjectStore(STORES.preferences, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return dbPromise;
}

async function getAllFromStore<T>(storeName: StoreName): Promise<T[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.getAll();
    req.onsuccess = () => resolve((req.result as T[]) || []);
    req.onerror = () => reject(req.error);
  });
}

async function getFromStore<T>(storeName: StoreName, key: string): Promise<T | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

async function putInStore<T>(storeName: StoreName, item: T): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const req = store.put(item);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function deleteFromStore(storeName: StoreName, key: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const req = store.delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export function createId(prefix: string): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `${prefix}_${crypto.randomUUID().slice(0, 10)}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

// Public CRUD APIs
export const db = {
  // Folders
  getFolders: () => getAllFromStore<Folder>(STORES.folders),
  saveFolder: (folder: Folder) => putInStore(STORES.folders, folder),
  deleteFolder: (id: string) => deleteFromStore(STORES.folders, id),

  // Notes
  getNotes: () => getAllFromStore<Note>(STORES.notes),
  saveNote: (note: Note) => putInStore(STORES.notes, note),
  deleteNote: (id: string) => deleteFromStore(STORES.notes, id),

  // Tasks
  getTasks: () => getAllFromStore<Task>(STORES.tasks),
  saveTask: (task: Task) => putInStore(STORES.tasks, task),
  deleteTask: (id: string) => deleteFromStore(STORES.tasks, id),

  // Goals
  getGoals: () => getAllFromStore<Goal>(STORES.goals),
  saveGoal: (goal: Goal) => putInStore(STORES.goals, goal),
  deleteGoal: (id: string) => deleteFromStore(STORES.goals, id),

  // Media Blobs
  async saveMediaFile(file: File): Promise<MediaAsset> {
    const asset: MediaAsset = {
      id: createId('media'),
      name: file.name,
      mimeType: file.type || 'application/octet-stream',
      size: file.size,
      blob: file,
      createdAt: new Date().toISOString(),
    };
    await putInStore(STORES.media, asset);
    return asset;
  },
  getMediaAsset: (id: string) => getFromStore<MediaAsset>(STORES.media, id),
  deleteMediaAsset: (id: string) => deleteFromStore(STORES.media, id),

  // Preferences
  async getPreferences(): Promise<WorkspacePreferences> {
    const existing = await getFromStore<WorkspacePreferences>(STORES.preferences, 'default');
    if (existing) {
      return {
        ...existing,
        calendarLocale: existing.calendarLocale || 'en',
        leftSidebarWidth: existing.leftSidebarWidth || 272,
      };
    }
    const defaults: WorkspacePreferences = {
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
    };
    await putInStore(STORES.preferences, defaults);
    return defaults;
  },
  savePreferences: (prefs: WorkspacePreferences) => putInStore(STORES.preferences, prefs),

  async replaceWorkspace(data: {
    folders: Folder[];
    notes: Note[];
    tasks: Task[];
    goals: Goal[];
    preferences: WorkspacePreferences;
  }): Promise<void> {
    const idb = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = idb.transaction(
        [STORES.folders, STORES.notes, STORES.tasks, STORES.goals, STORES.preferences],
        'readwrite'
      );
      tx.objectStore(STORES.folders).clear();
      tx.objectStore(STORES.notes).clear();
      tx.objectStore(STORES.tasks).clear();
      tx.objectStore(STORES.goals).clear();

      const fStore = tx.objectStore(STORES.folders);
      data.folders.forEach((f) => fStore.put(f));

      const nStore = tx.objectStore(STORES.notes);
      data.notes.forEach((n) => nStore.put(n));

      const tStore = tx.objectStore(STORES.tasks);
      data.tasks.forEach((t) => tStore.put(t));

      const gStore = tx.objectStore(STORES.goals);
      data.goals.forEach((g) => gStore.put(g));

      tx.objectStore(STORES.preferences).put({ ...data.preferences, id: 'default' });

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },
};

export async function seedInitialWorkspaceIfEmpty(): Promise<{
  folders: Folder[];
  notes: Note[];
  tasks: Task[];
  goals: Goal[];
  preferences: WorkspacePreferences;
}> {
  const [existingFolders, existingNotes, existingTasks, existingGoals, preferences] =
    await Promise.all([
      db.getFolders(),
      db.getNotes(),
      db.getTasks(),
      db.getGoals(),
      db.getPreferences(),
    ]);

  if (existingFolders.length > 0 || existingNotes.length > 0 || existingTasks.length > 0) {
    return {
      folders: existingFolders,
      notes: existingNotes,
      tasks: existingTasks,
      goals: existingGoals,
      preferences,
    };
  }

  const now = new Date();
  const isoNow = now.toISOString();
  const isoEarlier = new Date(now.getTime() - 1000 * 60 * 95).toISOString();
  const isoYesterday = new Date(now.getTime() - 1000 * 60 * 60 * 24).toISOString();
  const isoTwoDaysAgo = new Date(now.getTime() - 1000 * 60 * 60 * 48).toISOString();

  const todayKey = toDateKey(now);
  const yesterdayKey = addDaysToKey(todayKey, -1);
  const twoDaysAgoKey = addDaysToKey(todayKey, -2);
  const tomorrowKey = addDaysToKey(todayKey, 1);
  const nextWeekKey = addDaysToKey(todayKey, 5);

  const folders: Folder[] = [
    {
      id: 'fld_getting_started',
      name: 'Getting Started',
      parentId: null,
      icon: '✨',
      isPinned: true,
      isExpanded: true,
      sortOrder: 0,
      createdAt: isoTwoDaysAgo,
      updatedAt: isoNow,
    },
    {
      id: 'fld_personal',
      name: 'Personal',
      parentId: null,
      icon: '🌿',
      isPinned: false,
      isExpanded: true,
      sortOrder: 1,
      createdAt: isoTwoDaysAgo,
      updatedAt: isoNow,
    },
    {
      id: 'fld_daily_life',
      name: 'Daily Life',
      parentId: 'fld_personal',
      icon: '📔',
      isPinned: false,
      isExpanded: true,
      sortOrder: 0,
      createdAt: isoTwoDaysAgo,
      updatedAt: isoNow,
    },
    {
      id: 'fld_projects',
      name: 'Projects',
      parentId: null,
      icon: '💼',
      isPinned: false,
      isExpanded: true,
      sortOrder: 2,
      createdAt: isoTwoDaysAgo,
      updatedAt: isoNow,
    },
    {
      id: 'fld_reading',
      name: 'Reading & Ideas',
      parentId: null,
      icon: '📚',
      isPinned: false,
      isExpanded: false,
      sortOrder: 3,
      createdAt: isoTwoDaysAgo,
      updatedAt: isoYesterday,
    },
  ];

  const makeNote = (partial: Omit<Note, 'plainText'>): Note => ({
    ...partial,
    plainText: extractPlainText(partial.content),
  });

  const notes: Note[] = [
    makeNote({
      id: 'note_welcome_guide',
      title: 'Welcome to Vellum — Quick Start Guide',
      parentFolderId: 'fld_getting_started',
      icon: '✨',
      coverImage: BUILT_IN_COVERS[0].url,
      tags: ['guide', 'welcome'],
      isFavorite: true,
      isPinned: true,
      isArchived: false,
      sortOrder: 0,
      journalDate: null,
      linkedNoteIds: ['note_journal_today', 'note_project_template'],
      createdAt: isoEarlier,
      updatedAt: isoNow,
      content: {
        type: 'doc',
        content: [
          {
            type: 'callout',
            attrs: { emoji: '👋' },
            content: [
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    text: 'Welcome to Vellum! This is your personal digital notebook, daily journal, task manager, and goal tracker — designed to keep all your notes and media organized in one calm workspace.',
                  },
                ],
              },
            ],
          },
          {
            type: 'heading',
            attrs: { level: 2 },
            content: [{ type: 'text', text: '1. Save Everything in Google Drive' }],
          },
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'Click "Connect Google Drive" at the top or bottom of the sidebar to create a "Vellum Workspace" folder in your Google Drive. Once connected, your notes, folders, tasks, goals, and original-quality images, audio, videos, and files are synced directly to your Drive.',
              },
            ],
          },
          {
            type: 'heading',
            attrs: { level: 2 },
            content: [{ type: 'text', text: '2. Write Freely with Blocks & RTL Support' }],
          },
          {
            type: 'bulletList',
            content: [
              {
                type: 'listItem',
                content: [
                  {
                    type: 'paragraph',
                    content: [
                      {
                        type: 'text',
                        text: 'Type "/" anywhere in a note or click "Insert block" to add headings, checklists, quotes, callouts, images, audio, video, or file attachments.',
                      },
                    ],
                  },
                ],
              },
              {
                type: 'listItem',
                content: [
                  {
                    type: 'paragraph',
                    content: [
                      {
                        type: 'text',
                        text: 'Bilingual & Persian (RTL) ready: Text automatically adapts as you type, or use the RTL / LTR / AUTO controls in the toolbar to set paragraph or full-page direction.',
                      },
                    ],
                  },
                ],
              },
              {
                type: 'listItem',
                content: [
                  {
                    type: 'paragraph',
                    content: [
                      {
                        type: 'text',
                        text: 'Switch between Gregorian and Persian (Jalali / شمسی) calendars anytime in Settings.',
                      },
                    ],
                  },
                ],
              },
            ],
          },
          {
            type: 'heading',
            attrs: { level: 2 },
            content: [{ type: 'text', text: '3. Manage Notes & Folders Easily' }],
          },
          {
            type: 'taskList',
            content: [
              {
                type: 'taskItem',
                attrs: { checked: true },
                content: [
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'Desktop: Right-click or hover any note/folder for quick actions, or drag & drop to reorganize.' }],
                  },
                ],
              },
              {
                type: 'taskItem',
                attrs: { checked: false },
                content: [
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'Mobile: Press and hold any note or folder (or tap ⋯) to rename, pin, move, archive, or delete.' }],
                  },
                ],
              },
              {
                type: 'taskItem',
                attrs: { checked: false },
                content: [
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'Press Ctrl+K / ⌘K anytime to search across all notes, tasks, and goals.' }],
                  },
                ],
              },
            ],
          },
        ],
      },
    }),
    makeNote({
      id: 'note_journal_today',
      title: `Daily Journal — ${todayKey}`,
      parentFolderId: 'fld_daily_life',
      icon: '☀️',
      coverImage: null,
      tags: ['journal', 'sample'],
      isFavorite: false,
      isPinned: false,
      isArchived: false,
      sortOrder: 0,
      journalDate: todayKey,
      journalMetadata: {
        mood: 'Focused',
        rating: 4,
        highlights: ['Set up my personal workspace', 'Outlined weekly priorities'],
      },
      linkedNoteIds: ['note_welcome_guide'],
      createdAt: isoEarlier,
      updatedAt: isoNow,
      content: {
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level: 2 },
            content: [{ type: 'text', text: 'Today’s Reflection' }],
          },
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'This is a sample Daily Journal entry. You can record your mood, day rating, and highlights above, and jump between dates using the Daily Journal calendar.',
              },
            ],
          },
          {
            type: 'taskList',
            content: [
              {
                type: 'taskItem',
                attrs: { checked: true },
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Explore the Welcome Guide' }] }],
              },
              {
                type: 'taskItem',
                attrs: { checked: false },
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Write your first real entry for today' }] }],
              },
            ],
          },
        ],
      },
    }),
    makeNote({
      id: 'note_journal_yesterday',
      title: `Daily Journal — ${yesterdayKey}`,
      parentFolderId: 'fld_daily_life',
      icon: '🌙',
      coverImage: null,
      tags: ['journal', 'sample'],
      isFavorite: false,
      isPinned: false,
      isArchived: false,
      sortOrder: 1,
      journalDate: yesterdayKey,
      journalMetadata: {
        mood: 'Calm',
        rating: 5,
        highlights: ['Quiet evening reading'],
      },
      linkedNoteIds: [],
      createdAt: isoYesterday,
      updatedAt: isoYesterday,
      content: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'Sample past entry showing how previous days appear in the Daily Journal timeline and calendar.',
              },
            ],
          },
        ],
      },
    }),
    makeNote({
      id: 'note_project_template',
      title: 'Project Plan Template',
      parentFolderId: 'fld_projects',
      icon: '🗂️',
      coverImage: BUILT_IN_COVERS[2].url,
      tags: ['template', 'projects'],
      isFavorite: true,
      isPinned: false,
      isArchived: false,
      sortOrder: 0,
      journalDate: null,
      linkedNoteIds: ['note_welcome_guide'],
      createdAt: isoTwoDaysAgo,
      updatedAt: isoEarlier,
      content: {
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level: 2 },
            content: [{ type: 'text', text: 'Overview & Objectives' }],
          },
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'Use this sample template to plan a personal or work project. You can duplicate it, attach reference files, and link tasks or goals from the right-hand inspector panel.',
              },
            ],
          },
          {
            type: 'heading',
            attrs: { level: 3 },
            content: [{ type: 'text', text: 'Key Milestones' }],
          },
          {
            type: 'taskList',
            content: [
              {
                type: 'taskItem',
                attrs: { checked: true },
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Define project scope and deliverables' }] }],
              },
              {
                type: 'taskItem',
                attrs: { checked: false },
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Break down weekly action items' }] }],
              },
            ],
          },
          {
            type: 'blockquote',
            content: [
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    text: 'Simplicity is about subtracting the obvious and adding the meaningful.',
                  },
                ],
              },
            ],
          },
        ],
      },
    }),
    makeNote({
      id: 'note_reading_sample',
      title: 'Reading Notes & Quotes (Sample)',
      parentFolderId: 'fld_reading',
      icon: '📖',
      coverImage: BUILT_IN_COVERS[1].url,
      tags: ['reading', 'sample'],
      isFavorite: false,
      isPinned: false,
      isArchived: false,
      sortOrder: 0,
      journalDate: null,
      linkedNoteIds: [],
      createdAt: isoTwoDaysAgo,
      updatedAt: isoTwoDaysAgo,
      content: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'Collect memorable passages, book summaries, or articles here. Feel free to edit or delete any sample notes once you are ready.',
              },
            ],
          },
          {
            type: 'mediaImage',
            attrs: {
              src: BUILT_IN_COVERS[1].url,
              caption: 'Sample embedded cover image',
              width: 'wide',
            },
          },
        ],
      },
    }),
  ];

  const goals: Goal[] = [
    {
      id: 'goal_workspace_setup',
      title: 'Organize My Personal Workspace (Sample)',
      description: 'Sample goal showing milestone tracking and automatic progress calculation.',
      horizon: 'short_term',
      targetDate: nextWeekKey,
      progressMode: 'auto',
      manualProgress: 50,
      milestones: [
        { id: 'ms_1', title: 'Read the Quick Start Guide', completed: true },
        { id: 'ms_2', title: 'Connect Google Drive for automatic backup', completed: false },
        { id: 'ms_3', title: 'Create your first custom folder and note', completed: false },
      ],
      linkedNoteIds: ['note_welcome_guide'],
      status: 'active',
      createdAt: isoTwoDaysAgo,
      updatedAt: isoNow,
    },
    {
      id: 'goal_daily_writing',
      title: 'Build a Daily Journaling Habit (Sample)',
      description: 'Write a short reflection a few times a week to track clarity, mood, and focus.',
      horizon: 'long_term',
      targetDate: addDaysToKey(todayKey, 30),
      progressMode: 'manual',
      manualProgress: 35,
      milestones: [
        { id: 'ms_4', title: 'Complete a 7-day journal streak', completed: false },
      ],
      linkedNoteIds: ['note_journal_today'],
      status: 'active',
      createdAt: isoTwoDaysAgo,
      updatedAt: isoNow,
    },
  ];

  const tasks: Task[] = [
    {
      id: 'task_1',
      title: 'Connect Google Drive to back up my workspace',
      description: 'Keep all notes and media safely synced in Google Drive › Vellum Workspace.',
      status: 'in_progress',
      priority: 'high',
      dueDate: todayKey,
      folderId: 'fld_getting_started',
      linkedNoteId: 'note_welcome_guide',
      linkedGoalId: 'goal_workspace_setup',
      createdAt: isoYesterday,
      updatedAt: isoNow,
      completedAt: null,
    },
    {
      id: 'task_2',
      title: 'Try creating a new note or daily journal entry',
      description: 'Sample task linked to your daily journal.',
      status: 'todo',
      priority: 'medium',
      dueDate: todayKey,
      folderId: 'fld_daily_life',
      linkedNoteId: 'note_journal_today',
      linkedGoalId: null,
      createdAt: isoYesterday,
      updatedAt: isoYesterday,
      completedAt: null,
    },
    {
      id: 'task_3',
      title: 'Explore Kanban & List task views',
      description: 'Switch views from the top-right toggle on the Tasks page.',
      status: 'todo',
      priority: 'low',
      dueDate: tomorrowKey,
      folderId: 'fld_projects',
      linkedNoteId: 'note_project_template',
      linkedGoalId: null,
      createdAt: isoTwoDaysAgo,
      updatedAt: isoYesterday,
      completedAt: null,
    },
    {
      id: 'task_4',
      title: 'Check appearance & calendar preferences in Settings',
      description: 'Try Dark/Light theme and English/Persian (شمسی) calendar options.',
      status: 'done',
      priority: 'medium',
      dueDate: yesterdayKey,
      folderId: 'fld_getting_started',
      linkedNoteId: 'note_welcome_guide',
      linkedGoalId: null,
      createdAt: isoTwoDaysAgo,
      updatedAt: isoYesterday,
      completedAt: isoYesterday,
    },
  ];

  await Promise.all([
    ...folders.map((f) => db.saveFolder(f)),
    ...notes.map((n) => db.saveNote(n)),
    ...tasks.map((t) => db.saveTask(t)),
    ...goals.map((g) => db.saveGoal(g)),
  ]);

  return { folders, notes, tasks, goals, preferences };
}
