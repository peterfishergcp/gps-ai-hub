import React, { useMemo, useState } from 'react';
import {
  Activity,
  CheckCircle2,
  Download,
  ExternalLink,
  Eye,
  FileCheck,
  Loader2,
  Printer,
  RefreshCw,
  Search,
  ShieldAlert,
  X,
} from 'lucide-react';
import { AuditorActivityRecord, UnifiedReviewItem } from '../types/schema';
import { ThemeConfig } from '../types/theme';
import { formatEasternDateTime, formatRelativeTime } from '../utils/dateUtils';

interface AuditorActivityPaneProps {
  events: AuditorActivityRecord[];
  isLoading: boolean;
  error?: string | null;
  selectedAuditorEmail: string | null;
  searchFilter: string;
  onSearchFilterChange: (val: string) => void;
  onRefresh: () => void;
  allItems: UnifiedReviewItem[];
  onJumpToSession: (sessionId: string, surfaceHint?: string, custodianEmail?: string) => void;
  theme: ThemeConfig;
}

type ActionCategory = 'ALL' | 'QUERIES' | 'VIEWS' | 'EXPORTS';

function classifyActionCategory(action: string): ActionCategory {
  if (
    action === 'SEARCH_COMPLIANCE_LOGS' ||
    action === 'FILTER_SESSIONS' ||
    action === 'FILTER_CUSTODIAN' ||
    action === 'JUMP_TO_SEARCH_RESULT'
  ) {
    return 'QUERIES';
  }
  if (action === 'VIEW_SESSION_TRANSCRIPT' || action === 'LIST_COMPLIANCE_LOGS') {
    return 'VIEWS';
  }
  if (action === 'EXPORT_LEGAL_BRIEF' || action === 'STREAM_ARCHIVE_MEDIA') {
    return 'EXPORTS';
  }
  return 'ALL';
}

function getActionBadgeMeta(action: string): { label: string; badgeClass: string } {
  switch (action) {
    case 'SEARCH_COMPLIANCE_LOGS':
      return {
        label: 'Search Query',
        badgeClass: 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/25',
      };
    case 'FILTER_SESSIONS':
      return {
        label: 'Sidebar Filter',
        badgeClass: 'bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/25',
      };
    case 'JUMP_TO_SEARCH_RESULT':
      return {
        label: 'Clicked Search Hit',
        badgeClass: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/25',
      };
    case 'FILTER_CUSTODIAN':
      return {
        label: 'Custodian Filter',
        badgeClass: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/25',
      };
    case 'VIEW_SESSION_TRANSCRIPT':
      return {
        label: 'Viewed Session',
        badgeClass: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/25',
      };
    case 'EXPORT_LEGAL_BRIEF':
      return {
        label: 'Exported PDF Brief',
        badgeClass: 'bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/25',
      };
    case 'STREAM_ARCHIVE_MEDIA':
      return {
        label: 'Media / Attachment',
        badgeClass: 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border-cyan-500/25',
      };
    case 'LIST_COMPLIANCE_LOGS':
      return {
        label: 'Portal Sync',
        badgeClass: 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-300 border-zinc-500/20',
      };
    default:
      if (action.startsWith('DENIED_')) {
        return {
          label: 'Denied (403)',
          badgeClass: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30',
        };
      }
      return {
        label: action.replace(/_/g, ' '),
        badgeClass: 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-300 border-zinc-500/20',
      };
  }
}

