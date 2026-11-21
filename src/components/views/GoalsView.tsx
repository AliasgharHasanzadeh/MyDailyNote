import {
  CheckCircle2,
  Circle,
  Edit3,
  ExternalLink,
  Menu,
  Plus,
  Target,
  Trash2,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { createId } from '../../db/storage';
import type { CalendarLocale, Goal, GoalHorizon, Note, Task } from '../../types/workspace';
import { formatShortDate, toDateKey } from '../../utils/date';

interface GoalsViewProps {
  goals: Goal[];
  notes: Note[];
  tasks: Task[];
  calendarLocale: CalendarLocale;
  onOpenMobileSidebar: () => void;
  onSaveGoal: (goal: Goal) => void;
  onDeleteGoal: (goalId: string) => void;
  onSelectNote: (noteId: string) => void;
  onToggleTask: (taskId: string) => void;
  onCreateTaskForGoal: (title: string, goalId: string) => void;
}

export function GoalsView({
  goals,
  notes,
  tasks,
  calendarLocale,
  onOpenMobileSidebar,
  onSaveGoal,
  onDeleteGoal,
  onSelectNote,
  onToggleTask,
  onCreateTaskForGoal,
}: GoalsViewProps) {
  const [horizonFilter, setHorizonFilter] = useState<'all' | GoalHorizon>('all');
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [newMilestoneText, setNewMilestoneText] = useState<Record<string, string>>({});
  const [newTaskText, setNewTaskText] = useState<Record<string, string>>({});
  const [noteLinkModalGoal, setNoteLinkModalGoal] = useState<Goal | null>(null);

  const filteredGoals = useMemo(() => {
    return goals.filter((g) => horizonFilter === 'all' || g.horizon === horizonFilter);
  }, [goals, horizonFilter]);

  const computeProgress = (goal: Goal) => {
    if (goal.progressMode === 'manual') return goal.manualProgress;
    const linkedTasks = tasks.filter((t) => t.linkedGoalId === goal.id);
    const total = goal.milestones.length + linkedTasks.length;
    if (total === 0) return goal.manualProgress;
    const done =
      goal.milestones.filter((m) => m.completed).length +
      linkedTasks.filter((t) => t.status === 'done').length;
    return Math.round((done / total) * 100);
  };

  const openNewGoal = () => {
    const now = new Date().toISOString();
    setEditingGoal({
      id: createId('goal'),
      title: '',
      description: '',
      horizon: 'short_term',
      targetDate: toDateKey(),
      progressMode: 'auto',
      manualProgress: 0,
      milestones: [],
      linkedNoteIds: [],
      status: 'active',
      createdAt: now,
      updatedAt: now,
    });
  };

  const toggleMilestone = (goal: Goal, milestoneId: string) => {
    const updatedMilestones = goal.milestones.map((m) =>
      m.id === milestoneId ? { ...m, completed: !m.completed } : m
    );
    onSaveGoal({
      ...goal,
      milestones: updatedMilestones,
      updatedAt: new Date().toISOString(),
    });
  };

  const addMilestone = (goal: Goal) => {
    const title = (newMilestoneText[goal.id] || '').trim();
    if (!title) return;
    onSaveGoal({
      ...goal,
      milestones: [...goal.milestones, { id: createId('ms'), title, completed: false }],
      updatedAt: new Date().toISOString(),
    });
    setNewMilestoneText((prev) => ({ ...prev, [goal.id]: '' }));
  };

  const toggleGoalNoteLink = (goal: Goal, noteId: string) => {
    const exists = goal.linkedNoteIds.includes(noteId);
    onSaveGoal({
      ...goal,
      linkedNoteIds: exists
        ? goal.linkedNoteIds.filter((id) => id !== noteId)
        : [...goal.linkedNoteIds, noteId],
      updatedAt: new Date().toISOString(),
    });
  };

  return (
    <div className="flex h-full flex-col bg-[var(--bg-canvas)] overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl px-6 py-8 sm:px-10">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--border-subtle)] pb-5">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onOpenMobileSidebar}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] lg:hidden cursor-pointer"
              aria-label="Open navigation"
            >
              <Menu className="h-4 w-4" />
            </button>
            <div>
              <h1 className="font-display text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
                Goals
              </h1>
              <p className="mt-0.5 text-xs text-[var(--text-muted)] tabular-nums">
                {goals.filter((g) => g.status === 'active').length} active ·{' '}
                {goals.filter((g) => g.status === 'completed').length} completed
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-0.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-0.5">
              {(
                [
                  { id: 'all', label: 'All' },
                  { id: 'short_term', label: 'Short-term' },
                  { id: 'long_term', label: 'Long-term' },
                ] as { id: 'all' | GoalHorizon; label: string }[]
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setHorizonFilter(tab.id)}
                  className={`rounded-md px-2.5 py-1.5 text-xs font-medium cursor-pointer whitespace-nowrap shrink-0 ${
                    horizonFilter === tab.id
                      ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)]'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={openNewGoal}
              className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3.5 py-2 text-xs font-medium text-white hover:bg-[var(--accent-hover)] cursor-pointer whitespace-nowrap shrink-0"
            >
              <Plus className="h-3.5 w-3.5" />
              New Goal
            </button>
          </div>
        </div>

        {/* Goals List */}
        <div className="mt-6 space-y-5">
          {filteredGoals.length === 0 ? (
            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-10 text-center">
              <p className="text-sm text-[var(--text-secondary)]">No goals added yet.</p>
              <button
                type="button"
                onClick={openNewGoal}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-4 py-2 text-xs font-medium text-white cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
                Create your first goal
              </button>
            </div>
          ) : (
            filteredGoals.map((goal) => {
              const pct = computeProgress(goal);
              const linkedTasks = tasks.filter((t) => t.linkedGoalId === goal.id);
              const linkedNotes = notes.filter(
                (n) => !n.isArchived && !n.deletedAt && goal.linkedNoteIds.includes(n.id)
              );

              return (
                <div
                  key={goal.id}
                  className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 sm:p-6"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)] tabular-nums">
                        <span className="font-medium text-[var(--accent)]">
                          {goal.horizon === 'short_term' ? 'Short-term' : 'Long-term'}
                        </span>
                        {goal.targetDate && <span>· Target {formatShortDate(goal.targetDate, calendarLocale)}</span>}
                        <span>· {goal.status === 'completed' ? 'Completed' : 'Active'}</span>
                      </div>
                      <h2 className="font-display mt-1 text-lg font-semibold text-[var(--text-primary)]">
                        {goal.title}
                      </h2>
                      {goal.description && (
                        <p className="mt-1.5 text-sm text-[var(--text-secondary)]">
                          {goal.description}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          onSaveGoal({
                            ...goal,
                            status: goal.status === 'completed' ? 'active' : 'completed',
                            updatedAt: new Date().toISOString(),
                          })
                        }
                        className="rounded-lg border border-[var(--border-subtle)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-hover)] cursor-pointer whitespace-nowrap"
                      >
                        {goal.status === 'completed' ? 'Reopen' : 'Mark complete'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingGoal({ ...goal })}
                        title="Edit goal"
                        className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] cursor-pointer"
                      >
                        <Edit3 className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteGoal(goal.id)}
                        title="Delete goal"
                        className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-red-500 cursor-pointer"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="mt-4">
                    <div className="mb-1.5 flex items-center justify-between text-xs">
                      <span className="text-[var(--text-muted)]">Progress</span>
                      <span className="font-mono-tabular font-medium text-[var(--text-primary)]">
                        {pct}%
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--bg-secondary)]">
                      <div
                        style={{ width: `${pct}%` }}
                        className="h-full rounded-full bg-[var(--accent)] transition-all duration-200"
                      />
                    </div>
                    {goal.progressMode === 'manual' && (
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={goal.manualProgress}
                        onChange={(e) =>
                          onSaveGoal({
                            ...goal,
                            manualProgress: Number(e.target.value),
                            updatedAt: new Date().toISOString(),
                          })
                        }
                        className="mt-2 h-1 w-full accent-[var(--accent)] cursor-pointer"
                      />
                    )}
                  </div>

                  {/* Breakdown: Milestones, Linked Tasks, Connected Notes */}
                  <div className="mt-5 grid grid-cols-1 gap-6 border-t border-[var(--border-subtle)] pt-4 lg:grid-cols-2">
                    {/* Milestones & Linked Tasks */}
                    <div className="space-y-2.5">
                      <h3 className="text-xs font-semibold text-[var(--text-secondary)]">
                        Milestones & Tasks
                      </h3>
                      <div className="space-y-1.5">
                        {goal.milestones.map((ms) => (
                          <div key={ms.id} className="flex items-center justify-between gap-2">
                            <button
                              type="button"
                              onClick={() => toggleMilestone(goal, ms.id)}
                              className="flex items-center gap-2 text-left text-xs cursor-pointer"
                            >
                              {ms.completed ? (
                                <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--accent)]" />
                              ) : (
                                <Circle className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
                              )}
                              <span
                                className={
                                  ms.completed
                                    ? 'line-through text-[var(--text-muted)]'
                                    : 'text-[var(--text-primary)]'
                                }
                              >
                                {ms.title}
                              </span>
                            </button>
                          </div>
                        ))}
                        {linkedTasks.map((t) => (
                          <div key={t.id} className="flex items-center justify-between gap-2">
                            <button
                              type="button"
                              onClick={() => onToggleTask(t.id)}
                              className="flex items-center gap-2 text-left text-xs cursor-pointer"
                            >
                              {t.status === 'done' ? (
                                <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--accent)]" />
                              ) : (
                                <Circle className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
                              )}
                              <span
                                className={
                                  t.status === 'done'
                                    ? 'line-through text-[var(--text-muted)]'
                                    : 'text-[var(--text-primary)]'
                                }
                              >
                                {t.title}
                              </span>
                            </button>
                            <span className="text-[10px] text-[var(--text-muted)]">Task</span>
                          </div>
                        ))}
                      </div>

                      <div className="flex flex-wrap gap-2 pt-1">
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            addMilestone(goal);
                          }}
                          className="flex flex-1 min-w-[160px] items-center gap-1"
                        >
                          <input
                            type="text"
                            value={newMilestoneText[goal.id] || ''}
                            onChange={(e) =>
                              setNewMilestoneText((prev) => ({
                                ...prev,
                                [goal.id]: e.target.value,
                              }))
                            }
                            placeholder="+ Add milestone..."
                            className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-2.5 py-1 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
                          />
                        </form>
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            const val = (newTaskText[goal.id] || '').trim();
                            if (!val) return;
                            onCreateTaskForGoal(val, goal.id);
                            setNewTaskText((prev) => ({ ...prev, [goal.id]: '' }));
                          }}
                          className="flex flex-1 min-w-[160px] items-center gap-1"
                        >
                          <input
                            type="text"
                            value={newTaskText[goal.id] || ''}
                            onChange={(e) =>
                              setNewTaskText((prev) => ({
                                ...prev,
                                [goal.id]: e.target.value,
                              }))
                            }
                            placeholder="+ Add linked task..."
                            className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-2.5 py-1 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
                          />
                        </form>
                      </div>
                    </div>

                    {/* Connected Notes & Journal Entries */}
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between">
                        <h3 className="text-xs font-semibold text-[var(--text-secondary)]">
                          Connected Notes & Journal Entries
                        </h3>
                        <button
                          type="button"
                          onClick={() => setNoteLinkModalGoal(goal)}
                          className="text-xs font-medium text-[var(--accent)] hover:underline cursor-pointer"
                        >
                          + Connect note
                        </button>
                      </div>
                      {linkedNotes.length === 0 ? (
                        <p className="text-xs text-[var(--text-muted)]">
                          No notes or journal entries connected yet.
                        </p>
                      ) : (
                        <div className="space-y-1.5">
                          {linkedNotes.map((n) => (
                            <div
                              key={n.id}
                              className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-1.5 text-xs"
                            >
                              <button
                                type="button"
                                onClick={() => onSelectNote(n.id)}
                                className="flex min-w-0 items-center gap-1.5 text-left font-medium text-[var(--text-primary)] hover:text-[var(--accent)] cursor-pointer"
                              >
                                <ExternalLink className="h-3 w-3 shrink-0 text-[var(--accent)]" />
                                <span className="truncate">
                                  {n.icon || '📄'} {n.title || 'Untitled'}
                                </span>
                              </button>
                              <button
                                type="button"
                                onClick={() => toggleGoalNoteLink(goal, n.id)}
                                className="text-[var(--text-muted)] hover:text-red-500 cursor-pointer"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Edit / Create Goal Modal */}
      {editingGoal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setEditingGoal(null)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              if (!editingGoal.title.trim()) return;
              onSaveGoal({
                ...editingGoal,
                title: editingGoal.title.trim(),
                updatedAt: new Date().toISOString(),
              });
              setEditingGoal(null);
            }}
            className="w-full max-w-md rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 shadow-[var(--shadow-popover)] space-y-4"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-[var(--accent)]" />
                <h3 className="font-display text-base font-semibold text-[var(--text-primary)]">
                  Goal Details
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingGoal(null)}
                className="text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3">
              <input
                type="text"
                autoFocus
                required
                value={editingGoal.title}
                onChange={(e) => setEditingGoal({ ...editingGoal, title: e.target.value })}
                placeholder="Goal title..."
                className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none"
              />
              <textarea
                rows={3}
                value={editingGoal.description}
                onChange={(e) =>
                  setEditingGoal({ ...editingGoal, description: e.target.value })
                }
                placeholder="Why does this goal matter?"
                className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-2 text-xs text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none"
              />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-[11px] text-[var(--text-muted)]">Horizon</label>
                  <select
                    value={editingGoal.horizon}
                    onChange={(e) =>
                      setEditingGoal({
                        ...editingGoal,
                        horizon: e.target.value as GoalHorizon,
                      })
                    }
                    className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-2.5 py-1.5 text-xs text-[var(--text-primary)]"
                  >
                    <option value="short_term">Short-term</option>
                    <option value="long_term">Long-term</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[11px] text-[var(--text-muted)]">
                    Target date
                  </label>
                  <input
                    type="date"
                    value={editingGoal.targetDate || ''}
                    onChange={(e) =>
                      setEditingGoal({ ...editingGoal, targetDate: e.target.value || null })
                    }
                    className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] tabular-nums"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-[11px] text-[var(--text-muted)]">
                  Progress Tracking
                </label>
                <select
                  value={editingGoal.progressMode}
                  onChange={(e) =>
                    setEditingGoal({
                      ...editingGoal,
                      progressMode: e.target.value as 'auto' | 'manual',
                    })
                  }
                  className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-2.5 py-1.5 text-xs text-[var(--text-primary)]"
                >
                  <option value="auto">Automatic (from milestones & linked tasks)</option>
                  <option value="manual">Manual slider</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingGoal(null)}
                className="rounded-lg px-3.5 py-2 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-[var(--accent)] px-4 py-2 text-xs font-medium text-white hover:bg-[var(--accent-hover)] cursor-pointer"
              >
                Save Goal
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Connect Note to Goal Modal */}
      {noteLinkModalGoal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setNoteLinkModalGoal(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 shadow-[var(--shadow-popover)]"
          >
            <h3 className="font-display text-sm font-semibold text-[var(--text-primary)] mb-3">
              Connect Notes to "{noteLinkModalGoal.title}"
            </h3>
            <div className="max-h-64 overflow-y-auto space-y-1">
              {notes
                .filter((n) => !n.isArchived && !n.deletedAt)
                .map((n) => {
                  const current = goals.find((g) => g.id === noteLinkModalGoal.id) || noteLinkModalGoal;
                  const linked = current.linkedNoteIds.includes(n.id);
                  return (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => toggleGoalNoteLink(current, n.id)}
                      className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs cursor-pointer ${
                        linked
                          ? 'bg-[var(--accent-soft)] text-[var(--text-primary)] font-medium'
                          : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                      }`}
                    >
                      <span className="truncate">
                        {n.icon || '📄'} {n.title || 'Untitled'}
                      </span>
                      {linked && <span className="text-[var(--accent)]">Connected</span>}
                    </button>
                  );
                })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
