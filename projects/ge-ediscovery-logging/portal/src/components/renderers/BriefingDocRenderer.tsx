import React, { useState } from 'react';
import { NotebookStudioRecord } from '../../types/schema';
import { ThemeConfig } from '../../types/theme';
import { MarkdownContent } from '../MarkdownContent';
import { formatTimestampWithRelative } from '../../utils/dateUtils';
import { useHydratedStudioContent } from './useHydratedStudioContent';
import {
  Copy,
  Check,
  Printer,
  Sparkles,
  Loader2,
} from 'lucide-react';

interface BriefingDocRendererProps {
  studio: NotebookStudioRecord;
  theme: ThemeConfig;
}

export const BriefingDocRenderer: React.FC<BriefingDocRendererProps> = ({ studio, theme }) => {
  const [copied, setCopied] = useState<boolean>(false);
  const { content: hydratedContent, isLoading } = useHydratedStudioContent(studio);

  const metadata = typeof studio.metadata === 'object' && studio.metadata !== null
    ? studio.metadata
    : typeof studio.metadata === 'string'
      ? (() => {
          try {
            return JSON.parse(studio.metadata);
          } catch {
            return {};
          }
        })()
      : {};

  const handleCopy = () => {
    const fullText = `# ${studio.title}\n\n${hydratedContent || ''}`;
    navigator.clipboard.writeText(fullText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`rounded-2xl border overflow-hidden shadow-sm space-y-6 p-8 ${theme.cardClass}`}>
      {/* Briefing Document Header */}
      <div className="border-b pb-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-mono font-bold uppercase tracking-wider px-2.5 py-0.5 rounded bg-emerald-500/20 text-emerald-700 dark:text-emerald-300">
              Briefing Doc
            </span>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className={`p-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${theme.quoteBox}`}
              title="Copy briefing document text"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied' : 'Copy Text'}</span>
            </button>
            <button
              onClick={() => window.print()}
              className={`p-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${theme.accentBtn}`}
              title="Print or export as PDF"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Export PDF</span>
            </button>
          </div>
        </div>

        <div>
          <h1 className={`${theme.headingFont} text-2xl font-bold ${theme.textPrimary}`}>
            {studio.title || 'Briefing Document'}
          </h1>
          <div className="flex items-center gap-3 text-xs font-mono text-zinc-500 mt-2 flex-wrap">
            {studio.user_email && (
              <span>User: <strong className={theme.textPrimary}>{studio.user_email}</strong></span>
            )}
            {studio.event_time && (
              <>
                <span>•</span>
                <span>Date: {formatTimestampWithRelative(studio.event_time)}</span>
              </>
            )}
            {metadata.target_audience && (
              <>
                <span>•</span>
                <span>Target Audience: {metadata.target_audience}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Steering Focus */}
      {(studio.customization_prompt || metadata.user_steering_prompt) && (
        <div className={`p-4 rounded-xl border text-xs leading-relaxed space-y-1 ${theme.quoteBox}`}>
          <div className="flex items-center gap-1.5 font-semibold text-emerald-700 dark:text-emerald-400">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Steering Prompt / Custom Guidance</span>
          </div>
          <p className={theme.textSecondary}>
            {studio.customization_prompt || metadata.user_steering_prompt}
          </p>
        </div>
      )}

      {/* Structured Executive Briefing Content */}
      {isLoading ? (
        <div className={`p-8 rounded-xl border flex items-center justify-center gap-2.5 text-xs ${theme.quoteBox} ${theme.textSecondary}`}>
          <Loader2 className="w-4 h-4 animate-spin text-emerald-600 dark:text-emerald-400" />
          <span>Loading briefing document from Cloud Storage...</span>
        </div>
      ) : (
        <div className={`prose prose-sm max-w-none text-xs ${theme.bodyFont} leading-relaxed ${theme.textPrimary} space-y-4`}>
          <MarkdownContent
            content={hydratedContent || '# Summary\n\nNo report content recorded.'}
            theme={theme}
          />
        </div>
      )}

      {/* Grounded References & Storage */}
      <div className={`p-4 rounded-xl border font-mono text-[10px] space-y-1.5 ${theme.quoteBox}`}>
        <div className="flex items-center justify-between">
          <span className={theme.textMuted}>Cloud Storage:</span>
          <span>{studio.gcs_uri || 'Not Mirrored to Cloud Storage'}</span>
        </div>
        {studio.sha256_hash && (
          <div className="flex items-center justify-between">
            <span className={theme.textMuted}>SHA-256 Hash:</span>
            <span className="truncate max-w-[280px]">{studio.sha256_hash}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default BriefingDocRenderer;