function escapeCsvCell(val: unknown): string {
  const s = String(val ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export const AuditorActivityPane: React.FC<AuditorActivityPaneProps> = ({
  events,
  isLoading,
  error,
  selectedAuditorEmail,
  searchFilter,
  onSearchFilterChange,
  onRefresh,
  allItems,
  onJumpToSession,
  theme,
}) => {
  const [categoryFilter, setCategoryFilter] = useState<ActionCategory>('ALL');

  const sessionMap = useMemo(() => {
    const m = new Map<string, UnifiedReviewItem>();
    for (const item of allItems) {
      m.set(item.id, item);
    }
    return m;
  }, [allItems]);

  const categoryCounts = useMemo(() => {
    let queries = 0;
    let views = 0;
    let exportsCount = 0;
    for (const ev of events) {
      const cat = classifyActionCategory(ev.action);
      if (cat === 'QUERIES') queries++;
      else if (cat === 'VIEWS' && ev.action === 'VIEW_SESSION_TRANSCRIPT') views++;
      else if (cat === 'EXPORTS') exportsCount++;
    }
    return { all: events.length, queries, views, exports: exportsCount };
  }, [events]);

  const distinctSearchTerms = useMemo(() => {
    const map = new Map<string, { term: string; count: number; maxMatches: number }>();
    for (const ev of events) {
      const q = (ev.search_query || '').trim();
      if (!q) continue;
      const key = q.toLowerCase();
      const existing = map.get(key);
      if (existing) {
        existing.count += 1;
        existing.maxMatches = Math.max(existing.maxMatches, ev.matched_session_count || 0);
      } else {
        map.set(key, {
          term: q,
          count: 1,
          maxMatches: ev.matched_session_count || 0,
        });
      }
    }
    return Array.from(map.values()).slice(0, 18);
  }, [events]);

  const visibleEvents = useMemo(() => {
    if (categoryFilter === 'ALL') return events;
    return events.filter((ev) => {
      if (categoryFilter === 'VIEWS') return ev.action === 'VIEW_SESSION_TRANSCRIPT';
      return classifyActionCategory(ev.action) === categoryFilter;
    });
  }, [events, categoryFilter]);

  const handleExportCsv = () => {
    const headers = [
      'event_timestamp',
      'portal_service',
      'auditor_email',
      'action',
      'search_query',
      'filtered_custodian',
      'matched_session_count',
      'viewed_or_exported_session_id',
      'session_custodian_email',
      'export_format',
      'target_resource',
      'is_file_download',
      'auditor_remote_ip',
    ];
    const rows = visibleEvents.map((ev) =>
      [
        ev.event_timestamp,
        ev.portal_service,
        ev.auditor_email,
        ev.action,
        ev.search_query,
        ev.filtered_custodian,
        ev.matched_session_count,
        ev.viewed_or_exported_session_id,
        ev.session_custodian_email,
        ev.export_format,
        ev.target_resource,
        ev.is_file_download,
        ev.auditor_remote_ip,
      ]
        .map(escapeCsvCell)
        .join(',')
    );
    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = `auditor_activity_audit_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(blobUrl);
  };

  return (
    <section className={`flex-1 flex flex-col h-full overflow-hidden ${theme.mainBgClass}`}>
      {/* Header Bar */}
      <div className={`px-6 py-4 border-b flex flex-wrap items-center justify-between gap-3 shrink-0 ${theme.mainHeaderClass}`}>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-mono uppercase tracking-wider font-bold ${theme.accentText}`}>
              Tamper-Evident Chain of Custody · BigQuery &amp; WORM GCS
            </span>
          </div>
          <h2 className={`text-base truncate mt-0.5 ${theme.headingFont} ${theme.textPrimary}`}>
            {selectedAuditorEmail
              ? `Auditor Activity — ${selectedAuditorEmail}`
              : 'Compliance Portal Auditor Activity & Query Trail'}
          </h2>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onRefresh}
            disabled={isLoading}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition cursor-pointer ${theme.cardClass} ${theme.cardHoverClass} ${theme.textPrimary}`}
            title="Refresh live auditor activity from BigQuery"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          <button
            type="button"
            onClick={handleExportCsv}
            disabled={visibleEvents.length === 0}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition cursor-pointer disabled:opacity-50 ${theme.cardClass} ${theme.cardHoverClass} ${theme.textPrimary}`}
            title="Download filtered auditor log as CSV"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>

          <button
            type="button"
            onClick={() => window.print()}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition cursor-pointer ${theme.cardClass} ${theme.cardHoverClass} ${theme.accentText}`}
            title="Print or save auditor activity report as PDF"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print PDF</span>
          </button>
        </div>
      </div>

      {/* Main Scrollable Content */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
        {error && (
          <div className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-xs text-rose-800 flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{error}</span>
          </div>
        )}

        {/* 4 Summary KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <button
            type="button"
            onClick={() => setCategoryFilter(categoryFilter === 'QUERIES' ? 'ALL' : 'QUERIES')}
            className={`p-3.5 border text-left transition cursor-pointer ${
              categoryFilter === 'QUERIES' ? theme.cardSelectedClass : `${theme.cardClass} ${theme.cardHoverClass}`
            }`}
          >
            <div className="flex items-center justify-between">
              <span className={`text-[10px] font-mono uppercase font-bold ${theme.textMuted}`}>
                Searches &amp; Filters
              </span>
              <Search className={`w-3.5 h-3.5 ${theme.accentText}`} />
            </div>
            <div className={`text-xl font-bold mt-1 ${theme.textPrimary}`}>{categoryCounts.queries}</div>
            <div className={`text-[11px] mt-0.5 ${theme.textSecondary}`}>
              {distinctSearchTerms.length} distinct search terms
            </div>
          </button>

          <button
            type="button"
            onClick={() => setCategoryFilter(categoryFilter === 'VIEWS' ? 'ALL' : 'VIEWS')}
            className={`p-3.5 border text-left transition cursor-pointer ${
              categoryFilter === 'VIEWS' ? theme.cardSelectedClass : `${theme.cardClass} ${theme.cardHoverClass}`
            }`}
          >
            <div className="flex items-center justify-between">
              <span className={`text-[10px] font-mono uppercase font-bold ${theme.textMuted}`}>
                Sessions Viewed
              </span>
              <Eye className={`w-3.5 h-3.5 ${theme.accentText}`} />
            </div>
            <div className={`text-xl font-bold mt-1 ${theme.textPrimary}`}>{categoryCounts.views}</div>
            <div className={`text-[11px] mt-0.5 ${theme.textSecondary}`}>
              Opened chat &amp; notebook records
            </div>
          </button>

          <button
            type="button"
            onClick={() => setCategoryFilter(categoryFilter === 'EXPORTS' ? 'ALL' : 'EXPORTS')}
            className={`p-3.5 border text-left transition cursor-pointer ${
              categoryFilter === 'EXPORTS' ? theme.cardSelectedClass : `${theme.cardClass} ${theme.cardHoverClass}`
            }`}
          >
            <div className="flex items-center justify-between">
              <span className={`text-[10px] font-mono uppercase font-bold ${theme.textMuted}`}>
                Exports &amp; Media
              </span>
              <FileCheck className={`w-3.5 h-3.5 ${theme.accentText}`} />
            </div>
            <div className={`text-xl font-bold mt-1 ${theme.textPrimary}`}>{categoryCounts.exports}</div>
            <div className={`text-[11px] mt-0.5 ${theme.textSecondary}`}>
              PDF briefs &amp; preserved files
            </div>
          </button>

          <button
            type="button"
            onClick={() => setCategoryFilter('ALL')}
            className={`p-3.5 border text-left transition cursor-pointer ${
              categoryFilter === 'ALL' ? theme.cardSelectedClass : `${theme.cardClass} ${theme.cardHoverClass}`
            }`}
          >
            <div className="flex items-center justify-between">
              <span className={`text-[10px] font-mono uppercase font-bold ${theme.textMuted}`}>
                Total Audit Events
              </span>
              <Activity className={`w-3.5 h-3.5 ${theme.accentText}`} />
            </div>
            <div className={`text-xl font-bold mt-1 ${theme.textPrimary}`}>{categoryCounts.all}</div>
            <div className={`text-[11px] mt-0.5 flex items-center gap-1 ${theme.textSecondary}`}>
              <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
              <span>Read-only WORM verified</span>
            </div>
          </button>
        </div>

        {/* Distinct Auditor Search Terms Strip */}
        {distinctSearchTerms.length > 0 && (
          <div className={`p-3.5 border space-y-2 ${theme.cardClass}`}>
            <div className="flex items-center justify-between">
              <span className={`text-[10px] font-mono uppercase tracking-wider font-bold ${theme.textMuted}`}>
                Recent Auditor Search Terms (Click to Filter)
              </span>
              {searchFilter && (
                <button
                  type="button"
                  onClick={() => onSearchFilterChange('')}
                  className={`text-[11px] flex items-center gap-1 cursor-pointer ${theme.accentText}`}
                >
                  <X className="w-3 h-3" />
                  <span>Clear query filter</span>
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {distinctSearchTerms.map((q) => {
                const isActive = searchFilter.trim().toLowerCase() === q.term.toLowerCase();
                return (
                  <button
                    key={q.term}
                    type="button"
                    onClick={() => onSearchFilterChange(isActive ? '' : q.term)}
                    className={`px-2.5 py-1 rounded-full text-xs border flex items-center gap-1.5 transition cursor-pointer ${
                      isActive
                        ? 'bg-blue-600 text-white border-blue-600 font-semibold'
                        : `${theme.badgePill} hover:opacity-85`
                    }`}
                  >
                    <Search className="w-3 h-3 shrink-0" />
                    <span className="font-mono font-semibold">“{q.term}”</span>
                    <span className="opacity-75 text-[10px]">
                      ({q.maxMatches} {q.maxMatches === 1 ? 'hit' : 'hits'})
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Activity Ledger Table */}
        <div className={`border overflow-hidden ${theme.cardClass}`}>
          <div className={`px-4 py-2.5 border-b flex items-center justify-between ${theme.sidebarHeaderClass}`}>
            <span className={`text-[11px] font-semibold ${theme.textPrimary}`}>
              Showing {visibleEvents.length} auditor {visibleEvents.length === 1 ? 'event' : 'events'}
              {categoryFilter !== 'ALL' ? ` · Filtered: ${categoryFilter}` : ''}
            </span>
            {categoryFilter !== 'ALL' && (
              <button
                type="button"
                onClick={() => setCategoryFilter('ALL')}
                className={`text-[11px] cursor-pointer ${theme.accentText}`}
              >
                Show All Actions
              </button>
            )}
          </div>

          {isLoading && visibleEvents.length === 0 ? (
            <div className="p-10 flex items-center justify-center gap-2 text-xs text-zinc-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Loading auditor chain-of-custody records from BigQuery...</span>
            </div>
          ) : visibleEvents.length === 0 ? (
            <div className={`p-10 text-center text-xs ${theme.textMuted}`}>
              No auditor events match the current filter criteria.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className={`border-b text-[10px] font-mono uppercase tracking-wider ${theme.sidebarHeaderClass} ${theme.textMuted}`}>
                    <th className="py-2.5 px-4 font-bold">Time (ET)</th>
                    <th className="py-2.5 px-4 font-bold">Auditor &amp; Auth</th>
                    <th className="py-2.5 px-4 font-bold">Action</th>
                    <th className="py-2.5 px-4 font-bold">Search Query / Custodian Scope</th>
                    <th className="py-2.5 px-4 font-bold">Inspected Session / Evidence</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200/70 dark:divide-zinc-800">
                  {visibleEvents.map((ev, idx) => {
                    const badge = getActionBadgeMeta(ev.action);
                    const isWif = (ev.portal_service || '').toLowerCase().includes('wif');
                    const sessId = ev.viewed_or_exported_session_id || '';
                    const matchedSession = sessId ? sessionMap.get(sessId) : undefined;

                    return (
                      <tr
                        key={`${ev.event_timestamp}-${ev.auditor_email}-${ev.action}-${idx}`}
                        className={`transition ${theme.cardHoverClass}`}
                      >
                        {/* Timestamp */}
                        <td className="py-2.5 px-4 whitespace-nowrap align-top">
                          <div className={`font-medium ${theme.textPrimary}`}>
                            {formatRelativeTime(ev.event_timestamp) || ev.event_timestamp}
                          </div>
                          <div className={`text-[10px] font-mono ${theme.textMuted}`}>
                            {formatEasternDateTime(ev.event_timestamp)}
                          </div>
                        </td>

                        {/* Auditor & Portal Badge */}
                        <td className="py-2.5 px-4 align-top">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={`font-semibold break-all ${theme.textPrimary}`}>
                              {ev.auditor_email || 'unknown'}
                            </span>
                            <span
                              className={`text-[9px] font-mono uppercase px-1.5 py-0.5 rounded border font-bold ${
                                isWif
                                  ? 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/25'
                                  : 'bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/25'
                              }`}
                              title={ev.portal_service}
                            >
                              {isWif ? 'Entra WIF' : 'Google IAP'}
                            </span>
                          </div>
                          {ev.auditor_remote_ip && (
                            <div className={`text-[10px] font-mono mt-0.5 ${theme.textMuted}`}>
                              IP: {ev.auditor_remote_ip}
                            </div>
                          )}
                        </td>

                        {/* Action Badge */}
                        <td className="py-2.5 px-4 whitespace-nowrap align-top">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[10px] font-semibold ${badge.badgeClass}`}>
                            {badge.label}
                          </span>
                        </td>

                        {/* Search Query & Custodian Scope */}
                        <td className="py-2.5 px-4 align-top space-y-1">
                          {ev.search_query ? (
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-900 dark:text-amber-200 border border-amber-500/30 font-mono font-bold text-xs">
                                “{ev.search_query}”
                              </span>
                              <span className={`text-[10px] font-mono ${theme.textSecondary}`}>
                                ({ev.matched_session_count} {ev.matched_session_count === 1 ? 'match' : 'matches'})
                              </span>
                            </div>
                          ) : ev.action === 'SEARCH_COMPLIANCE_LOGS' && ev.matched_session_count > 0 ? (
                            <span className={`text-[11px] ${theme.textSecondary}`}>
                              Custodian query ({ev.matched_session_count} sessions matched)
                            </span>
                          ) : null}

                          {(ev.filtered_custodian || ev.session_custodian_email) && (
                            <div className={`text-[11px] ${theme.textSecondary}`}>
                              Custodian:{' '}
                              <span className={`font-mono font-medium ${theme.textPrimary}`}>
                                {ev.filtered_custodian || ev.session_custodian_email}
                              </span>
                            </div>
                          )}

                          {!ev.search_query && !ev.filtered_custodian && !ev.session_custodian_email && (
                            <span className={`text-[11px] ${theme.textMuted}`}>All custodians</span>
                          )}
                        </td>

                        {/* Target Session / Artifact */}
                        <td className="py-2.5 px-4 align-top">
                          {sessId ? (
                            <div className="space-y-1">
                              {matchedSession && (
                                <div className={`text-[11px] font-medium truncate max-w-xs ${theme.textPrimary}`}>
                                  {matchedSession.title}
                                </div>
                              )}
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`text-[10px] font-mono truncate max-w-[180px] ${theme.textMuted}`} title={sessId}>
                                  {sessId}
                                </span>
                                {matchedSession && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      onJumpToSession(
                                        sessId,
                                        ev.surface || matchedSession.surface,
                                        ev.session_custodian_email || matchedSession.user_email
                                      )
                                    }
                                    className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded border cursor-pointer transition ${theme.cardClass} ${theme.cardHoverClass} ${theme.accentText}`}
                                  >
                                    <span>Open Session</span>
                                    <ExternalLink className="w-2.5 h-2.5" />
                                  </button>
                                )}
                              </div>
                            </div>
                          ) : ev.action === 'STREAM_ARCHIVE_MEDIA' && ev.target_resource ? (
                            <div className="space-y-0.5">
                              <span className={`text-[10px] font-mono break-all ${theme.textSecondary}`}>
                                {ev.target_resource.split('/').slice(-1)[0] || ev.target_resource}
                              </span>
                              <div className={`text-[10px] ${theme.textMuted}`}>
                                {ev.is_file_download ? 'Downloaded attachment' : 'Inline media preview'}
                              </div>
                            </div>
                          ) : (
                            <span className={`text-[10px] font-mono ${theme.textMuted}`}>
                              {ev.export_format || '—'}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default AuditorActivityPane;
