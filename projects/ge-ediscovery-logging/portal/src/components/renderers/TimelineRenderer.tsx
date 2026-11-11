import React, { useState, useMemo } from 'react';
import { NotebookStudioRecord } from '../../types/schema';
import { ThemeConfig } from '../../types/theme';
import { MarkdownContent } from '../MarkdownContent';
import { useHydratedStudioContent } from './useHydratedStudioContent';
import {
  Search,
  Printer,
  Copy,
  Check,
  Loader2,
} from 'lucide-react';

interface TimelineEvent {
  id: number;
  timeLabel: string;
  title: string;
  description: string;
  status?: 'COMPLETED' | 'IN_PROGRESS' | 'PLANNED';
  category?: string;
}

interface TimelineRendererProps {
  studio: NotebookStudioRecord;
  theme: ThemeConfig;
}

function parseTimelineEvents(content: string): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  const lines = (content || '').split('\n');

  let currentLabel = '';
  let currentTitle = '';
  let currentDesc = '';
  let idCounter = 1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Match timeline headers: "### Q1 2026: Milestone Title" or "**2026-08-15** - Title" or "1. Phase 1 (Jan 2026): Description"
    const timeMatch = line.match(/^(?:###\s*|\*{0,2})([0-9]{4}(?:-[0-9]{2}(?:-[0-9]{2})?)?|Q[1-4]\s*[0-9]{4}|Phase\s*[0-9]+|Week\s*[0-9]+|Day\s*[0-9]+|Hour\s*[0-9]+|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s*[0-9]{4})[:\s-]+(.*?)(?:\*{0,2})$/i);

    if (timeMatch) {
      if (currentTitle) {
        events.push({
          id: idCounter++,
          timeLabel: currentLabel || 'Milestone',
          title: currentTitle,
          description: currentDesc.trim() || 'Event milestone preserved from source evidence.',
          status: idCounter % 2 === 0 ? 'COMPLETED' : 'IN_PROGRESS',
        });
        currentDesc = '';
      }
      currentLabel = timeMatch[1].trim();
      currentTitle = timeMatch[2].trim() || `Milestone ${idCounter}`;
    } else if (line.startsWith('-') || line.startsWith('*')) {
      currentDesc += '\n' + line.replace(/^[-*]\s*/, '');
    } else if (line.length > 0 && !line.startsWith('#')) {
      currentDesc += ' ' + line;
    }
  }

  if (currentTitle) {
    events.push({
      id: idCounter++,
      timeLabel: currentLabel || 'Milestone',
      title: currentTitle,
      description: currentDesc.trim() || 'Event milestone preserved from source evidence.',
      status: 'COMPLETED',
    });
  }

  return events;
}

export const TimelineRenderer: React.FC<TimelineRendererProps> = ({ studio, theme }) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);
  const { content: hydratedContent, isLoading } = useHydratedStudioContent(studio);

  const events = useMemo(() => parseTimelineEvents(hydratedContent || ''), [hydratedContent]);

  const filteredEvents = useMemo(() => {
    if (!searchQuery.trim()) return events;
    const q = searchQuery.toLowerCase();
    return events.filter((e) => e.title.toLowerCase().includes(q) || e.timeLabel.toLowerCase().includes(q) || e.description.toLowerCase().includes(q));
  }, [events, searchQuery]);

  const handleCopy = () => {
    const text = events.length > 0
      ? events.map((e) => `[${e.timeLabel}] ${e.title}\n${e.description}\n`).join('\n')
      : hydratedContent;
    navigator.clipboard.writeText(`# ${studio.title}\n\n${text}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`rounded-2xl border overflow-hidden shadow-sm space-y-6 p-8 ${theme.cardClass}`}>
      {/* Header */}
      <div className="border-b pb-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-mono font-bold uppercase tracking-wider px-2.5 py-0.5 rounded bg-teal-500/20 text-teal-700 dark:text-teal-300">
              Timeline
            </span>
            <span className={`text-xs font-mono ${theme.textMuted}`}>
              {events.length} Historical Milestones
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className={`p-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${theme.quoteBox}`}
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied' : 'Copy Timeline'}</span>
            </button>
            <button
              onClick={() => window.print()}
              className={`p-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${theme.accentBtn}`}
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Export PDF</span>
            </button>
          </div>
        </div>

        <div>
          <h1 className={`${theme.headingFont} text-2xl font-bold ${theme.textPrimary}`}>
            {studio.title || 'Chronological Event Timeline'}
          </h1>
          <p className="text-xs text-zinc-500 mt-1">
            Grounded temporal sequence tracing evolutionary phases and strategic milestones.
          </p>
        </div>

        {/* Search Input */}
        <div className="relative max-w-md">
          <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-zinc-400" />
          <input
            type="text"
            placeholder="Search dates, phases, or milestone keywords..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={`w-full pl-9 pr-3 py-2 text-xs rounded-xl border outline-none font-sans focus:ring-1 focus:ring-teal-500 ${theme.quoteBox}`}
          />
        </div>
      </div>

      {/* Chronological Vertical Timeline Rail or Raw Markdown */}
      {isLoading ? (
        <div className={`p-8 rounded-xl border flex items-center justify-center gap-2.5 text-xs ${theme.quoteBox} ${theme.textSecondary}`}>
          <Loader2 className="w-4 h-4 animate-spin text-teal-600 dark:text-teal-400" />
          <span>Loading timeline from Cloud Storage...</span>
        </div>
      ) : events.length === 0 ? (
        <div className={`prose prose-sm max-w-none text-xs ${theme.bodyFont} leading-relaxed ${theme.textPrimary} space-y-4`}>
          <MarkdownContent
            content={hydratedContent || '# Timeline\n\nNo timeline content recorded.'}
            theme={theme}
          />
        </div>
      ) : (
        <div className="relative pl-6 space-y-8 border-l-2 border-teal-300 dark:border-teal-900 ml-4 py-2">
          {filteredEvents.map((evt) => (
            <div key={evt.id} className="relative group">
              {/* Timeline Milestone Dot */}
              <div className="absolute -left-[31px] top-1.5 w-4 h-4 rounded-full border-2 border-white dark:border-zinc-900 bg-teal-600 shadow-md group-hover:scale-125 transition" />

              <div className={`p-5 rounded-2xl border transition shadow-2xs space-y-2 ${theme.cardClass} ${theme.cardHoverClass}`}>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-teal-500/15 text-teal-700 dark:text-teal-300">
                      {evt.timeLabel}
                    </span>
                    <span className={`text-[9px] font-mono font-bold px-1.5 py-0.2 rounded ${
                      evt.status === 'COMPLETED'
                        ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                        : 'bg-amber-500/20 text-amber-700 dark:text-amber-300'
                    }`}>
                      {evt.status || 'RECORDED'}
                    </span>
                  </div>
                </div>

                <h3 className={`${theme.headingFont} text-sm font-bold ${theme.textPrimary}`}>
                  {evt.title}
                </h3>

                <p className={`text-xs ${theme.bodyFont} leading-relaxed whitespace-pre-wrap ${theme.textSecondary}`}>
                  {evt.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TimelineRenderer;
