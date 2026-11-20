import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  List,
  Menu,
  Plus,
  Search,
  Star,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import type { CalendarLocale, JournalViewMode, Note } from '../../types/workspace';
import { MOOD_OPTIONS } from '../../types/workspace';
import {
  formatFullDate,
  formatJournalTitle,
  formatNumericDate,
  getCalendarMonthGrid,
  shiftCalendarMonth,
  toDateKey,
} from '../../utils/date';
import { getPreviewSnippet } from '../../utils/tiptap';

interface JournalViewProps {
  notes: Note[];
  viewMode: JournalViewMode;
  calendarLocale: CalendarLocale;
  onChangeViewMode: (mode: JournalViewMode) => void;
  onChangeCalendarLocale: (locale: CalendarLocale) => void;
  onOpenMobileSidebar: () => void;
  onOpenJournalDate: (dateKey: string, createAdditional?: boolean) => void;
  onSelectNote: (noteId: string) => void;
  onUpdateNote: (note: Note) => void;
}

export function JournalView({
  notes,
  viewMode,
  calendarLocale,
  onChangeViewMode,
  onChangeCalendarLocale,
  onOpenMobileSidebar,
  onOpenJournalDate,
  onSelectNote,
  onUpdateNote,
}: JournalViewProps) {
  const todayKey = toDateKey();

  const [cursorDateKey, setCursorDateKey] = useState(todayKey);
  const [selectedDateKey, setSelectedDateKey] = useState(todayKey);
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState('');

  const journalNotes = useMemo(
    () =>
      notes
        .filter((n) => !n.isArchived && Boolean(n.journalDate))
        .sort((a, b) => (b.journalDate || '').localeCompare(a.journalDate || '')),
    [notes]
  );

  const entriesByDate = useMemo(() => {
    const map = new Map<string, Note[]>();
    for (const n of journalNotes) {
      if (!n.journalDate) continue;
      const list = map.get(n.journalDate) || [];
      list.push(n);
      map.set(n.journalDate, list);
    }
    return map;
  }, [journalNotes]);

  const filteredJournalNotes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return journalNotes.filter((n) => {
      if (dateFilter && n.journalDate !== dateFilter) return false;
      if (!q) return true;
      return (
        n.title.toLowerCase().includes(q) ||
        n.plainText.toLowerCase().includes(q) ||
        n.tags.some((t) => t.toLowerCase().includes(q)) ||
        (n.journalMetadata?.mood || '').toLowerCase().includes(q)
      );
    });
  }, [journalNotes, searchQuery, dateFilter]);

  const monthGrid = useMemo(
    () => getCalendarMonthGrid(cursorDateKey, calendarLocale),
    [cursorDateKey, calendarLocale]
  );

  const prevMonth = () => {
    setCursorDateKey((prev) => shiftCalendarMonth(prev, -1, calendarLocale));
  };

  const nextMonth = () => {
    setCursorDateKey((prev) => shiftCalendarMonth(prev, 1, calendarLocale));
  };

  const jumpToToday = () => {
    setCursorDateKey(todayKey);
    setSelectedDateKey(todayKey);
  };

  const selectedEntries = entriesByDate.get(selectedDateKey) || [];

  const getMoodEmoji = (mood?: string) =>
    MOOD_OPTIONS.find((m) => m.value === mood)?.emoji || '💭';

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
                Daily Journal
              </h1>
              <p className="mt-0.5 text-xs text-[var(--text-muted)] tabular-nums">
                {journalNotes.length} {journalNotes.length === 1 ? 'entry' : 'entries'} recorded
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Quick English / Persian Calendar Switch */}
            <div className="flex items-center gap-0.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-0.5">
              <button
                type="button"
                onClick={() => onChangeCalendarLocale('en')}
                className={`rounded-md px-2.5 py-1.5 text-xs font-medium cursor-pointer whitespace-nowrap shrink-0 ${
                  calendarLocale === 'en'
                    ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)]'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                EN
              </button>
              <button
                type="button"
                onClick={() => onChangeCalendarLocale('fa')}
                className={`rounded-md px-2.5 py-1.5 text-xs font-medium cursor-pointer whitespace-nowrap shrink-0 ${
                  calendarLocale === 'fa'
                    ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)]'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                فارسی
              </button>
            </div>

            <div className="flex items-center gap-0.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-0.5">
              <button
                type="button"
                onClick={() => onChangeViewMode('calendar')}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium cursor-pointer whitespace-nowrap shrink-0 ${
                  viewMode === 'calendar'
                    ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)]'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                <CalendarIcon className="h-3.5 w-3.5" />
                Calendar
              </button>
              <button
                type="button"
                onClick={() => onChangeViewMode('timeline')}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium cursor-pointer whitespace-nowrap shrink-0 ${
                  viewMode === 'timeline'
                    ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)]'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                <Clock className="h-3.5 w-3.5" />
                Timeline
              </button>
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
            </div>

            <button
              type="button"
              onClick={() => onOpenJournalDate(todayKey)}
              className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3.5 py-2 text-xs font-medium text-white hover:bg-[var(--accent-hover)] cursor-pointer whitespace-nowrap shrink-0"
            >
              <Plus className="h-3.5 w-3.5" />
              Today&apos;s Entry
            </button>
          </div>
        </div>

        {viewMode === 'calendar' ? (
          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Monthly Calendar (Gregorian or Jalali) */}
            <div className="lg:col-span-7 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2
                  dir={monthGrid.isRtl ? 'rtl' : 'ltr'}
                  className="font-display text-base font-semibold text-[var(--text-primary)]"
                >
                  {monthGrid.monthLabel}
                </h2>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={jumpToToday}
                    className="rounded-md px-2.5 py-1 text-xs font-medium text-[var(--accent)] hover:bg-[var(--accent-soft)] cursor-pointer"
                  >
                    {calendarLocale === 'fa' ? 'امروز' : 'Today'}
                  </button>
                  <button
                    type="button"
                    onClick={prevMonth}
                    className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] cursor-pointer"
                    title="Previous month"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={nextMonth}
                    className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] cursor-pointer"
                    title="Next month"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div
                dir={monthGrid.isRtl ? 'rtl' : 'ltr'}
                className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-[var(--text-muted)] pb-2"
              >
                {monthGrid.weekdays.map((d) => (
                  <div key={d} className="py-1">
                    {d}
                  </div>
                ))}
              </div>

              <div
                dir={monthGrid.isRtl ? 'rtl' : 'ltr'}
                className="grid grid-cols-7 gap-1"
              >
                {monthGrid.cells.map((cell) => {
                  const hasEntries = entriesByDate.has(cell.dateKey);
                  const isToday = cell.dateKey === todayKey;
                  const isSelected = cell.dateKey === selectedDateKey;
                  return (
                    <button
                      key={cell.dateKey}
                      type="button"
                      onClick={() => setSelectedDateKey(cell.dateKey)}
                      onDoubleClick={() => onOpenJournalDate(cell.dateKey)}
                      className={`relative flex h-12 flex-col items-center justify-center rounded-xl text-xs tabular-nums transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-[var(--accent)] text-white font-semibold'
                          : isToday
                          ? 'bg-[var(--accent-soft)] text-[var(--accent)] font-semibold'
                          : cell.inMonth
                          ? 'text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
                          : 'text-[var(--text-muted)]/50 hover:bg-[var(--bg-hover)]'
                      }`}
                    >
                      <span>{cell.displayDay}</span>
                      {hasEntries && (
                        <span
                          className={`mt-1 h-1 w-1 rounded-full ${
                            isSelected ? 'bg-white' : 'bg-[var(--accent)]'
                          }`}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Selected Date Detail Panel */}
            <div className="lg:col-span-5 flex flex-col justify-between rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5">
              <div>
                <p
                  dir={calendarLocale === 'fa' ? 'rtl' : 'ltr'}
                  className="text-xs font-medium text-[var(--accent)] tabular-nums"
                >
                  {formatFullDate(selectedDateKey, calendarLocale)}
                </p>
                <h3 className="font-display mt-1 text-lg font-semibold text-[var(--text-primary)]">
                  {selectedEntries.length > 0
                    ? `${selectedEntries.length} ${selectedEntries.length === 1 ? 'Entry' : 'Entries'}`
                    : 'No entry for this date'}
                </h3>

                {selectedEntries.length > 0 ? (
                  <div className="mt-4 space-y-3">
                    {selectedEntries.map((entry) => (
                      <div
                        key={entry.id}
                        className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-3.5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => onSelectNote(entry.id)}
                            className="text-left text-sm font-semibold text-[var(--text-primary)] hover:text-[var(--accent)] cursor-pointer"
                          >
                            {entry.icon || '📔'}{' '}
                            {entry.title || formatJournalTitle(selectedDateKey, calendarLocale)}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              onUpdateNote({ ...entry, isFavorite: !entry.isFavorite })
                            }
                            className={`cursor-pointer ${
                              entry.isFavorite ? 'text-amber-400' : 'text-[var(--text-muted)]'
                            }`}
                          >
                            <Star
                              className={`h-3.5 w-3.5 ${entry.isFavorite ? 'fill-amber-400' : ''}`}
                            />
                          </button>
                        </div>
                        {entry.journalMetadata?.mood && (
                          <p className="mt-1 text-xs text-[var(--text-muted)]">
                            {getMoodEmoji(entry.journalMetadata.mood)} {entry.journalMetadata.mood}
                            {entry.journalMetadata.rating
                              ? ` · Rating ${entry.journalMetadata.rating}/5`
                              : ''}
                          </p>
                        )}
                        <p className="mt-2 text-xs leading-relaxed text-[var(--text-secondary)] line-clamp-3">
                          {getPreviewSnippet(entry.plainText, 140)}
                        </p>
                        <button
                          type="button"
                          onClick={() => onSelectNote(entry.id)}
                          className="mt-3 text-xs font-medium text-[var(--accent)] hover:underline cursor-pointer"
                        >
                          Open in editor →
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-xs leading-relaxed text-[var(--text-secondary)]">
                    Start writing freely for this date. You can add thoughts, checklists, photos,
                    audio recordings, and reflections.
                  </p>
                )}
              </div>

              <div className="mt-6 flex flex-col gap-2 border-t border-[var(--border-subtle)] pt-4">
                {selectedEntries.length === 0 ? (
                  <button
                    type="button"
                    onClick={() => onOpenJournalDate(selectedDateKey)}
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-[var(--accent)] px-4 py-2 text-xs font-medium text-white hover:bg-[var(--accent-hover)] cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Create entry for {formatJournalTitle(selectedDateKey, calendarLocale)}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onOpenJournalDate(selectedDateKey, true)}
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-4 py-2 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-hover)] cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Create additional entry for this date
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-6 space-y-5">
            {/* Search & Date Filter for Timeline / List */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2">
                <Search className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search journal entries..."
                  className="w-full bg-transparent text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
                />
              </div>
              <input
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 text-xs text-[var(--text-primary)] tabular-nums"
              />
              {dateFilter && (
                <button
                  type="button"
                  onClick={() => setDateFilter('')}
                  className="text-xs font-medium text-[var(--accent)] hover:underline cursor-pointer"
                >
                  Clear date
                </button>
              )}
            </div>

            {filteredJournalNotes.length === 0 ? (
              <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-10 text-center">
                <p className="text-sm text-[var(--text-secondary)]">No matching journal entries.</p>
              </div>
            ) : viewMode === 'timeline' ? (
              <div className="space-y-4">
                {filteredJournalNotes.map((entry) => (
                  <div
                    key={entry.id}
                    className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 hover:border-[var(--border-strong)] transition-colors"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div
                        dir={calendarLocale === 'fa' ? 'rtl' : 'ltr'}
                        className="flex items-center gap-2 text-xs text-[var(--accent)] font-medium tabular-nums"
                      >
                        <span>{formatFullDate(entry.journalDate!, calendarLocale)}</span>
                        {entry.journalMetadata?.mood && (
                          <span className="text-[var(--text-muted)] font-normal">
                            · {getMoodEmoji(entry.journalMetadata.mood)} {entry.journalMetadata.mood}
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateNote({ ...entry, isFavorite: !entry.isFavorite })
                        }
                        className={`cursor-pointer ${
                          entry.isFavorite ? 'text-amber-400' : 'text-[var(--text-muted)]'
                        }`}
                      >
                        <Star
                          className={`h-3.5 w-3.5 ${entry.isFavorite ? 'fill-amber-400' : ''}`}
                        />
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => onSelectNote(entry.id)}
                      className="mt-2 block text-left cursor-pointer"
                    >
                      <h3 className="font-display text-lg font-semibold text-[var(--text-primary)] hover:text-[var(--accent)] transition-colors">
                        {entry.icon || '📔'} {entry.title || 'Untitled'}
                      </h3>
                      <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)] line-clamp-3">
                        {getPreviewSnippet(entry.plainText, 240)}
                      </p>
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] divide-y divide-[var(--border-subtle)]">
                {filteredJournalNotes.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-[var(--bg-hover)] transition-colors"
                  >
                    <button
                      type="button"
                      onClick={() => onSelectNote(entry.id)}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left cursor-pointer"
                    >
                      <span className="font-mono-tabular shrink-0 text-xs text-[var(--accent)]">
                        {formatNumericDate(entry.journalDate!, calendarLocale)}
                      </span>
                      <span className="truncate text-sm font-medium text-[var(--text-primary)]">
                        {entry.icon || '📔'} {entry.title || 'Untitled'}
                      </span>
                      <span className="hidden md:inline truncate text-xs text-[var(--text-muted)]">
                        — {getPreviewSnippet(entry.plainText, 75)}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateNote({ ...entry, isFavorite: !entry.isFavorite })
                      }
                      className={`shrink-0 cursor-pointer ${
                        entry.isFavorite ? 'text-amber-400' : 'text-[var(--text-muted)]'
                      }`}
                    >
                      <Star
                        className={`h-3.5 w-3.5 ${entry.isFavorite ? 'fill-amber-400' : ''}`}
                      />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
