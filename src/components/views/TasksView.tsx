import {
  AlertCircle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  CheckCircle2,
  Circle,
  Edit3,
  ExternalLink,
  Kanban,
  List,
  Menu,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { createId } from '../../db/storage';
import type {
  CalendarLocale,
  Folder,
  Goal,
  Note,
  Task,
  TaskPriority,
  TaskStatus,
  TaskViewMode,
} from '../../types/workspace';
import { formatShortDate, toDateKey } from '../../utils/date';

interface TasksViewProps {
  tasks: Task[];
  folders: Folder[];
  notes: Note[];
  goals: Goal[];
  viewMode: TaskViewMode;
  calendarLocale: CalendarLocale;
  onChangeViewMode: (mode: TaskViewMode) => void;
  onOpenMobileSidebar: () => void;
  onSaveTask: (task: Task) => void;
  onDeleteTask: (taskId: string) => void;
  onSelectNote: (noteId: string) => void;
  externalCreateTrigger?: number;
}

type TaskFilter = 'all' | 'today' | 'upcoming' | 'overdue' | 'completed';

export function TasksView({
  tasks,
  folders,
  notes,
  goals,
  viewMode,
  calendarLocale,
  onChangeViewMode,
  onOpenMobileSidebar,
  onSaveTask,
  onDeleteTask,
  onSelectNote,
}: TasksViewProps) {
  const todayKey = toDateKey();
  const [filter, setFilter] = useState<TaskFilter>('all');
  const [groupFilter, setGroupFilter] = useState<string>('all');
  const [query, setQuery] = useState('');
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);

  const openNewModal = (defaultStatus: TaskStatus = 'todo') => {
    const now = new Date().toISOString();
    setEditingTask({
      id: createId('task'),
      title: '',
      description: '',
      status: defaultStatus,
      priority: 'medium',
      dueDate: todayKey,
      folderId: groupFilter !== 'all' ? groupFilter : null,
      linkedNoteId: null,
      linkedGoalId: null,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
    });
    setModalOpen(true);
  };

  const openEditModal = (task: Task) => {
    setEditingTask({ ...task });
    setModalOpen(true);
  };

  const filteredTasks = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tasks
      .filter((t) => {
        if (groupFilter !== 'all' && t.folderId !== groupFilter) return false;
        if (filter === 'today' && (t.status === 'done' || t.dueDate !== todayKey)) return false;
        if (filter === 'upcoming' && (t.status === 'done' || !t.dueDate || t.dueDate <= todayKey))
          return false;
        if (filter === 'overdue' && (t.status === 'done' || !t.dueDate || t.dueDate >= todayKey))
          return false;
        if (filter === 'completed' && t.status !== 'done') return false;
        if (q) {
          return (
            t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)
          );
        }
        return true;
      })
      .sort((a, b) => {
        if (a.status === 'done' && b.status !== 'done') return 1;
        if (a.status !== 'done' && b.status === 'done') return -1;
        const pOrder = { high: 0, medium: 1, low: 2 };
        if (pOrder[a.priority] !== pOrder[b.priority]) {
          return pOrder[a.priority] - pOrder[b.priority];
        }
        return (a.dueDate || '9999-99-99').localeCompare(b.dueDate || '9999-99-99');
      });
  }, [tasks, filter, groupFilter, query, todayKey]);

  const toggleStatus = (task: Task) => {
    const nextStatus: TaskStatus = task.status === 'done' ? 'todo' : 'done';
    onSaveTask({
      ...task,
      status: nextStatus,
      completedAt: nextStatus === 'done' ? new Date().toISOString() : null,
      updatedAt: new Date().toISOString(),
    });
  };

  const moveTaskStatus = (task: Task, nextStatus: TaskStatus) => {
    onSaveTask({
      ...task,
      status: nextStatus,
      completedAt: nextStatus === 'done' ? new Date().toISOString() : null,
      updatedAt: new Date().toISOString(),
    });
  };

  const getFolderLabel = (id: string | null) => {
    if (!id) return null;
    const f = folders.find((item) => item.id === id);
    return f ? `${f.icon} ${f.name}` : null;
  };

  const getLinkedNote = (id: string | null) => {
    if (!id) return null;
    return notes.find((n) => n.id === id) || null;
  };

  const columns: { id: TaskStatus; label: string }[] = [
    { id: 'todo', label: 'To Do' },
    { id: 'in_progress', label: 'In Progress' },
    { id: 'done', label: 'Done' },
  ];

  return (
    <div className="flex h-full flex-col bg-[var(--bg-canvas)] overflow-y-auto">
      <div className="mx-auto w-full max-w-6xl px-6 py-8 sm:px-10">
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
                Tasks
              </h1>
              <p className="mt-0.5 text-xs text-[var(--text-muted)] tabular-nums">
                {tasks.filter((t) => t.status !== 'done').length} open ·{' '}
                {tasks.filter((t) => t.status === 'done').length} completed
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-0.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-0.5">
              <button
                type="button"
                onClick={() => onChangeViewMode('list')}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium cursor-pointer whitespace-nowrap shrink-0 ${
                  viewMode === 'list'
                    ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)]'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                <List className="h-3.5 w-3.5" />
                List
              </button>
              <button
                type="button"
                onClick={() => onChangeViewMode('kanban')}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium cursor-pointer whitespace-nowrap shrink-0 ${
                  viewMode === 'kanban'
                    ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)]'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                <Kanban className="h-3.5 w-3.5" />
                Board
              </button>
            </div>

            <button
              type="button"
              onClick={() => openNewModal('todo')}
              className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3.5 py-2 text-xs font-medium text-white hover:bg-[var(--accent-hover)] cursor-pointer whitespace-nowrap shrink-0"
            >
              <Plus className="h-3.5 w-3.5" />
              New Task
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-1">
            {(
              [
                { id: 'all', label: 'All' },
                { id: 'today', label: 'Today' },
                { id: 'upcoming', label: 'Upcoming' },
                { id: 'overdue', label: 'Overdue' },
                { id: 'completed', label: 'Completed' },
              ] as { id: TaskFilter; label: string }[]
            ).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  filter === f.id
                    ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)]'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-1.5">
              <Search className="h-3.5 w-3.5 text-[var(--text-muted)]" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search tasks..."
                className="w-40 bg-transparent text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
              />
            </div>

            <select
              value={groupFilter}
              onChange={(e) => setGroupFilter(e.target.value)}
              className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] focus:outline-none"
            >
              <option value="all">All groups</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.icon} {f.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* List View vs Kanban Board */}
        <div className="mt-6">
          {viewMode === 'list' ? (
            filteredTasks.length === 0 ? (
              <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-10 text-center">
                <p className="text-sm text-[var(--text-secondary)]">No tasks in this filter.</p>
                <button
                  type="button"
                  onClick={() => openNewModal('todo')}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-4 py-2 text-xs font-medium text-white cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Create task
                </button>
              </div>
            ) : (
              <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] divide-y divide-[var(--border-subtle)]">
                {filteredTasks.map((task) => {
                  const isOverdue =
                    task.status !== 'done' && Boolean(task.dueDate && task.dueDate < todayKey);
                  const folderName = getFolderLabel(task.folderId);
                  const linkedNote = getLinkedNote(task.linkedNoteId);
                  return (
                    <div
                      key={task.id}
                      className="group flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-[var(--bg-hover)] transition-colors"
                    >
                      <div className="flex min-w-0 flex-1 items-start gap-3">
                        <button
                          type="button"
                          onClick={() => toggleStatus(task)}
                          className="mt-0.5 shrink-0 cursor-pointer"
                          aria-label={task.status === 'done' ? 'Mark incomplete' : 'Mark complete'}
                        >
                          {task.status === 'done' ? (
                            <CheckCircle2 className="h-4.5 w-4.5 text-[var(--accent)]" />
                          ) : (
                            <Circle className="h-4.5 w-4.5 text-[var(--text-muted)] hover:text-[var(--accent)]" />
                          )}
                        </button>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`text-sm font-medium ${
                                task.status === 'done'
                                  ? 'line-through text-[var(--text-muted)]'
                                  : 'text-[var(--text-primary)]'
                              }`}
                            >
                              {task.title}
                            </span>
                            {task.status === 'in_progress' && (
                              <span className="text-[11px] font-medium text-[var(--accent)]">
                                · In Progress
                              </span>
                            )}
                          </div>
                          {task.description && (
                            <p className="mt-0.5 text-xs text-[var(--text-secondary)] line-clamp-1">
                              {task.description}
                            </p>
                          )}
                          <div className="mt-1 flex flex-wrap items-center gap-2.5 text-[11px] text-[var(--text-muted)] tabular-nums">
                            <PriorityLabel priority={task.priority} />
                            {task.dueDate && (
                              <span className={isOverdue ? 'text-red-500 font-medium' : ''}>
                                · {isOverdue ? 'Overdue ' : ''}
                                {formatShortDate(task.dueDate, calendarLocale)}
                              </span>
                            )}
                            {folderName && <span>· {folderName}</span>}
                            {linkedNote && (
                              <button
                                type="button"
                                onClick={() => onSelectNote(linkedNote.id)}
                                className="inline-flex items-center gap-1 text-[var(--accent)] hover:underline cursor-pointer"
                              >
                                <ExternalLink className="h-3 w-3" />
                                {linkedNote.title || 'Linked note'}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => openEditModal(task)}
                          title="Edit task"
                          className="rounded-md p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] cursor-pointer"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteTask(task.id)}
                          title="Delete task"
                          className="rounded-md p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-red-500 cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {columns.map((col) => {
                const colTasks = filteredTasks.filter((t) => t.status === col.id);
                return (
                  <div
                    key={col.id}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      if (!dragTaskId) return;
                      const found = tasks.find((t) => t.id === dragTaskId);
                      if (found && found.status !== col.id) {
                        moveTaskStatus(found, col.id);
                      }
                      setDragTaskId(null);
                    }}
                    className="flex min-h-[380px] flex-col rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3.5"
                  >
                    <div className="mb-3 flex items-center justify-between px-1">
                      <div className="flex items-center gap-2">
                        <h2 className="font-display text-sm font-semibold text-[var(--text-primary)]">
                          {col.label}
                        </h2>
                        <span className="font-mono-tabular text-xs text-[var(--text-muted)]">
                          {colTasks.length}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => openNewModal(col.id)}
                        title={`Add task to ${col.label}`}
                        className="rounded-md p-1 text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] cursor-pointer"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <div className="flex-1 space-y-2.5">
                      {colTasks.map((task) => {
                        const isOverdue =
                          task.status !== 'done' &&
                          Boolean(task.dueDate && task.dueDate < todayKey);
                        const linkedNote = getLinkedNote(task.linkedNoteId);
                        return (
                          <div
                            key={task.id}
                            draggable
                            onDragStart={() => setDragTaskId(task.id)}
                            className="group rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-3.5 hover:border-[var(--border-strong)] transition-colors cursor-grab active:cursor-grabbing"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <button
                                type="button"
                                onClick={() => openEditModal(task)}
                                className={`text-left text-sm font-medium cursor-pointer ${
                                  task.status === 'done'
                                    ? 'line-through text-[var(--text-muted)]'
                                    : 'text-[var(--text-primary)]'
                                }`}
                              >
                                {task.title}
                              </button>
                              <button
                                type="button"
                                onClick={() => onDeleteTask(task.id)}
                                className="opacity-0 group-hover:opacity-100 text-[var(--text-muted)] hover:text-red-500 cursor-pointer"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>

                            {task.description && (
                              <p className="mt-1 text-xs text-[var(--text-secondary)] line-clamp-2">
                                {task.description}
                              </p>
                            )}

                            <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--text-muted)] tabular-nums">
                              <div className="flex items-center gap-2">
                                <PriorityLabel priority={task.priority} />
                                {task.dueDate && (
                                  <span className={isOverdue ? 'text-red-500 font-medium' : ''}>
                                    · {formatShortDate(task.dueDate, calendarLocale)}
                                  </span>
                                )}
                              </div>
                              {linkedNote && (
                                <button
                                  type="button"
                                  onClick={() => onSelectNote(linkedNote.id)}
                                  className="inline-flex items-center gap-1 text-[var(--accent)] hover:underline cursor-pointer"
                                >
                                  <ExternalLink className="h-3 w-3" />
                                  Note
                                </button>
                              )}
                            </div>

                            {/* Quick status move controls */}
                            <div className="mt-2.5 flex items-center gap-1 border-t border-[var(--border-subtle)] pt-2">
                              {columns
                                .filter((c) => c.id !== col.id)
                                .map((target) => (
                                  <button
                                    key={target.id}
                                    type="button"
                                    onClick={() => moveTaskStatus(task, target.id)}
                                    className="rounded px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] cursor-pointer"
                                  >
                                    Move to {target.label}
                                  </button>
                                ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Create / Edit Task Modal */}
      {modalOpen && editingTask && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setModalOpen(false)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              if (!editingTask.title.trim()) return;
              onSaveTask({
                ...editingTask,
                title: editingTask.title.trim(),
                updatedAt: new Date().toISOString(),
              });
              setModalOpen(false);
            }}
            className="w-full max-w-lg rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 shadow-[var(--shadow-popover)] space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-semibold text-[var(--text-primary)]">
                Task Details
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
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
                value={editingTask.title}
                onChange={(e) => setEditingTask({ ...editingTask, title: e.target.value })}
                placeholder="Task title..."
                className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none"
              />

              <textarea
                rows={3}
                value={editingTask.description}
                onChange={(e) =>
                  setEditingTask({ ...editingTask, description: e.target.value })
                }
                placeholder="Notes or description..."
                className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-2 text-xs text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none"
              />

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-[11px] text-[var(--text-muted)]">Status</label>
                  <select
                    value={editingTask.status}
                    onChange={(e) =>
                      setEditingTask({ ...editingTask, status: e.target.value as TaskStatus })
                    }
                    className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-2.5 py-1.5 text-xs text-[var(--text-primary)]"
                  >
                    <option value="todo">To Do</option>
                    <option value="in_progress">In Progress</option>
                    <option value="done">Done</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-[11px] text-[var(--text-muted)]">
                    Priority
                  </label>
                  <select
                    value={editingTask.priority}
                    onChange={(e) =>
                      setEditingTask({
                        ...editingTask,
                        priority: e.target.value as TaskPriority,
                      })
                    }
                    className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-2.5 py-1.5 text-xs text-[var(--text-primary)]"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-[11px] text-[var(--text-muted)]">
                    Due date
                  </label>
                  <input
                    type="date"
                    value={editingTask.dueDate || ''}
                    onChange={(e) =>
                      setEditingTask({ ...editingTask, dueDate: e.target.value || null })
                    }
                    className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] tabular-nums"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-[11px] text-[var(--text-muted)]">Group</label>
                  <select
                    value={editingTask.folderId || ''}
                    onChange={(e) =>
                      setEditingTask({ ...editingTask, folderId: e.target.value || null })
                    }
                    className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-2.5 py-1.5 text-xs text-[var(--text-primary)]"
                  >
                    <option value="">None</option>
                    {folders.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.icon} {f.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-[11px] text-[var(--text-muted)]">
                    Linked Note
                  </label>
                  <select
                    value={editingTask.linkedNoteId || ''}
                    onChange={(e) =>
                      setEditingTask({ ...editingTask, linkedNoteId: e.target.value || null })
                    }
                    className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-2.5 py-1.5 text-xs text-[var(--text-primary)]"
                  >
                    <option value="">None</option>
                    {notes
                      .filter((n) => !n.isArchived && !n.deletedAt)
                      .map((n) => (
                        <option key={n.id} value={n.id}>
                          {n.icon || '📄'} {n.title || 'Untitled'}
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-[11px] text-[var(--text-muted)]">
                    Linked Goal
                  </label>
                  <select
                    value={editingTask.linkedGoalId || ''}
                    onChange={(e) =>
                      setEditingTask({ ...editingTask, linkedGoalId: e.target.value || null })
                    }
                    className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-2.5 py-1.5 text-xs text-[var(--text-primary)]"
                  >
                    <option value="">None</option>
                    {goals.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.title}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-lg px-3.5 py-2 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-[var(--accent)] px-4 py-2 text-xs font-medium text-white hover:bg-[var(--accent-hover)] cursor-pointer"
              >
                Save Task
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function PriorityLabel({ priority }: { priority: TaskPriority }) {
  if (priority === 'high') {
    return (
      <span className="inline-flex items-center gap-1 text-red-500 font-medium">
        <AlertCircle className="h-3 w-3" />
        High
      </span>
    );
  }
  if (priority === 'medium') {
    return (
      <span className="inline-flex items-center gap-1 text-amber-500">
        <ArrowRight className="h-3 w-3" />
        Medium
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[var(--text-muted)]">
      <ArrowDown className="h-3 w-3" />
      Low
    </span>
  );
}
