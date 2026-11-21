import {
  ArrowRight,
  Calendar,
  CheckCircle2,
  Circle,
  Clock,
  Menu,
  Plus,
  Target,
} from 'lucide-react';
import { useMemo } from 'react';
import type { CalendarLocale, Folder, Goal, Note, Task, WorkspaceSection } from '../../types/workspace';
import {
  formatFullDate,
  formatNumericDate,
  formatRelativeTime,
  formatShortDate,
  toDateKey,
} from '../../utils/date';
import { getPreviewSnippet } from '../../utils/tiptap';

interface DashboardViewProps {
  notes: Note[];
  folders: Folder[];
  tasks: Task[];
  goals: Goal[];
  calendarLocale: CalendarLocale;
  onOpenMobileSidebar: () => void;
  onSelectNote: (noteId: string) => void;
  onOpenTodayJournal: () => void;
  onCreateNote: () => void;
  onToggleTask: (taskId: string) => void;
  onNavigateSection: (section: WorkspaceSection) => void;
  onQuickCreateTask: () => void;
}

export function DashboardView({
  notes,
  folders,
  tasks,
  goals,
  calendarLocale,
  onOpenMobileSidebar,
  onSelectNote,
  onOpenTodayJournal,
  onCreateNote,
  onToggleTask,
  onNavigateSection,
  onQuickCreateTask,
}: DashboardViewProps) {
  const todayKey = toDateKey();
  const activeNotes = useMemo(
    () => notes.filter((n) => !n.isArchived && !n.deletedAt),
    [notes]
  );

  const todayJournal = useMemo(
    () => activeNotes.find((n) => n.journalDate === todayKey) || null,
    [activeNotes, todayKey]
  );

  const todayTasks = useMemo(
    () =>
      tasks.filter(
        (t) => t.status !== 'done' && t.dueDate && t.dueDate <= todayKey
      ),
    [tasks, todayKey]
  );

  const upcomingTasks = useMemo(
    () =>
      tasks
        .filter((t) => t.status !== 'done' && t.dueDate && t.dueDate > todayKey)
        .sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''))
        .slice(0, 5),
    [tasks, todayKey]
  );

  const activeGoals = useMemo(
    () => goals.filter((g) => g.status === 'active').slice(0, 4),
    [goals]
  );

  const recentNotes = useMemo(
    () =>
      [...activeNotes]
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, 6),
    [activeNotes]
  );

  const getFolderName = (folderId: string | null) => {
    if (!folderId) return null;
    const f = folders.find((item) => item.id === folderId);
    return f ? `${f.icon} ${f.name}` : null;
  };

  const getGoalProgress = (goal: Goal) => {
    if (goal.progressMode === 'manual') return goal.manualProgress;
    const linked = tasks.filter((t) => t.linkedGoalId === goal.id);
    const total = goal.milestones.length + linked.length;
    if (total === 0) return goal.manualProgress;
    const done =
      goal.milestones.filter((m) => m.completed).length +
      linked.filter((t) => t.status === 'done').length;
    return Math.round((done / total) * 100);
  };

  return (
    <div className="flex h-full flex-col bg-[var(--bg-canvas)] overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl px-6 py-8 sm:px-10 lg:py-10">
        {/* Top Row: Mobile Trigger + Date + Quick Create */}
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--border-subtle)] pb-6">
          <div className="flex items-start gap-3">
            <button
              type="button"
              onClick={onOpenMobileSidebar}
              className="mt-1 flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] lg:hidden cursor-pointer"
              aria-label="Open navigation"
            >
              <Menu className="h-4 w-4" />
            </button>
            <div>
              <p
                dir={calendarLocale === 'fa' ? 'rtl' : 'ltr'}
                className="text-xs font-medium text-[var(--accent)] tabular-nums"
              >
                {formatFullDate(todayKey, calendarLocale)}
              </p>
              <h1 className="font-display mt-1 text-2xl sm:text-3xl font-semibold tracking-tight text-[var(--text-primary)]">
                Workspace Home
              </h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onCreateNote}
              className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-4 py-2 text-xs font-medium text-white hover:bg-[var(--accent-hover)] transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <Plus className="h-3.5 w-3.5" />
              New Note
            </button>
            <button
              type="button"
              onClick={onOpenTodayJournal}
              className="flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3.5 py-2 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <Calendar className="h-3.5 w-3.5 text-[var(--accent)]" />
              Today&apos;s Journal
            </button>
            <button
              type="button"
              onClick={onQuickCreateTask}
              className="flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3.5 py-2 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <Plus className="h-3.5 w-3.5" />
              New Task
            </button>
          </div>
        </div>

        {/* Today's Journal Spotlight */}
        <section className="mt-7">
          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="text-lg">{todayJournal?.icon || '📔'}</span>
                <div>
                  <h2 className="font-display text-base font-semibold text-[var(--text-primary)]">
                    {todayJournal
                      ? todayJournal.title
                      : `Daily Journal — ${formatNumericDate(todayKey, calendarLocale)}`}
                  </h2>
                  <p className="text-xs text-[var(--text-muted)]">
                    {todayJournal
                      ? `Updated ${formatRelativeTime(todayJournal.updatedAt, calendarLocale)}${
                          todayJournal.journalMetadata?.mood
                            ? ` · Mood: ${todayJournal.journalMetadata.mood}`
                            : ''
                        }`
                      : 'Capture thoughts, plans, and moments from today'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onOpenTodayJournal}
                className="flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3.5 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-hover)] cursor-pointer whitespace-nowrap shrink-0"
              >
                {todayJournal ? 'Continue writing' : 'Open today’s page'}
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
            {todayJournal && (
              <p className="mt-3 text-sm leading-relaxed text-[var(--text-secondary)] line-clamp-2">
                {getPreviewSnippet(todayJournal.plainText, 210)}
              </p>
            )}
          </div>
        </section>

        {/* Two-column Tasks & Active Goals */}
        <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-2">
          {/* Today & Upcoming Tasks */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base font-semibold text-[var(--text-primary)]">
                Today&apos;s Focus & Upcoming Tasks
              </h2>
              <button
                type="button"
                onClick={() => onNavigateSection('tasks')}
                className="text-xs font-medium text-[var(--accent)] hover:underline cursor-pointer"
              >
                View all
              </button>
            </div>

            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] divide-y divide-[var(--border-subtle)]">
              {todayTasks.length === 0 && upcomingTasks.length === 0 ? (
                <div className="p-6 text-center">
                  <p className="text-sm text-[var(--text-secondary)]">No open tasks scheduled</p>
                  <button
                    type="button"
                    onClick={onQuickCreateTask}
                    className="mt-2 text-xs font-medium text-[var(--accent)] hover:underline cursor-pointer"
                  >
                    + Add a task
                  </button>
                </div>
              ) : (
                [...todayTasks, ...upcomingTasks].slice(0, 6).map((task) => {
                  const isOverdue = task.dueDate && task.dueDate < todayKey;
                  return (
                    <div
                      key={task.id}
                      className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-[var(--bg-hover)] transition-colors"
                    >
                      <button
                        type="button"
                        onClick={() => onToggleTask(task.id)}
                        className="flex min-w-0 flex-1 items-center gap-3 text-left cursor-pointer"
                      >
                        {task.status === 'done' ? (
                          <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--accent)]" />
                        ) : (
                          <Circle className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
                        )}
                        <span className="truncate text-sm text-[var(--text-primary)]">
                          {task.title}
                        </span>
                      </button>

                      <div className="flex items-center gap-2 shrink-0 text-xs tabular-nums">
                        {task.dueDate && (
                          <span
                            className={
                              isOverdue
                                ? 'text-red-500 font-medium'
                                : task.dueDate === todayKey
                                ? 'text-[var(--accent)] font-medium'
                                : 'text-[var(--text-muted)]'
                            }
                          >
                            {isOverdue
                              ? 'Overdue · '
                              : task.dueDate === todayKey
                              ? 'Today'
                              : formatShortDate(task.dueDate, calendarLocale)}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          {/* Active Goals */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base font-semibold text-[var(--text-primary)]">
                Active Goals
              </h2>
              <button
                type="button"
                onClick={() => onNavigateSection('goals')}
                className="text-xs font-medium text-[var(--accent)] hover:underline cursor-pointer"
              >
                Manage goals
              </button>
            </div>

            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] divide-y divide-[var(--border-subtle)]">
              {activeGoals.length === 0 ? (
                <div className="p-6 text-center">
                  <p className="text-sm text-[var(--text-secondary)]">No active goals yet</p>
                  <button
                    type="button"
                    onClick={() => onNavigateSection('goals')}
                    className="mt-2 text-xs font-medium text-[var(--accent)] hover:underline cursor-pointer"
                  >
                    + Create a goal
                  </button>
                </div>
              ) : (
                activeGoals.map((goal) => {
                  const pct = getGoalProgress(goal);
                  return (
                    <button
                      key={goal.id}
                      type="button"
                      onClick={() => onNavigateSection('goals')}
                      className="block w-full px-4 py-3.5 text-left hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-2 truncate text-sm font-medium text-[var(--text-primary)]">
                          <Target className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
                          <span className="truncate">{goal.title}</span>
                        </span>
                        <span className="font-mono-tabular text-xs text-[var(--text-secondary)]">
                          {pct}%
                        </span>
                      </div>
                      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--bg-secondary)]">
                        <div
                          style={{ width: `${pct}%` }}
                          className="h-full rounded-full bg-[var(--accent)]"
                        />
                      </div>
                      <div className="mt-1.5 flex items-center gap-2 text-[11px] text-[var(--text-muted)] tabular-nums">
                        <span>{goal.horizon === 'short_term' ? 'Short-term' : 'Long-term'}</span>
                        {goal.targetDate && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>Target {formatShortDate(goal.targetDate, calendarLocale)}</span>
                          </>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </section>
        </div>

        {/* Recently Edited Notes */}
        <section className="mt-8 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-semibold text-[var(--text-primary)]">
              Recently Edited
            </h2>
            <button
              type="button"
              onClick={() => onNavigateSection('all_notes')}
              className="text-xs font-medium text-[var(--accent)] hover:underline cursor-pointer"
            >
              Browse all notes
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {recentNotes.map((n) => {
              const folderLabel = getFolderName(n.parentFolderId);
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => onSelectNote(n.id)}
                  className="flex flex-col justify-between rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 text-left hover:border-[var(--border-strong)] transition-colors cursor-pointer"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-base leading-none">{n.icon || '📄'}</span>
                      <h3 className="truncate text-sm font-semibold text-[var(--text-primary)]">
                        {n.title || 'Untitled'}
                      </h3>
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-[var(--text-secondary)] line-clamp-2">
                      {getPreviewSnippet(n.plainText, 110)}
                    </p>
                  </div>
                  <div className="mt-3 flex items-center gap-1.5 text-[11px] text-[var(--text-muted)] tabular-nums">
                    <Clock className="h-3 w-3 shrink-0" />
                    <span>{formatRelativeTime(n.updatedAt, calendarLocale)}</span>
                    {folderLabel && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="truncate">{folderLabel}</span>
                      </>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
