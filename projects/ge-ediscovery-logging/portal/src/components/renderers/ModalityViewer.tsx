import React from 'react';
import { NotebookStudioRecord } from '../../types/schema';
import { ThemeConfig } from '../../types/theme';
import { InfographicRenderer } from './InfographicRenderer';
import { MindMapRenderer } from './MindMapRenderer';
import { VideoOverviewRenderer } from './VideoOverviewRenderer';
import { BriefingDocRenderer } from './BriefingDocRenderer';
import { StudyGuideRenderer } from './StudyGuideRenderer';
import { FaqRenderer } from './FaqRenderer';
import { TimelineRenderer } from './TimelineRenderer';
import { QuizRenderer } from './QuizRenderer';
import { FlashcardsRenderer } from './FlashcardsRenderer';
import { PresentationViewer } from './PresentationViewer';
import { useHydratedStudioContent } from './useHydratedStudioContent';
import { MarkdownContent } from '../MarkdownContent';
import { getDirectMediaUrl } from '../../services/complianceApi';
import { formatTimestampWithRelative } from '../../utils/dateUtils';
import {
  Headphones,
  Download,
  FileText,
  Sparkles,
  Loader2,
} from 'lucide-react';

interface ModalityViewerProps {
  studio: NotebookStudioRecord;
  theme: ThemeConfig;
  index?: number;
}

export function detectStudioModality(studio: NotebookStudioRecord): string {
  const type = (studio.artifact_type || '').toUpperCase();
  const title = (studio.title || studio.artifact_title || '').toLowerCase();
  const content = (studio.note_content || '').toLowerCase();

  if (type === 'QUIZ' || studio.quiz_data || title.includes('quiz')) {
    return 'QUIZ';
  }
  if (type === 'FLASHCARDS' || type === 'FLASHCARD' || studio.flashcards_data || title.includes('flashcard')) {
    return 'FLASHCARDS';
  }
  if (type === 'STUDIO_ARTIFACT') {
    return 'STUDIO_ARTIFACT';
  }
  if (type === 'NOTEBOOK_GUIDE') {
    return 'NOTEBOOK_GUIDE';
  }
  if (type === 'STUDIO_NOTE' || type === 'NOTE') {
    return 'STUDIO_NOTE';
  }
  if (type === 'INFOGRAPHIC' || title.includes('infographic') || title.includes('diagram')) {
    return 'INFOGRAPHIC';
  }
  if (type === 'MIND_MAP' || title.includes('mind map') || title.includes('mindmap') || studio.mind_map_data) {
    return 'MIND_MAP';
  }
  if (type === 'VIDEO' || type === 'VIDEO_OVERVIEW' || title.includes('video overview') || title.includes('explainer video') || studio.mime_type?.startsWith('video/')) {
    return 'VIDEO_OVERVIEW';
  }
  if (type === 'BRIEFING_DOC' || title.includes('briefing') || content.includes('# executive briefing')) {
    return 'BRIEFING_DOC';
  }
  if (type === 'STUDY_GUIDE' || title.includes('study guide') || content.includes('study guide') || content.includes('practice questions')) {
    return 'STUDY_GUIDE';
  }
  if (type === 'FAQ' || title.includes('faq') || title.includes('frequently asked') || content.includes('### q:')) {
    return 'FAQ';
  }
  if (type === 'TIMELINE' || title.includes('timeline') || title.includes('chronology') || content.includes('milestone')) {
    return 'TIMELINE';
  }
  if (type === 'AUDIO_OVERVIEW' || studio.mime_type?.startsWith('audio/') || title.includes('audio overview') || title.includes('deep dive')) {
    return 'AUDIO_OVERVIEW';
  }
  if (type === 'SLIDES' || type === 'SLIDE_DECK' || studio.mime_type?.includes('pdf') || title.includes('slide') || title.includes('presentation')) {
    return 'SLIDE_DECK';
  }
  return 'REPORT';
}

