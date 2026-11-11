/**
 * Timestamp formatting utilities for Eastern Time (America/New_York) and relative offsets.
 */

function parseDate(date: string | number | Date | null | undefined): Date | null {
  if (!date) return null;
  const parsed = typeof date === 'object' && date instanceof Date ? date : new Date(date);
  return isNaN(parsed.getTime()) ? null : parsed;
}

const EASTERN_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
  timeZoneName: 'short',
});

/**
 * Formats a date into America/New_York timezone (e.g., Aug 19, 2026, 9:31 PM EDT).
 */
export function formatEasternDateTime(date: string | number | Date | null | undefined): string {
  const parsed = parseDate(date);
  if (!parsed) return '-';
  return EASTERN_FORMATTER.format(parsed);
}

/**
 * Formats a date into a human-readable relative offset (e.g., just now, 18m ago, 2h ago, 3d ago).
 */
export function formatRelativeTime(date: string | number | Date | null | undefined): string {
  const parsed = parseDate(date);
  if (!parsed) return '';
  const now = Date.now();
  const diffMs = now - parsed.getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 45 && diffSec >= 0) return 'just now';
  if (diffSec < 0) return 'just now';

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;

  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;

  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) return `${diffMonths}mo ago`;

  const diffYears = Math.floor(diffDays / 365);
  return `${diffYears}y ago`;
}

/**
 * Combines absolute Eastern Time with a relative offset (e.g., Aug 19, 2026, 9:31 PM EDT (2h ago)).
 */
export function formatTimestampWithRelative(date: string | number | Date | null | undefined): string {
  const parsed = parseDate(date);
  if (!parsed) return '-';
  const eastern = formatEasternDateTime(parsed);
  const rel = formatRelativeTime(parsed);
  return rel ? `${eastern} (${rel})` : eastern;
}
