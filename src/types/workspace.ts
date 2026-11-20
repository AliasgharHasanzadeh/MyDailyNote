import type { JSONContent } from '@tiptap/react';

export type WorkspaceSection =
  | 'dashboard'
  | 'quick_access'
  | 'all_notes'
  | 'favorites'
  | 'recent'
  | 'journal'
  | 'tasks'
  | 'goals'
  | 'archived'
  | 'folder'
  | 'editor';

export type NoteViewMode = 'list' | 'compact' | 'grid';
export type JournalViewMode = 'calendar' | 'timeline' | 'list';
export type TaskViewMode = 'list' | 'kanban';
export type TaskStatus = 'todo' | 'in_progress' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high';
export type GoalHorizon = 'short_term' | 'long_term';
export type CalendarLocale = 'en' | 'fa';

export interface Folder {
  id: string;
  name: string;
  parentId: string | null;
  icon: string;
  isPinned: boolean;
  isExpanded: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface JournalMetadata {
  mood?: string;
  rating?: number;
  highlights?: string[];
}

export interface Note {
  id: string;
  title: string;
  content: JSONContent;
  plainText: string;
  parentFolderId: string | null;
  icon: string | null;
  coverImage: string | null;
  tags: string[];
  isFavorite: boolean;
  isPinned: boolean;
  isArchived: boolean;
  sortOrder: number;
  journalDate: string | null; // YYYY-MM-DD
  isCustomJournalTitle?: boolean;
  journalMetadata?: JournalMetadata;
  linkedNoteIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null; // YYYY-MM-DD
  folderId: string | null;
  linkedNoteId: string | null;
  linkedGoalId: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface GoalMilestone {
  id: string;
  title: string;
  completed: boolean;
}

export interface Goal {
  id: string;
  title: string;
  description: string;
  horizon: GoalHorizon;
  targetDate: string | null; // YYYY-MM-DD
  progressMode: 'auto' | 'manual';
  manualProgress: number; // 0 - 100
  milestones: GoalMilestone[];
  linkedNoteIds: string[];
  status: 'active' | 'completed';
  createdAt: string;
  updatedAt: string;
}

export interface MediaAsset {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  blob: Blob;
  createdAt: string;
}

export interface WorkspacePreferences {
  id: 'default';
  theme: 'dark' | 'light';
  calendarLocale: CalendarLocale;
  rightSidebarOpen: boolean;
  leftSidebarCollapsed: boolean;
  leftSidebarWidth: number;
  notesViewMode: NoteViewMode;
  journalViewMode: JournalViewMode;
  taskViewMode: TaskViewMode;
  activeNoteId: string | null;
  activeSection: WorkspaceSection;
  activeFolderId: string | null;
}

export const BUILT_IN_COVERS = [
  {
    id: 'dusk',
    label: 'Dusk Horizon',
    url: '/src/assets/images/cover_dusk_horizon_1795025891112.jpg',
  },
  {
    id: 'mist',
    label: 'Mist Ridge',
    url: '/src/assets/images/cover_mist_ridge_1795025895377.jpg',
  },
  {
    id: 'linen',
    label: 'Linen & Plaster',
    url: '/src/assets/images/cover_linen_waves_1795025893134.jpg',
  },
] as const;

export const MOOD_OPTIONS = [
  { value: 'Calm', emoji: '🌿' },
  { value: 'Focused', emoji: '🎯' },
  { value: 'Energized', emoji: '⚡' },
  { value: 'Reflective', emoji: '🌙' },
  { value: 'Grateful', emoji: '✨' },
  { value: 'Tired', emoji: '☁️' },
] as const;

export const QUICK_EMOJIS = [
  '📄', '📝', '📔', '✨', '🎯', '💡', '🌿', '🏔️', '📚', '💻',
  '🎧', '🎨', '🔬', '🧭', '📌', '🗂️', '📅', '🧠', '☕', '🌙',
];