export const ModalityViewer: React.FC<ModalityViewerProps> = ({ studio, theme }) => {
  const modality = detectStudioModality(studio);
  const directUrl = studio.gcs_uri ? getDirectMediaUrl(studio.gcs_uri) : undefined;
  const shouldHydrateNote = modality === 'STUDIO_NOTE' && !studio.note_content && Boolean(studio.gcs_uri);
  const { content: hydratedNoteContent, isLoading: isFetchingNote } = useHydratedStudioContent(
    shouldHydrateNote ? studio : { ...studio, gcs_uri: '' }
  );
  const effectiveNoteContent = studio.note_content || hydratedNoteContent;

  const isGenerating = Boolean(
    studio.lifecycle_state &&
    (studio.lifecycle_state === 'REQUESTED' || studio.lifecycle_state === 'PROCESSING' || studio.lifecycle_state === 'GENERATING')
  );
  const isFailed = Boolean(studio.lifecycle_state === 'FAILED' || studio.status_code === 404);

  const renderModalityContent = () => {
    if (!studio.gcs_uri && isFailed) {
      return (
        <div className={`rounded-2xl border border-rose-500/30 overflow-hidden shadow-sm space-y-6 p-8 ${theme.cardClass}`}>
          <div className="flex items-center justify-between border-b border-rose-500/20 pb-4 flex-wrap gap-2">
            <div className="flex items-center gap-2.5">
              <div className="p-2.5 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400">
                <Sparkles className="w-5 h-5 opacity-60" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-mono font-bold uppercase tracking-wider px-2.5 py-0.5 rounded bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30">
                    Unfulfilled / Timed Out
                  </span>
                  {studio.event_time && (
                    <span className={`text-xs font-mono ${theme.textMuted}`}>
                      {formatTimestampWithRelative(studio.event_time)}
                    </span>
                  )}
                </div>
                <h2 className={`${theme.headingFont} text-lg font-bold ${theme.textPrimary} mt-0.5`}>
                  {studio.title || studio.artifact_title || 'Studio Artifact'}
                </h2>
              </div>
            </div>
          </div>

          <div className="p-6 rounded-xl border border-rose-500/20 bg-rose-500/5 text-center space-y-2">
            <p className="text-xs font-semibold text-rose-700 dark:text-rose-300">
              Artifact Generation Unfulfilled
            </p>
            <p className="text-[11px] text-zinc-600 dark:text-zinc-400 max-w-lg mx-auto leading-relaxed">
              This artifact request was initiated in Discovery Engine audit logs, but binary media was not produced by the model within the 60-minute retention window.
            </p>
          </div>

          <div className={`p-3.5 rounded-xl border font-mono text-[10px] space-y-1.5 ${theme.quoteBox}`}>
            <div><span className="font-semibold text-zinc-500">Artifact ID:</span> {studio.artifact_id || 'N/A'}</div>
            <div><span className="font-semibold text-zinc-500">Lifecycle State:</span> <span className="text-rose-600 dark:text-rose-400 font-bold">FAILED</span></div>
            {studio.status_message && (
              <div><span className="font-semibold text-zinc-500">Status Message:</span> {studio.status_message}</div>
            )}
            <div><span className="font-semibold text-zinc-500">Target Notebook ID:</span> {studio.notebook_id || 'N/A'}</div>
          </div>
        </div>
      );
    }

    switch (modality) {
    case 'QUIZ':
      return <QuizRenderer studio={studio} theme={theme} />;

    case 'FLASHCARDS':
      return <FlashcardsRenderer studio={studio} theme={theme} />;

    case 'INFOGRAPHIC':
      return <InfographicRenderer studio={studio} theme={theme} />;

    case 'MIND_MAP':
      return <MindMapRenderer studio={studio} theme={theme} />;

    case 'VIDEO_OVERVIEW':
      return <VideoOverviewRenderer studio={studio} theme={theme} />;

    case 'BRIEFING_DOC':
      return <BriefingDocRenderer studio={studio} theme={theme} />;

    case 'STUDY_GUIDE':
      return <StudyGuideRenderer studio={studio} theme={theme} />;

    case 'FAQ':
      return <FaqRenderer studio={studio} theme={theme} />;

    case 'TIMELINE':
      return <TimelineRenderer studio={studio} theme={theme} />;

    case 'AUDIO_OVERVIEW':
      return (
        <div className={`rounded-2xl border overflow-hidden shadow-sm space-y-6 p-8 ${theme.cardClass}`}>
          <div className="flex items-center justify-between border-b pb-4 flex-wrap gap-2">
            <div className="flex items-center gap-2.5">
              <div className="p-2.5 rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400">
                <Headphones className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-mono font-bold uppercase tracking-wider px-2.5 py-0.5 rounded bg-sky-500/20 text-sky-700 dark:text-sky-300">
                    Audio Overview
                  </span>
                  <span className={`text-xs font-mono ${theme.textMuted}`}>
                    {studio.duration_seconds ? `${Math.round(studio.duration_seconds)}s` : 'WAV Audio'}
                  </span>
                </div>
                <h2 className={`${theme.headingFont} text-lg font-bold ${theme.textPrimary} mt-0.5`}>
                  {studio.title || 'Deep Dive Audio Overview'}
                </h2>
              </div>
            </div>

            {directUrl && (
              <a
                href={directUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={`p-2 rounded-lg border hover:opacity-80 transition flex items-center gap-1 text-xs font-semibold ${theme.accentBtn}`}
              >
                <Download className="w-4 h-4" />
                <span>Download Audio</span>
              </a>
            )}
          </div>

          {/* Audio Player */}
          {directUrl ? (
            <div className="p-4 rounded-xl bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800">
              <audio controls src={directUrl} className="w-full" />
            </div>
          ) : (
            <div className={`p-6 rounded-xl border text-center space-y-2 ${theme.quoteBox}`}>
              <Headphones className="w-8 h-8 mx-auto text-sky-600 animate-pulse" />
              <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                {studio.customization_prompt || 'Deep Dive two-host conversational podcast overview.'}
              </p>
            </div>
          )}

          {studio.note_content && (
            <div className="space-y-2">
              <span className={`text-xs font-semibold block ${theme.accentText}`}>
                Episode Summary & Outline
              </span>
              <div className={`p-4 rounded-xl border text-xs leading-relaxed whitespace-pre-wrap ${theme.quoteBox}`}>
                {studio.note_content}
              </div>
            </div>
          )}

          <div className={`p-3 rounded-xl border font-mono text-[10px] space-y-1 ${theme.quoteBox}`}>
            <div>GCS Storage URI: {studio.gcs_uri || '-'}</div>
            {studio.sha256_hash && <div>SHA-256 Hash: {studio.sha256_hash}</div>}
          </div>
        </div>
      );

    case 'SLIDE_DECK':
      return (
        <div className="space-y-4">
          <PresentationViewer
            title={studio.title || 'Slide Deck Presentation'}
            gcsUri={studio.gcs_uri}
            rawHtml={studio.note_content}
            snippet={studio.note_content}
            sha256={studio.sha256_hash}
            sizeBytes={studio.byte_size}
            slideCount={studio.slide_count}
            theme={theme}
          />
          {studio.customization_prompt && (
            <div className={`p-4 rounded-xl border text-xs leading-relaxed space-y-1 ${theme.quoteBox}`}>
              <div className="flex items-center gap-1.5 font-semibold text-orange-700 dark:text-orange-400">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Strategic Deck Steering Directive</span>
              </div>
              <p className={theme.textSecondary}>
                {studio.customization_prompt}
              </p>
            </div>
          )}
        </div>
      );

    case 'STUDIO_NOTE':
      return (
        <div className={`rounded-2xl border overflow-hidden shadow-sm space-y-6 p-8 ${theme.cardClass}`}>
          <div className="flex items-center justify-between border-b pb-4 flex-wrap gap-2">
            <div className="flex items-center gap-2.5">
              <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-mono font-bold uppercase tracking-wider px-2.5 py-0.5 rounded bg-amber-500/20 text-amber-700 dark:text-amber-300">
                    Note
                  </span>
                  {studio.event_time && (
                    <span className={`text-xs font-mono ${theme.textMuted}`}>
                      {formatTimestampWithRelative(studio.event_time)}
                    </span>
                  )}
                </div>
                <h2 className={`${theme.headingFont} text-lg font-bold ${theme.textPrimary} mt-0.5`}>
                  {studio.title || 'Studio Note'}
                </h2>
              </div>
            </div>

            {directUrl && (
              <a
                href={directUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={`p-2 rounded-lg border hover:opacity-80 transition flex items-center gap-1 text-xs font-semibold ${theme.accentBtn}`}
              >
                <Download className="w-4 h-4" />
                <span>Download Markdown</span>
              </a>
            )}
          </div>

          {isFetchingNote ? (
            <div className={`p-8 rounded-xl border flex items-center justify-center gap-2.5 text-xs ${theme.quoteBox} ${theme.textSecondary}`}>
              <Loader2 className="w-4 h-4 animate-spin text-amber-600 dark:text-amber-400" />
              <span>Loading note content from Cloud Storage...</span>
            </div>
          ) : effectiveNoteContent ? (
            <div className={`p-5 rounded-xl border prose prose-sm max-w-none text-xs ${theme.bodyFont} leading-relaxed ${theme.quoteBox}`}>
              <MarkdownContent content={effectiveNoteContent} theme={theme} />
            </div>
          ) : (
            <div className={`p-5 rounded-xl border text-xs leading-relaxed whitespace-pre-wrap ${theme.quoteBox}`}>
              {studio.customization_prompt || '(Empty note draft)'}
            </div>
          )}

          <div className={`p-3 rounded-xl border font-mono text-[10px] space-y-1 ${theme.quoteBox}`}>
            <div>GCS Storage Path: {studio.gcs_uri || '-'}</div>
            {studio.sha256_hash && <div>SHA-256 Hash: {studio.sha256_hash}</div>}
          </div>
        </div>
      );

    case 'STUDIO_ARTIFACT':
      if (isFailed) {
        return (
          <div className={`rounded-2xl border border-rose-500/30 overflow-hidden shadow-sm space-y-6 p-8 ${theme.cardClass}`}>
            <div className="flex items-center justify-between border-b border-rose-500/20 pb-4 flex-wrap gap-2">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400">
                  <Sparkles className="w-5 h-5 opacity-60" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-mono font-bold uppercase tracking-wider px-2.5 py-0.5 rounded bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30">
                      Unfulfilled / Timed Out
                    </span>
                    {studio.event_time && (
                      <span className={`text-xs font-mono ${theme.textMuted}`}>
                        {formatTimestampWithRelative(studio.event_time)}
                      </span>
                    )}
                  </div>
                  <h2 className={`${theme.headingFont} text-lg font-bold ${theme.textPrimary} mt-0.5`}>
                    {studio.title || studio.artifact_title || 'Studio Artifact'}
                  </h2>
                </div>
              </div>
            </div>

            <div className={`p-6 rounded-xl border border-rose-500/20 bg-rose-500/5 text-center space-y-2`}>
              <p className="text-xs font-semibold text-rose-700 dark:text-rose-300">
                Artifact Generation Unfulfilled
              </p>
              <p className={`text-[11px] text-zinc-600 dark:text-zinc-400 max-w-lg mx-auto leading-relaxed`}>
                This artifact request was initiated in Discovery Engine audit logs, but binary media was not produced by the model within the 60-minute retention window.
              </p>
            </div>

            <div className={`p-3.5 rounded-xl border font-mono text-[10px] space-y-1.5 ${theme.quoteBox}`}>
              <div><span className="font-semibold text-zinc-500">Artifact ID:</span> {studio.artifact_id || '-'}</div>
              <div><span className="font-semibold text-zinc-500">Lifecycle State:</span> <span className="text-rose-600 dark:text-rose-400 font-bold">FAILED</span></div>
              {studio.status_message && (
                <div><span className="font-semibold text-zinc-500">Status Message:</span> {studio.status_message}</div>
              )}
              <div><span className="font-semibold text-zinc-500">Target Notebook ID:</span> {studio.notebook_id || '-'}</div>
            </div>
          </div>
        );
      }

      return (
        <div className={`rounded-2xl border overflow-hidden shadow-sm space-y-6 p-8 ${theme.cardClass}`}>
          <div className="flex items-center justify-between border-b pb-4 flex-wrap gap-2">
            <div className="flex items-center gap-2.5">
              <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <Sparkles className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-mono font-bold uppercase tracking-wider px-2.5 py-0.5 rounded bg-amber-500/20 text-amber-700 dark:text-amber-300 inline-flex items-center gap-1">
                    <Loader2 className="w-2.5 h-2.5 animate-spin" />
                    Generating...
                  </span>
                  {studio.event_time && (
                    <span className={`text-xs font-mono ${theme.textMuted}`}>
                      {formatTimestampWithRelative(studio.event_time)}
                    </span>
                  )}
                </div>
                <h2 className={`${theme.headingFont} text-lg font-bold ${theme.textPrimary} mt-0.5`}>
                  {studio.title || studio.artifact_title || 'Studio Artifact'}
                </h2>
              </div>
            </div>
          </div>

          <div className={`p-6 rounded-xl border text-center space-y-3 ${theme.quoteBox}`}>
            <Loader2 className="w-8 h-8 mx-auto text-amber-600 dark:text-amber-400 animate-spin" />
            <div className="space-y-1">
              <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                Studio Generation In-Flight
              </p>
              <p className={`text-[11px] ${theme.textSecondary}`}>
                {studio.customization_prompt || studio.user_steering_prompt || 'Artifact generation is currently being processed by Gemini Enterprise Notebooks Studio.'}
              </p>
            </div>
          </div>

          <div className={`p-3 rounded-xl border font-mono text-[10px] space-y-1 ${theme.quoteBox}`}>
            <div>Artifact ID: {studio.artifact_id || '-'}</div>
            <div>Lifecycle State: {studio.lifecycle_state || 'REQUESTED'}</div>
            <div>Target Project / Notebook: {studio.notebook_id || '-'}</div>
          </div>
        </div>
      );

    default:
      return <BriefingDocRenderer studio={studio} theme={theme} />;
    }
  };

  return (
    <div className="space-y-4">
      {isGenerating && (
        <div className="flex items-center gap-2.5 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-200 text-xs font-medium animate-pulse shadow-2xs">
          <Loader2 className="w-4 h-4 animate-spin text-amber-600 dark:text-amber-400 shrink-0" />
          <span>Generating studio artifact in background ({studio.lifecycle_state || 'PROCESSING'}). Content and media preview will update upon completion.</span>
        </div>
      )}
      {renderModalityContent()}
    </div>
  );
};

export default ModalityViewer;
