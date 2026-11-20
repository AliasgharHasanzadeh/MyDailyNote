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
      id: 'fld_personal',
      name: 'Personal',
      parentId: null,
      icon: '🌿',
      isPinned: true,
      isExpanded: true,
      sortOrder: 0,
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
      id: 'fld_memories',
      name: 'Memories',
      parentId: 'fld_personal',
      icon: '🎞️',
      isPinned: false,
      isExpanded: false,
      sortOrder: 1,
      createdAt: isoTwoDaysAgo,
      updatedAt: isoYesterday,
    },
    {
      id: 'fld_work',
      name: 'Work',
      parentId: null,
      icon: '💼',
      isPinned: true,
      isExpanded: true,
      sortOrder: 1,
      createdAt: isoTwoDaysAgo,
      updatedAt: isoNow,
    },
    {
      id: 'fld_rootlab',
      name: 'RootLab',
      parentId: 'fld_work',
      icon: '🔬',
      isPinned: false,
      isExpanded: true,
      sortOrder: 0,
      createdAt: isoTwoDaysAgo,
      updatedAt: isoNow,
    },
    {
      id: 'fld_learning',
      name: 'Learning',
      parentId: 'fld_work',
      icon: '📚',
      isPinned: false,
      isExpanded: false,
      sortOrder: 1,
      createdAt: isoTwoDaysAgo,
      updatedAt: isoYesterday,
    },
    {
      id: 'fld_university',
      name: 'University',
      parentId: null,
      icon: '🎓',
      isPinned: false,
      isExpanded: false,
      sortOrder: 2,
      createdAt: isoTwoDaysAgo,
      updatedAt: isoTwoDaysAgo,
    },
  ];

  const makeNote = (partial: Omit<Note, 'plainText'>): Note => ({
    ...partial,
    plainText: extractPlainText(partial.content),
  });

  const notes: Note[] = [
    makeNote({
      id: 'note_journal_today',
      title: `Daily Journal — ${todayKey}`,
      parentFolderId: 'fld_daily_life',
      icon: '☀️',
      coverImage: BUILT_IN_COVERS[0].url,
      tags: ['journal', 'reflection'],
      isFavorite: true,
      isPinned: true,
      isArchived: false,
      sortOrder: 0,
      journalDate: todayKey,
      journalMetadata: {
        mood: 'Focused',
        rating: 4,
        highlights: ['Deep morning writing session', 'Wrapped up workspace architecture'],
      },
      linkedNoteIds: ['note_rootlab_ideas'],
      createdAt: isoEarlier,
      updatedAt: isoNow,
      content: {
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level: 2 },
            content: [{ type: 'text', text: 'Morning Thoughts' }],
          },
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'Started the morning slowly with coffee before opening the laptop. Keeping the desk clear made it much easier to stay focused on one thing at a time.',
              },
            ],
          },
          {
            type: 'callout',
            attrs: { emoji: '💡' },
            content: [
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    text: 'Reminder: Every note here is completely freeform. Type "/" anywhere or hover any block to drag, reorder, or insert images, audio, files, and checklists.',
                  },
                ],
              },
            ],
          },
          {
            type: 'heading',
            attrs: { level: 3 },
            content: [{ type: 'text', text: 'Intentions for Today' }],
          },
          {
            type: 'taskList',
            content: [
              {
                type: 'taskItem',
                attrs: { checked: true },
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Review weekly priorities and clear inbox' }] }],
              },
              {
                type: 'taskItem',
                attrs: { checked: false },
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Draft milestone plan for RootLab Q4 prototype' }] }],
              },
              {
                type: 'taskItem',
                attrs: { checked: false },
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Evening walk without headphones' }] }],
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
      id: 'note_journal_yesterday',
      title: `Daily Journal — ${yesterdayKey}`,
      parentFolderId: 'fld_daily_life',
      icon: '🌙',
      coverImage: null,
      tags: ['journal', 'calm'],
      isFavorite: false,
      isPinned: false,
      isArchived: false,
      sortOrder: 1,
      journalDate: yesterdayKey,
      journalMetadata: {
        mood: 'Calm',
        rating: 5,
        highlights: ['Finished reading chapter 4', 'Cooked dinner from scratch'],
      },
      linkedNoteIds: ['note_linux_notes'],
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
                text: 'A remarkably quiet day. Spent two uninterrupted hours organizing Linux shell scripts and reading notes.',
              },
            ],
          },
          {
            type: 'taskList',
            content: [
              {
                type: 'taskItem',
                attrs: { checked: true },
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Backup dotfiles repository' }] }],
              },
              {
                type: 'taskItem',
                attrs: { checked: true },
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Journal before sleep' }] }],
              },
            ],
          },
        ],
      },
    }),
    makeNote({
      id: 'note_journal_two_days',
      title: `Daily Journal — ${twoDaysAgoKey}`,
      parentFolderId: 'fld_daily_life',
      icon: '🌧️',
      coverImage: null,
      tags: ['journal'],
      isFavorite: false,
      isPinned: false,
      isArchived: false,
      sortOrder: 2,
      journalDate: twoDaysAgoKey,
      journalMetadata: {
        mood: 'Reflective',
        rating: 4,
        highlights: ['Sketched system architecture'],
      },
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
                text: 'Rain outside all afternoon. Great weather for deep study and sketching out personal goals for the next quarter.',
              },
            ],
          },
        ],
      },
    }),
    makeNote({
      id: 'note_rootlab_ideas',
      title: 'Project Ideas & Architecture',
      parentFolderId: 'fld_rootlab',
      icon: '🔬',
      coverImage: BUILT_IN_COVERS[2].url,
      tags: ['work', 'architecture', 'rootlab'],
      isFavorite: true,
      isPinned: true,
      isArchived: false,
      sortOrder: 0,
      journalDate: null,
      linkedNoteIds: ['note_journal_today', 'note_linux_notes'],
      createdAt: isoTwoDaysAgo,
      updatedAt: isoEarlier,
      content: {
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level: 2 },
            content: [{ type: 'text', text: 'Core Principles' }],
          },
          {
            type: 'bulletList',
            content: [
              {
                type: 'listItem',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Local-first IndexedDB persistence with zero loading friction' }] }],
              },
              {
                type: 'listItem',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Composable freeform blocks that can be reordered anywhere' }] }],
              },
              {
                type: 'listItem',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Seamless link between daily writing, actionable tasks, and long-term goals' }] }],
              },
            ],
          },
          {
            type: 'codeBlock',
            content: [
              {
                type: 'text',
                text: 'interface SyncRecord {\n  id: string;\n  updatedAt: string;\n  version: number;\n}',
              },
            ],
          },
          {
            type: 'horizontalRule',
          },
          {
            type: 'heading',
            attrs: { level: 3 },
            content: [{ type: 'text', text: 'Next Steps' }],
          },
          {
            type: 'taskList',
            content: [
              {
                type: 'taskItem',
                attrs: { checked: true },
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Define hierarchical folder schema' }] }],
              },
              {
                type: 'taskItem',
                attrs: { checked: false },
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Benchmark offline search performance' }] }],
              },
            ],
          },
        ],
      },
    }),
    makeNote({
      id: 'note_linux_notes',
      title: 'Linux & Shell Essentials',
      parentFolderId: 'fld_learning',
      icon: '🐧',
      coverImage: null,
      tags: ['linux', 'learning', 'cli'],
      isFavorite: false,
      isPinned: false,
      isArchived: false,
      sortOrder: 0,
      journalDate: null,
      linkedNoteIds: ['note_rootlab_ideas'],
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
                text: 'Quick reference commands for inspecting system services, sockets, and disk usage.',
              },
            ],
          },
          {
            type: 'codeBlock',
            content: [
              {
                type: 'text',
                text: 'ss -tulpn\nsystemctl status --no-pager\ndu -sh * | sort -h',
              },
            ],
          },
        ],
      },
    }),
    makeNote({
      id: 'note_travel_memories',
      title: 'Autumn Ridge Trip Notes',
      parentFolderId: 'fld_memories',
      icon: '🏔️',
      coverImage: BUILT_IN_COVERS[1].url,
      tags: ['travel', 'memories'],
      isFavorite: true,
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
                text: 'Early mist rolling across the valley at 6:30 AM. The trail stayed completely quiet until noon.',
              },
            ],
          },
          {
            type: 'mediaImage',
            attrs: {
              src: BUILT_IN_COVERS[1].url,
              caption: 'Morning mist over the ridge trail',
              width: 'wide',
            },
          },
        ],
      },
    }),
    makeNote({
      id: 'note_exam_prep',
      title: 'Distributed Systems Exam Prep',
      parentFolderId: 'fld_university',
      icon: '🎓',
      coverImage: null,
      tags: ['university', 'study'],
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
            type: 'heading',
            attrs: { level: 2 },
            content: [{ type: 'text', text: 'Topics to Master' }],
          },
          {
            type: 'taskList',
            content: [
              {
                type: 'taskItem',
                attrs: { checked: true },
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Raft leader election & log replication' }] }],
              },
              {
                type: 'taskItem',
                attrs: { checked: false },
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Vector clocks vs Lamport timestamps' }] }],
              },
            ],
          },
        ],
      },
    }),
  ];

  const goals: Goal[] = [
    {
      id: 'goal_rootlab_v1',
      title: 'Ship RootLab Personal Workspace v1',
      description: 'Complete core architecture, polish offline storage, and run usability sessions.',
      horizon: 'short_term',
      targetDate: nextWeekKey,
      progressMode: 'auto',
      manualProgress: 60,
      milestones: [
        { id: 'ms_1', title: 'Finalize block editor specification', completed: true },
        { id: 'ms_2', title: 'Implement IndexedDB media persistence', completed: true },
        { id: 'ms_3', title: 'Review keyboard navigation & accessibility', completed: false },
      ],
      linkedNoteIds: ['note_rootlab_ideas', 'note_journal_today'],
      status: 'active',
      createdAt: isoTwoDaysAgo,
      updatedAt: isoNow,
    },
    {
      id: 'goal_daily_writing',
      title: 'Maintain Daily Reflection Habit',
      description: 'Write a short candid journal entry at least 5 days a week to track clarity and energy.',
      horizon: 'long_term',
      targetDate: addDaysToKey(todayKey, 30),
      progressMode: 'manual',
      manualProgress: 45,
      milestones: [
        { id: 'ms_4', title: 'Complete first 7-day journal streak', completed: false },
      ],
      linkedNoteIds: ['note_journal_today', 'note_journal_yesterday'],
      status: 'active',
      createdAt: isoTwoDaysAgo,
      updatedAt: isoNow,
    },
  ];

  const tasks: Task[] = [
    {
      id: 'task_1',
      title: 'Draft milestone plan for RootLab Q4 prototype',
      description: 'Outline deliverables, timeline, and risk areas inside the architecture note.',
      status: 'in_progress',
      priority: 'high',
      dueDate: todayKey,
      folderId: 'fld_rootlab',
      linkedNoteId: 'note_rootlab_ideas',
      linkedGoalId: 'goal_rootlab_v1',
      createdAt: isoYesterday,
      updatedAt: isoNow,
      completedAt: null,
    },
    {
      id: 'task_2',
      title: 'Review Raft consensus lecture notes',
      description: 'Focus on safety proofs and term transitions.',
      status: 'todo',
      priority: 'medium',
      dueDate: todayKey,
      folderId: 'fld_university',
      linkedNoteId: 'note_exam_prep',
      linkedGoalId: null,
      createdAt: isoYesterday,
      updatedAt: isoYesterday,
      completedAt: null,
    },
    {
      id: 'task_3',
      title: 'Organize autumn photography archive',
      description: 'Select top 10 photos and attach them to the Memories note.',
      status: 'todo',
      priority: 'low',
      dueDate: tomorrowKey,
      folderId: 'fld_memories',
      linkedNoteId: 'note_travel_memories',
      linkedGoalId: null,
      createdAt: isoTwoDaysAgo,
      updatedAt: isoYesterday,
      completedAt: null,
    },
    {
      id: 'task_4',
      title: 'Renew personal domain & SSL check',
      description: 'Verify DNS records before expiration.',
      status: 'todo',
      priority: 'high',
      dueDate: yesterdayKey,
      folderId: 'fld_work',
      linkedNoteId: null,
      linkedGoalId: null,
      createdAt: isoTwoDaysAgo,
      updatedAt: isoTwoDaysAgo,
      completedAt: null,
    },
    {
      id: 'task_5',
      title: 'Backup Linux dotfiles to private repo',
      description: 'Include nvim, tmux, and zsh configurations.',
      status: 'done',
      priority: 'medium',
      dueDate: yesterdayKey,
      folderId: 'fld_learning',
      linkedNoteId: 'note_linux_notes',
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
