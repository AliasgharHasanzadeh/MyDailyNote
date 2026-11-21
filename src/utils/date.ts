import type { CalendarLocale } from '../types/workspace';
import {
  JALALI_MONTHS,
  JALALI_WEEKDAYS_FULL,
  JALALI_WEEKDAYS_SHORT,
  jalaaliMonthLength,
  toGregorian,
  toJalaali,
  toPersianDigits,
} from './jalali';

export function toDateKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseDateKey(dateKey: string): Date {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function addDaysToKey(dateKey: string, delta: number): string {
  const dt = parseDateKey(dateKey);
  dt.setDate(dt.getDate() + delta);
  return toDateKey(dt);
}

function getDateParts(isoOrDateKey: string): { dt: Date; gy: number; gm: number; gd: number } | null {
  const dt = isoOrDateKey.length === 10 ? parseDateKey(isoOrDateKey) : new Date(isoOrDateKey);
  if (Number.isNaN(dt.getTime())) return null;
  return {
    dt,
    gy: dt.getFullYear(),
    gm: dt.getMonth() + 1,
    gd: dt.getDate(),
  };
}

export function formatFullDate(dateKey: string, locale: CalendarLocale = 'en'): string {
  const parts = getDateParts(dateKey);
  if (!parts) return '';
  if (locale === 'fa') {
    const { jy, jm, jd } = toJalaali(parts.gy, parts.gm, parts.gd);
    const weekday = JALALI_WEEKDAYS_FULL[parts.dt.getDay()];
    return `${weekday}، ${toPersianDigits(jd)} ${JALALI_MONTHS[jm - 1]} ${toPersianDigits(jy)}`;
  }
  return parts.dt.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatJournalTitle(dateKey: string, locale: CalendarLocale = 'en'): string {
  return formatFullDate(dateKey, locale);
}

export function buildAutoJournalTitle(
  dateKey: string,
  locale: CalendarLocale = 'en',
  entryNumber = 1
): string {
  const base = formatFullDate(dateKey, locale);
  if (entryNumber <= 1) return base;
  return locale === 'fa' ? `${base} (${toPersianDigits(entryNumber)})` : `${base} (${entryNumber})`;
}

export function isAutoJournalTitle(
  title: string,
  journalDate: string | null,
  isCustom?: boolean
): boolean {
  if (!journalDate || isCustom) return false;
  const trimmed = title.trim();
  if (!trimmed) return true;

  // Strip optional " (N)" / " (۲)" suffix when checking known auto-generated formats
  const stripped = trimmed.replace(/\s*\([^)]+\)\s*$/, '').trim();
  if (/^Daily Journal\s*[—-]\s*\d{4}-\d{2}-\d{2}$/.test(stripped)) return true;

  const dt = parseDateKey(journalDate);
  const shortEn = dt.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  const fullEn = formatFullDate(journalDate, 'en');
  const fullFa = formatFullDate(journalDate, 'fa');
  const { jy, jm, jd } = toJalaali(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
  const shortFa = `${toPersianDigits(jd)} ${JALALI_MONTHS[jm - 1]} ${toPersianDigits(jy)}`;

  return (
    stripped === shortEn ||
    stripped === fullEn ||
    stripped === fullFa ||
    stripped === shortFa
  );
}

export function formatShortDate(isoOrDateKey: string, locale: CalendarLocale = 'en'): string {
  const parts = getDateParts(isoOrDateKey);
  if (!parts) return '';
  if (locale === 'fa') {
    const { jy, jm, jd } = toJalaali(parts.gy, parts.gm, parts.gd);
    return `${toPersianDigits(jd)} ${JALALI_MONTHS[jm - 1]} ${toPersianDigits(jy)}`;
  }
  return parts.dt.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatCompactDate(isoOrDateKey: string, locale: CalendarLocale = 'en'): string {
  const parts = getDateParts(isoOrDateKey);
  if (!parts) return '';
  if (locale === 'fa') {
    const { jm, jd } = toJalaali(parts.gy, parts.gm, parts.gd);
    return `${toPersianDigits(jd)} ${JALALI_MONTHS[jm - 1]}`;
  }
  return parts.dt.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

export function formatNumericDate(dateKey: string, locale: CalendarLocale = 'en'): string {
  const parts = getDateParts(dateKey);
  if (!parts) return dateKey;
  if (locale === 'fa') {
    const { jy, jm, jd } = toJalaali(parts.gy, parts.gm, parts.gd);
    return toPersianDigits(`${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`);
  }
  return dateKey;
}

export function formatRelativeTime(isoString: string, locale: CalendarLocale = 'en'): string {
  const date = new Date(isoString);
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (locale === 'fa') {
    if (diffMin < 1) return 'لحظاتی پیش';
    if (diffMin < 60) return `${toPersianDigits(diffMin)} دقیقه پیش`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${toPersianDigits(diffHr)} ساعت پیش`;
    const diffDay = Math.floor(diffHr / 24);
    if (diffDay < 7) return `${toPersianDigits(diffDay)} روز پیش`;
    return formatCompactDate(isoString, 'fa');
  }
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return formatCompactDate(isoString, 'en');
}

export interface CalendarCell {
  dateKey: string;
  inMonth: boolean;
  displayDay: string;
}

export interface CalendarMonthGrid {
  monthLabel: string;
  weekdays: string[];
  cells: CalendarCell[];
  isRtl: boolean;
}

export function shiftCalendarMonth(
  cursorDateKey: string,
  deltaMonths: number,
  locale: CalendarLocale
): string {
  const dt = parseDateKey(cursorDateKey);
  if (locale === 'fa') {
    const { jy, jm } = toJalaali(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
    const totalMonths = jy * 12 + (jm - 1) + deltaMonths;
    const nextJy = Math.floor(totalMonths / 12);
    const nextJm = ((totalMonths % 12) + 12) % 12 + 1;
    const { gy, gm, gd } = toGregorian(nextJy, nextJm, 1);
    return toDateKey(new Date(gy, gm - 1, gd));
  }
  const next = new Date(dt.getFullYear(), dt.getMonth() + deltaMonths, 1);
  return toDateKey(next);
}

export function getCalendarMonthGrid(
  cursorDateKey: string,
  locale: CalendarLocale
): CalendarMonthGrid {
  const dt = parseDateKey(cursorDateKey);

  if (locale === 'fa') {
    const { jy, jm } = toJalaali(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
    const firstGreg = toGregorian(jy, jm, 1);
    const firstDate = new Date(firstGreg.gy, firstGreg.gm - 1, firstGreg.gd);
    // Saturday (6) -> index 0, Sunday (0) -> index 1, ..., Friday (5) -> index 6
    const startOffset = (firstDate.getDay() + 1) % 7;
    const monthLen = jalaaliMonthLength(jy, jm);
    const totalCells = startOffset + monthLen > 35 ? 42 : 35;

    const cells: CalendarCell[] = [];
    for (let i = 0; i < totalCells; i++) {
      const cellDate = new Date(
        firstDate.getFullYear(),
        firstDate.getMonth(),
        firstDate.getDate() + (i - startOffset)
      );
      const cellKey = toDateKey(cellDate);
      const jCell = toJalaali(
        cellDate.getFullYear(),
        cellDate.getMonth() + 1,
        cellDate.getDate()
      );
      cells.push({
        dateKey: cellKey,
        inMonth: jCell.jy === jy && jCell.jm === jm,
        displayDay: toPersianDigits(jCell.jd),
      });
    }

    return {
      monthLabel: `${JALALI_MONTHS[jm - 1]} ${toPersianDigits(jy)}`,
      weekdays: JALALI_WEEKDAYS_SHORT,
      cells,
      isRtl: true,
    };
  }

  // English Gregorian calendar
  const year = dt.getFullYear();
  const monthIndex = dt.getMonth();
  const firstDay = new Date(year, monthIndex, 1);
  const startWeekday = firstDay.getDay();
  const start = new Date(year, monthIndex, 1 - startWeekday);

  const cells: CalendarCell[] = [];
  for (let i = 0; i < 42; i++) {
    const cellDate = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    cells.push({
      dateKey: toDateKey(cellDate),
      inMonth: cellDate.getMonth() === monthIndex,
      displayDay: String(cellDate.getDate()),
    });
  }

  const monthLabel = firstDay.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  return {
    monthLabel,
    weekdays: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    cells,
    isRtl: false,
  };
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

export const TRASH_RETENTION_DAYS = 30;
export const TRASH_RETENTION_MS = TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000;

export function isTrashExpired(deletedAt?: string | null, nowMs = Date.now()): boolean {
  if (!deletedAt) return false;
  const deletedMs = Date.parse(deletedAt);
  if (Number.isNaN(deletedMs)) return false;
  return nowMs - deletedMs >= TRASH_RETENTION_MS;
}

export interface TrashRemainingInfo {
  remainingMs: number;
  daysLeft: number;
  urgency: 'normal' | 'soon' | 'critical';
  label: string;
}

export function getTrashRemainingInfo(
  deletedAt: string,
  locale: CalendarLocale = 'en',
  nowMs = Date.now()
): TrashRemainingInfo {
  const deletedMs = Date.parse(deletedAt);
  const expiresAt = Number.isNaN(deletedMs) ? nowMs : deletedMs + TRASH_RETENTION_MS;
  const remainingMs = Math.max(0, expiresAt - nowMs);
  const totalMinutes = Math.floor(remainingMs / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const mins = totalMinutes % 60;
  const daysLeft = Math.ceil(remainingMs / (24 * 60 * 60 * 1000));
  const urgency: TrashRemainingInfo['urgency'] =
    remainingMs <= 2 * 24 * 60 * 60 * 1000
      ? 'critical'
      : remainingMs <= 7 * 24 * 60 * 60 * 1000
      ? 'soon'
      : 'normal';

  if (remainingMs <= 0) {
    return {
      remainingMs: 0,
      daysLeft: 0,
      urgency: 'critical',
      label: locale === 'fa' ? 'در حال حذف خودکار' : 'Expiring soon',
    };
  }

  if (locale === 'fa') {
    if (days >= 1) {
      return {
        remainingMs,
        daysLeft,
        urgency,
        label:
          hours > 0
            ? `${toPersianDigits(days)} روز و ${toPersianDigits(hours)} ساعت مانده`
            : `${toPersianDigits(days)} روز مانده`,
      };
    }
    if (hours >= 1) {
      return {
        remainingMs,
        daysLeft,
        urgency,
        label:
          mins > 0
            ? `${toPersianDigits(hours)} ساعت و ${toPersianDigits(mins)} دقیقه مانده`
            : `${toPersianDigits(hours)} ساعت مانده`,
      };
    }
    return {
      remainingMs,
      daysLeft,
      urgency,
      label: `${toPersianDigits(Math.max(1, mins))} دقیقه مانده`,
    };
  }

  if (days >= 1) {
    return {
      remainingMs,
      daysLeft,
      urgency,
      label: hours > 0 ? `${days}d ${hours}h left` : `${days}d left`,
    };
  }
  if (hours >= 1) {
    return {
      remainingMs,
      daysLeft,
      urgency,
      label: mins > 0 ? `${hours}h ${mins}m left` : `${hours}h left`,
    };
  }
  return {
    remainingMs,
    daysLeft,
    urgency,
    label: `${Math.max(1, mins)}m left`,
  };
}

