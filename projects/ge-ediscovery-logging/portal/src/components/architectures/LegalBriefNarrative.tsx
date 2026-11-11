import React, { useState, useMemo } from 'react';
import {
  UnifiedReviewItem,
  UserProfile,
  ProcessedLogRecord,
  NotebookSourceRecord,
  NotebookChatRecord,
  NotebookStudioRecord,
  ArtifactFile,
  GroundedCitation,
} from '../../types/schema';
import { ensureArray } from '../../utils/arrayUtils';
import { matchesQuery } from '../../utils/searchUtils';
import {
  formatEasternDateTime,
  formatRelativeTime,
  formatTimestampWithRelative,
} from '../../utils/dateUtils';
import { getDirectMediaUrl, getCleanExtension } from '../../services/complianceApi';
import { MarkdownContent } from '../MarkdownContent';
import { ModalityViewer, detectStudioModality } from '../renderers/ModalityViewer';
import { PresentationViewer } from '../renderers/PresentationViewer';
import { ChatVideoPlayer } from '../renderers/ChatVideoPlayer';
import {
  BookOpen,
  FileText,
  MessageSquare,
  Search,
  ImageIcon,
  Video,
  Eye,
  Download,
  ExternalLink,
  ChevronRight,
  ChevronDown,
  Palette,
  Check,
  Printer,
  Globe,
  Sparkles,
  Headphones,
  Layers,
  ArrowLeft,
  AlertTriangle,
  Presentation,
  Network,
  GraduationCap,
  HelpCircle,
  Calendar,
  Loader2,
} from 'lucide-react';

import { DateRangeSlider } from '../DateRangeSlider';
import { EditorialTheme, THEMES } from '../../types/theme';
export type { EditorialTheme };

interface LegalBriefNarrativeProps {
  users: UserProfile[];
  selectedUserEmail: string | null;
  onSelectUser: (email: string | null) => void;
  surfaceMode: 'NOTEBOOK_LM' | 'GEMINI_ENTERPRISE_CHAT';
  onSurfaceChange: (mode: 'NOTEBOOK_LM' | 'GEMINI_ENTERPRISE_CHAT') => void;
  items: UnifiedReviewItem[];
  allItems?: UnifiedReviewItem[];
  onSelectItem: (id: string | null) => void;
  activeItem: UnifiedReviewItem | null;
  selectedTheme?: EditorialTheme;
  onSelectTheme?: (theme: EditorialTheme) => void;
  minTimestamp?: number;
  maxTimestamp?: number;
  selectedStartTime?: number;
  onStartTimeChange?: (startTime: number) => void;
}

type EvidenceSelection =
  | { type: 'SOURCE'; source: NotebookSourceRecord; index: number }
  | { type: 'CHAT_TURN'; turn: ProcessedLogRecord | NotebookChatRecord; turnNumber: number }
  | { type: 'STUDIO_NOTE'; studio: NotebookStudioRecord; index: number }
  | { type: 'AUDIO_OVERVIEW'; studio: NotebookStudioRecord }
  | { type: 'CITATION'; citation: GroundedCitation; index: number }
  | {
      type: 'ARTIFACT';
      title: string;
      mediaType: 'IMAGE' | 'VIDEO' | 'AUDIO' | 'FILE' | 'PDF' | 'SLIDES';
      gcs_uri?: string;
      preview_url?: string;
      web_url?: string;
      size_bytes?: number;
      sha256?: string;
      crc32c?: string;
      snippet?: string;
      assetKind?: 'INPUT' | 'OUTPUT';
    };

/**
 * Strictly validates that an external URL uses an explicit http(s):// scheme
 * (or internal /api/media? proxy path), preventing javascript:/data:/vbscript: URIs.
 */
function sanitizeExternalUrl(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  const normalized = trimmed.replace(/[\u0000-\u0020]+/g, '');
  if (/^https?:\/\//i.test(normalized) || normalized.startsWith('/api/media?')) {
    return trimmed;
  }
  return undefined;
}

/**
 * Splits model reasoning steps from final output.
 */
function parseReasoningAndOutput(output: string, trace?: string): { reasoning: string; output: string } {
  let reasoning = (trace || '').trim();
  let cleanOutput = (output || '').trim();

  if (!reasoning && cleanOutput.includes('THOUGHT:')) {
    const lines = cleanOutput.split('\n');
    const reasoningLines: string[] = [];
    const outputLines: string[] = [];
    let inThought = false;

    for (const line of lines) {
      if (line.startsWith('THOUGHT:') || line.startsWith('PLAN:') || line.startsWith('ACTION:')) {
        inThought = true;
        reasoningLines.push(line.replace(/^(THOUGHT|PLAN|ACTION):\s*/, ''));
      } else if (inThought && line.startsWith('   ')) {
        reasoningLines.push(line.trim());
      } else {
        inThought = false;
        outputLines.push(line);
      }
    }

    if (reasoningLines.length > 0) {
      reasoning = reasoningLines.join('\n').trim();
      cleanOutput = outputLines.join('\n').trim();
    }
  }

  // Deduplicate reasoning if output starts with or contains the extracted reasoning trace
  if (reasoning && cleanOutput) {
    if (cleanOutput.startsWith(reasoning)) {
      cleanOutput = cleanOutput.slice(reasoning.length).trim();
    } else if (cleanOutput.includes(reasoning)) {
      cleanOutput = cleanOutput.replace(reasoning, '').trim();
    }
  }

  return {
    reasoning,
    output: cleanOutput || (reasoning ? '(Completed internal reasoning trace)' : output),
  };
}

function getAgentBadge(item: UnifiedReviewItem) {
  if (item.surface === 'NOTEBOOK_LM') {
    return null;
  }
  const isDeepResearch =
    item.agent_type === 'DEEP_RESEARCH' ||
    (item.chat_turns &&
      item.chat_turns.some(
        (t) => t.agent_id === 'deep_research' || t.interaction_surface === 'DEEP_RESEARCH'
      ));
  if (isDeepResearch) {
    return {
      label: 'Deep Research',
      classes: 'bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30',
    };
  }
  if (
    item.agent_type === 'HIGH_CODE_AGENT' ||
    (item.chat_turns &&
      item.chat_turns.some((t) => t.interaction_surface === 'HIGH_CODE_AGENT'))
  ) {
    return {
      label: 'Code Agent',
      classes: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
    };
  }
  if (
    item.agent_type === 'NO_CODE_AGENT' ||
    (item.chat_turns &&
      item.chat_turns.some((t) => t.interaction_surface === 'NO_CODE_AGENT'))
  ) {
    return {
      label: 'No-Code Agent',
      classes: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
    };
  }
  return {
    label: 'Chat Agent',
    classes: 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30',
  };
}

function renderModalityIcon(st: NotebookStudioRecord, className: string) {
  const modality = detectStudioModality(st);
  switch (modality) {
    case 'QUIZ':
      return <HelpCircle className={className} />;
    case 'FLASHCARDS':
      return <Layers className={className} />;
    case 'STUDIO_ARTIFACT':
      return <Sparkles className={className} />;
    case 'NOTEBOOK_GUIDE':
      return <BookOpen className={className} />;
    case 'INFOGRAPHIC':
      return <ImageIcon className={className} />;
    case 'MIND_MAP':
      return <Network className={className} />;
    case 'VIDEO_OVERVIEW':
      return <Video className={className} />;
    case 'BRIEFING_DOC':
      return <FileText className={className} />;
    case 'STUDY_GUIDE':
      return <GraduationCap className={className} />;
    case 'FAQ':
      return <HelpCircle className={className} />;
    case 'TIMELINE':
      return <Calendar className={className} />;
    case 'AUDIO_OVERVIEW':
      return <Headphones className={className} />;
    case 'SLIDE_DECK':
      return <Presentation className={className} />;
    default:
      return <FileText className={className} />;
  }
}

function formatStudioModalityLabel(modality: string): string {
  switch (modality) {
    case 'QUIZ':
      return 'QUIZ';
    case 'FLASHCARDS':
      return 'FLASHCARDS';
    case 'STUDIO_ARTIFACT':
      return 'STUDIO ARTIFACT';
    case 'NOTEBOOK_GUIDE':
      return 'NOTEBOOK GUIDE';
    default:
      return modality.replace(/_/g, ' ');
  }
}

export const LegalBriefNarrative: React.FC<LegalBriefNarrativeProps> = ({
  users,
  selectedUserEmail,
  onSelectUser,
  surfaceMode,
  onSurfaceChange,
  items,
  allItems,
  onSelectItem,
  activeItem,
  selectedTheme: propTheme,
  onSelectTheme: propOnSelectTheme,
  minTimestamp,
  maxTimestamp,
  selectedStartTime,
  onStartTimeChange,
}) => {
  const [internalTheme, setInternalTheme] = useState<EditorialTheme>(() => {
    const saved = localStorage.getItem('ge_portal_theme') as EditorialTheme;
    if (saved && ['cloud', 'canvas', 'legal', 'dark'].includes(saved)) {
      return saved;
    }
    return 'cloud';
  });

  const selectedTheme = propTheme || internalTheme;
  const currentTheme = THEMES[selectedTheme] || THEMES.cloud;

  const handleSelectTheme = (themeKey: EditorialTheme) => {
    if (propOnSelectTheme) {
      propOnSelectTheme(themeKey);
    } else {
      setInternalTheme(themeKey);
      localStorage.setItem('ge_portal_theme', themeKey);
    }
    setThemeDropdownOpen(false);
  };

  const [expandedReasoning, setExpandedReasoning] = useState<Record<string, boolean>>({});
  const toggleReasoning = (key: string) => setExpandedReasoning((prev) => ({ ...prev, [key]: !prev[key] }));
  const [themeDropdownOpen, setThemeDropdownOpen] = useState(false);
  const [sessionSearch, setSessionSearch] = useState('');
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    sources: true,
    chat: true,
    studio: true,
    turns: true,
    inbound: true,
    outputs: true,
  });
  const [selectedEvidence, setSelectedEvidence] = useState<EvidenceSelection | null>(null);

  const toggleSection = (key: string) => {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const filteredSessions = useMemo(() => {
    return items.filter((item) => matchesQuery(item, sessionSearch));
  }, [items, sessionSearch]);

  const isNotebook = activeItem?.surface === 'NOTEBOOK_LM';

  const surfaceCounts = useMemo(() => {
    const pool = allItems ?? items;
    let notebook = 0;
    let chat = 0;
    for (const i of pool) {
      if (selectedUserEmail && i.user_email.toLowerCase() !== selectedUserEmail.toLowerCase()) continue;
      if (i.surface === 'NOTEBOOK_LM') notebook++;
      else chat++;
    }
    return { notebook, chat };
  }, [allItems, items, selectedUserEmail]);

  const active = useMemo(() => ({
    sources: ensureArray<NotebookSourceRecord>(activeItem?.notebook_sources),
    chats: ensureArray<NotebookChatRecord>(activeItem?.notebook_chats),
    studio: ensureArray<NotebookStudioRecord>(activeItem?.notebook_studio).filter(
      (st) =>
        Boolean(
          st.lifecycle_state === 'REQUESTED' ||
          st.lifecycle_state === 'PROCESSING' ||
          st.lifecycle_state === 'GENERATING' ||
          st.lifecycle_state === 'FAILED' ||
          st.gcs_uri ||
          st.note_content ||
          st.quiz_data ||
          st.flashcards_data ||
          st.mind_map_data ||
          st.customization_prompt ||
          st.user_steering_prompt ||
          st.artifact_title
        )
    ),
    turns: ensureArray<ProcessedLogRecord>(activeItem?.chat_turns),
  }), [activeItem]);

  const chatCitations = useMemo(
    () => active.turns.flatMap((t) => ensureArray<GroundedCitation>(t.citations)),
    [active.turns]
  );

  const inboundArtifacts = useMemo(
    () =>
      active.turns.flatMap((t) =>
        ensureArray<ArtifactFile>(t.input_artifacts).map((a) => ({
          ...a,
          assetKind: 'INPUT' as const,
        }))
      ),
    [active.turns]
  );

  const outputArtifacts = useMemo(
    () =>
      active.turns.flatMap((t) =>
        ensureArray<ArtifactFile>(t.output_artifacts).map((a) => ({
          ...a,
          assetKind: 'OUTPUT' as const,
        }))
      ),
    [active.turns]
  );

  const allSessionAssets = useMemo(() => {
    const combined = [...inboundArtifacts, ...outputArtifacts];
    const seen = new Set<string>();
    const deduplicated: typeof combined = [];
    for (const asset of combined) {
      const key = asset.gcs_uri || asset.file_name || asset.file_id || `${asset.assetKind}_${deduplicated.length}`;
      if (!seen.has(key)) {
        seen.add(key);
        deduplicated.push(asset);
      }
    }
    return deduplicated;
  }, [inboundArtifacts, outputArtifacts]);

  return (
    <div className={`flex-1 flex h-full w-full overflow-hidden select-none relative ${currentTheme.containerClass}`}>
      {/* Ambient Lighting Depth Layer for Frosted Glass Refraction */}
      {currentTheme.ambientClass && <div aria-hidden className={currentTheme.ambientClass} />}

      {/* Universal Top Toolbar with Surface Switcher & Theme Selector */}
      <div className="flex-1 flex overflow-hidden relative z-10">
        {/* ========================================================================= */}
        {/* COLUMN 1: User & Session Rail */}
        {/* ========================================================================= */}
        <aside className={`w-64 border-r flex flex-col h-full shrink-0 select-none relative z-20 ${currentTheme.sidebarClass}`}>
          {/* Header */}
          <div className={`p-3 border-b space-y-2.5 shrink-0 relative z-30 ${currentTheme.sidebarHeaderClass}`}>
            <div className="flex items-center justify-between gap-2">
              <span className={`text-[10px] font-mono uppercase tracking-wider font-bold block truncate ${currentTheme.textMuted}`}>
                Workspaces
              </span>

              {/* Theme Dropdown */}
              <div className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => setThemeDropdownOpen(!themeDropdownOpen)}
                  className={`px-2.5 py-1 rounded-lg text-xs flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap ${currentTheme.themeSelectorBtnClass}`}
                  title="Switch UI Theme"
                >
                  <Palette className="w-3.5 h-3.5" />
                  <span className="text-[11px]">{currentTheme.name}</span>
                  <ChevronDown className="w-2.5 h-2.5 opacity-60" />
                </button>

                {themeDropdownOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-40 cursor-default"
                      onClick={() => setThemeDropdownOpen(false)}
                      aria-hidden="true"
                    />
                    <div className={`absolute right-0 top-full mt-1.5 w-44 border rounded-xl shadow-2xl z-50 py-1 ${currentTheme.menuClass}`}>
                      {(Object.keys(THEMES) as EditorialTheme[]).map((themeKey) => {
                        const t = THEMES[themeKey];
                        const isActive = selectedTheme === themeKey;
                        return (
                          <button
                            key={themeKey}
                            onClick={() => handleSelectTheme(themeKey)}
                            className={`w-full text-left px-3 py-2 flex items-center justify-between text-xs transition cursor-pointer ${currentTheme.menuItemHover} ${
                              isActive ? currentTheme.menuItemActive : currentTheme.menuItemInactive
                            }`}
                          >
                            <span className={isActive ? 'font-bold' : 'font-medium'}>{t.name}</span>
                            {isActive && <Check className={`w-3.5 h-3.5 shrink-0 ${currentTheme.accentText}`} />}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Surface Mode Toggle */}
            <div className={`grid grid-cols-2 gap-1 font-sans text-[11px] select-none ${currentTheme.segmentedTrackClass}`}>
              <button
                type="button"
                onClick={() => onSurfaceChange('GEMINI_ENTERPRISE_CHAT')}
                className={`py-1.5 px-2 rounded-md transition cursor-pointer flex items-center justify-center gap-1.5 ${
                  surfaceMode === 'GEMINI_ENTERPRISE_CHAT'
                    ? currentTheme.segmentedActiveClass
                    : currentTheme.segmentedInactiveClass
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Chats ({surfaceCounts.chat})</span>
              </button>
              <button
                type="button"
                onClick={() => onSurfaceChange('NOTEBOOK_LM')}
                className={`py-1.5 px-2 rounded-md transition cursor-pointer flex items-center justify-center gap-1.5 ${
                  surfaceMode === 'NOTEBOOK_LM'
                    ? currentTheme.segmentedActiveClass
                    : currentTheme.segmentedInactiveClass
                }`}
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>Notebooks ({surfaceCounts.notebook})</span>
              </button>
            </div>

            {/* User Filter Picker */}
            <div className="space-y-1">
              <label className={`text-[10px] font-mono uppercase tracking-wider font-bold block ${currentTheme.textMuted}`}>
                Filter by User ({users.length}):
              </label>
              <select
                value={selectedUserEmail || ''}
                onChange={(e) => onSelectUser(e.target.value || null)}
                className={`w-full p-1.5 border rounded-lg text-xs font-sans focus:outline-none transition cursor-pointer ${currentTheme.cardClass} ${currentTheme.textPrimary}`}
              >
                <option value="">All Users ({users.length})</option>
                {users.map((c) => (
                  <option key={c.email} value={c.email}>
                    {c.display_name} ({c.email})
                  </option>
                ))}
              </select>
            </div>

            {/* Date & Time Range Scrubber */}
            {minTimestamp !== undefined && maxTimestamp !== undefined && selectedStartTime !== undefined && onStartTimeChange && (
              <DateRangeSlider
                minTimestamp={minTimestamp}
                maxTimestamp={maxTimestamp}
                selectedStartTime={selectedStartTime}
                onStartTimeChange={onStartTimeChange}
                theme={currentTheme}
                totalEventsCount={allItems?.length || items.length}
                filteredEventsCount={filteredSessions.length}
              />
            )}

            {/* Session Search Input */}
            <div className="relative">
              <Search className={`w-3.5 h-3.5 absolute left-2.5 top-2 ${currentTheme.textMuted}`} />
              <input
                type="text"
                placeholder="Filter sessions..."
                value={sessionSearch}
                onChange={(e) => setSessionSearch(e.target.value)}
                className={`w-full pl-8 pr-2 py-1 border rounded-lg text-xs font-sans focus:outline-none ${currentTheme.cardClass} ${currentTheme.textPrimary}`}
              />
            </div>
          </div>

          {/* Sessions List */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
            {filteredSessions.length === 0 ? (
              <div className={`p-4 text-center text-xs ${currentTheme.textMuted}`}>
                No active records match the filter criteria.
              </div>
            ) : (
              filteredSessions.map((item) => {
                const isSelected = activeItem?.id === item.id;
                return (
                  <div
                    key={item.id}
                    onClick={() => {
                      onSelectItem(item.id);
                      setSelectedEvidence(null);
                    }}
                    className={`p-2.5 rounded-xl border transition cursor-pointer space-y-1.5 select-none ${
                      isSelected
                        ? currentTheme.cardSelectedClass
                        : `${currentTheme.cardClass} ${currentTheme.cardHoverClass}`
                    }`}
                  >
                    <div className="flex items-center justify-between text-[10px] font-mono">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className={`font-bold truncate max-w-[110px] ${currentTheme.textPrimary}`}>
                          {item.user_name || item.user_email}
                        </span>
                        {(() => {
                          const badge = getAgentBadge(item);
                          if (!badge) return null;
                          return (
                            <span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-medium shrink-0 ${badge.classes}`}>
                              {badge.label}
                            </span>
                          );
                        })()}
                      </div>
                      <span className={currentTheme.textMuted}>
                        {item.timestamp ? formatRelativeTime(item.timestamp) || formatEasternDateTime(item.timestamp) : ''}
                      </span>
                    </div>

                    <h4 className={`text-xs ${currentTheme.headingFont} line-clamp-2 leading-snug ${currentTheme.textPrimary}`}>
                      {item.title}
                    </h4>

                    <div className="flex items-center justify-between text-[10px] font-mono">
                      <span className={currentTheme.textMuted}>
                        {item.surface === 'NOTEBOOK_LM'
                          ? `${item.artifacts_count.sources} sources · ${item.turn_count} turns`
                          : `${item.turn_count} chat turns`}
                      </span>
                      {item.artifacts_count.output > 0 && (
                        <span className="inline-flex items-center gap-0.5 text-emerald-700 font-semibold">
                          <Sparkles className="w-2.5 h-2.5" />
                          {item.artifacts_count.output}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </aside>

        {/* ========================================================================= */}
        {/* COLUMN 2: Structural Facets & Artifacts */}
        {/* ========================================================================= */}
        <div className={`w-80 border-r flex flex-col h-full shrink-0 select-none overflow-hidden ${currentTheme.sidebarClass}`}>
          {/* Header */}
          <div className={`p-3 border-b flex items-center justify-between shrink-0 ${currentTheme.sidebarHeaderClass}`}>
            <div className="min-w-0 flex-1">
              <span className={`text-[10px] font-mono uppercase tracking-wider font-bold block ${currentTheme.textMuted}`}>
                {isNotebook ? 'Notebook Artifacts' : 'Chat Sequence Facets'}
              </span>
              <h3 className={`${currentTheme.headingFont} text-xs truncate ${currentTheme.textPrimary}`}>
                {activeItem?.title || 'No Selection'}
              </h3>
            </div>
          </div>

          {/* Facets Tree Content */}
          <div className="flex-1 flex flex-col min-h-0 p-2 space-y-2 overflow-y-auto">
            {isNotebook ? (
              <>
                {/* 1. Grounded Sources Accordion */}
                <div className={`rounded-xl border overflow-hidden shadow-2xs flex flex-col ${expandedSections.sources ? 'flex-initial max-h-[calc(100vh-260px)]' : 'shrink-0'} ${currentTheme.cardClass}`}>
                  <button
                    onClick={() => toggleSection('sources')}
                    className={`w-full p-2.5 flex items-center justify-between border-b text-xs shrink-0 ${currentTheme.headingFont} cursor-pointer transition select-none ${currentTheme.sidebarHeaderClass} ${currentTheme.textPrimary}`}
                  >
                    <div className="flex items-center gap-2">
                      <BookOpen className={`w-3.5 h-3.5 ${currentTheme.accentText}`} />
                      <span>Grounded Ingested Sources ({active.sources.length})</span>
                    </div>
                    {expandedSections.sources ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                  </button>

                  {expandedSections.sources && (
                    <div className="p-1.5 space-y-1 overflow-y-auto max-h-72">
                      {active.sources.map((source, idx) => (
                        <div
                          key={source.source_id || idx}
                          onClick={() => setSelectedEvidence({ type: 'SOURCE', source, index: idx })}
                          className={`p-2 rounded-lg border border-transparent transition cursor-pointer space-y-1 text-left ${currentTheme.cardHoverClass}`}
                        >
                          <div className="flex items-center gap-1.5">
                            {((source as any).source_kind === 'WEB_URL' || source.source_type === 'WEB_URL') ? (
                              <Globe className={`w-3.5 h-3.5 shrink-0 ${currentTheme.accentText}`} />
                            ) : (
                              <FileText className={`w-3.5 h-3.5 shrink-0 ${currentTheme.accentText}`} />
                            )}
                            <span className={`${currentTheme.headingFont} text-xs truncate ${currentTheme.textPrimary}`}>
                              {source.source_title || 'Ingested Source'}
                            </span>
                          </div>
                          <p className={`text-[10px] line-clamp-1 leading-normal ${currentTheme.textSecondary}`}>
                            {source.content_preview ||
                              (source.word_count
                                ? `${source.word_count.toLocaleString()} words · ${(source.original_url || (source as any).source_url) ? (source.original_url || (source as any).source_url).replace(/^https?:\/\//, '').split('/')[0] : (source as any).source_kind || source.source_type || 'Source'}`
                                : (source.original_url || (source as any).source_url)
                                ? (source.original_url || (source as any).source_url).replace(/^https?:\/\//, '').split('/')[0]
                                : (source as any).source_kind || source.source_type || 'Ingested Source')}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 2. Conversational Turns Accordion */}
                <div className={`rounded-xl border overflow-hidden shadow-2xs flex flex-col ${expandedSections.chat ? 'flex-initial max-h-[calc(100vh-260px)]' : 'shrink-0'} ${currentTheme.cardClass}`}>
                  <button
                    onClick={() => toggleSection('chat')}
                    className={`w-full p-2.5 flex items-center justify-between border-b text-xs shrink-0 ${currentTheme.headingFont} cursor-pointer transition select-none ${currentTheme.sidebarHeaderClass} ${currentTheme.textPrimary}`}
                  >
                    <div className="flex items-center gap-2">
                      <MessageSquare className={`w-3.5 h-3.5 ${currentTheme.accentText}`} />
                      <span>Notebook Chat Turns ({active.chats.length})</span>
                    </div>
                    {expandedSections.chat ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                  </button>

                  {expandedSections.chat && (
                    <div className="p-1.5 space-y-1 overflow-y-auto max-h-72">
                      {active.chats.length === 0 ? (
                        <div className={`p-3 rounded-lg border text-[11px] leading-relaxed ${currentTheme.quoteBox} ${currentTheme.textSecondary}`}>
                          NotebookLM conversational text is scrubbed at the platform layer and has no public session read API.
                        </div>
                      ) : (
                        active.chats.map((turn, idx) => (
                          <div
                            key={turn.turn_id || idx}
                            onClick={() => setSelectedEvidence({ type: 'CHAT_TURN', turn, turnNumber: idx + 1 })}
                            className={`p-2 rounded-lg border border-transparent transition cursor-pointer space-y-1 text-left ${currentTheme.cardHoverClass}`}
                          >
                            <div className="flex items-center justify-between text-[10px] font-mono">
                              <span className={`font-bold ${currentTheme.accentText}`}>Turn #{idx + 1}</span>
                              <span className={currentTheme.textMuted}>
                                {turn.citations?.length || 0} citations
                              </span>
                            </div>
                            <p className={`text-xs ${currentTheme.headingFont} line-clamp-1 ${currentTheme.textPrimary}`}>
                              “{turn.user_query}”
                            </p>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>

                {/* 3. Studio Outputs Accordion */}
                <div className={`rounded-xl border overflow-hidden shadow-2xs flex flex-col ${expandedSections.studio ? 'flex-initial max-h-[calc(100vh-260px)]' : 'shrink-0'} ${currentTheme.cardClass}`}>
                  <button
                    onClick={() => toggleSection('studio')}
                    className={`w-full p-2.5 flex items-center justify-between border-b text-xs shrink-0 ${currentTheme.headingFont} cursor-pointer transition select-none ${currentTheme.sidebarHeaderClass} ${currentTheme.textPrimary}`}
                  >
                    <div className="flex items-center gap-2">
                      <Layers className={`w-3.5 h-3.5 ${currentTheme.accentText}`} />
                      <span>Studio Outputs & Notes ({active.studio.length})</span>
                    </div>
                    {expandedSections.studio ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                  </button>

                  {expandedSections.studio && (
                    <div className="p-1.5 space-y-1 overflow-y-auto max-h-72">
                      {active.studio.map((st, idx) => {
                        const modality = detectStudioModality(st);
                        return (
                          <div
                            key={st.artifact_id || idx}
                            onClick={() =>
                              setSelectedEvidence({ type: 'STUDIO_NOTE', studio: st, index: idx })
                            }
                            className={`p-2 rounded-lg border border-transparent transition cursor-pointer space-y-1 text-left ${currentTheme.cardHoverClass}`}
                          >
                            <div className="flex items-center gap-1.5 min-w-0">
                              {renderModalityIcon(st, `w-3.5 h-3.5 shrink-0 ${currentTheme.accentText}`)}
                              <span className={`${currentTheme.headingFont} text-xs truncate ${currentTheme.textPrimary}`}>
                                {st.title}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className={`text-[9px] font-mono block ${currentTheme.textMuted}`}>
                                {formatStudioModalityLabel(modality)}
                              </span>
                              {(st.lifecycle_state === 'REQUESTED' || st.lifecycle_state === 'PROCESSING' || st.lifecycle_state === 'GENERATING') && st.artifact_type !== 'STUDIO_NOTE' && !String(st.artifact_id || '').startsWith('note-') && (
                                <span className="inline-flex items-center gap-0.5 text-[8px] font-mono px-1 py-0.2 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 animate-pulse">
                                  <Loader2 className="w-2 h-2 animate-spin" />
                                  <span>Gen...</span>
                                </span>
                              )}
                              {st.lifecycle_state === 'FAILED' && (
                                <span className="inline-flex items-center gap-0.5 text-[8px] font-mono px-1 py-0.2 rounded bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30">
                                  <span>Failed</span>
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                {/* 1. Chat Turns Chronology */}
                <div className={`rounded-xl border overflow-hidden shadow-2xs flex flex-col ${expandedSections.turns ? 'flex-initial max-h-[calc(100vh-260px)]' : 'shrink-0'} ${currentTheme.cardClass}`}>
                  <button
                    onClick={() => toggleSection('turns')}
                    className={`w-full p-2.5 flex items-center justify-between border-b text-xs shrink-0 ${currentTheme.headingFont} cursor-pointer transition select-none ${currentTheme.sidebarHeaderClass} ${currentTheme.textPrimary}`}
                  >
                    <div className="flex items-center gap-2">
                      <MessageSquare className={`w-3.5 h-3.5 ${currentTheme.accentText}`} />
                      <span>Sequential Chat Turns ({active.turns.length})</span>
                    </div>
                    {expandedSections.turns ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                  </button>

                  {expandedSections.turns && (
                    <div className="p-1.5 space-y-1 overflow-y-auto max-h-72">
                      {active.turns.map((turn, idx) => (
                        <div
                          key={turn.insert_id || idx}
                          onClick={() => setSelectedEvidence({ type: 'CHAT_TURN', turn, turnNumber: idx + 1 })}
                          className={`p-2 rounded-lg border border-transparent transition cursor-pointer space-y-1 text-left ${currentTheme.cardHoverClass}`}
                        >
                          <div className="flex items-center justify-between text-[10px] font-mono">
                            <span className={`font-bold ${currentTheme.accentText}`}>Turn #{idx + 1}</span>
                            <span className={currentTheme.textMuted}>
                              {turn.timestamp ? formatEasternDateTime(turn.timestamp) : ''}
                            </span>
                          </div>
                          <p className={`text-xs ${currentTheme.headingFont} line-clamp-1 ${currentTheme.textPrimary}`}>
                            “{turn.input_text}”
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Grounded Citations */}
                <div className={`rounded-xl border overflow-hidden shadow-2xs flex flex-col ${expandedSections.inbound ? 'flex-initial max-h-[calc(100vh-260px)]' : 'shrink-0'} ${currentTheme.cardClass}`}>
                  <button
                    onClick={() => toggleSection('inbound')}
                    className={`w-full p-2.5 flex items-center justify-between border-b text-xs shrink-0 ${currentTheme.headingFont} cursor-pointer transition select-none ${currentTheme.sidebarHeaderClass} ${currentTheme.textPrimary}`}
                  >
                    <div className="flex items-center gap-2">
                      <Globe className={`w-3.5 h-3.5 ${currentTheme.accentText}`} />
                      <span>Grounded Citations ({chatCitations.length})</span>
                    </div>
                    {expandedSections.inbound ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                  </button>

                  {expandedSections.inbound && (
                    <div className="p-1.5 space-y-1 overflow-y-auto max-h-72">
                      {chatCitations.length === 0 ? (
                        <div className="p-3 text-center text-[11px] text-zinc-400">
                          No external web or email citations referenced.
                        </div>
                      ) : (
                        chatCitations.map((citation, idx) => {
                          const isMail = citation.source_uri?.includes('mail.google.com');
                          return (
                            <div
                              key={idx}
                              onClick={() => setSelectedEvidence({ type: 'CITATION', citation, index: idx })}
                              className={`p-2 rounded-lg border border-transparent transition cursor-pointer space-y-1 text-left ${currentTheme.cardHoverClass}`}
                            >
                              <div className="flex items-center justify-between gap-1.5">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <Globe className={`w-3.5 h-3.5 shrink-0 ${currentTheme.accentText}`} />
                                  <span className={`${currentTheme.headingFont} text-xs truncate ${currentTheme.textPrimary}`}>
                                    {citation.title || 'Citation Reference'}
                                  </span>
                                </div>
                                <span className="text-[8px] font-mono font-bold px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-700 dark:text-amber-300 shrink-0">
                                  {isMail ? 'Gmail' : 'Web'}
                                </span>
                              </div>
                              <p className={`text-[10px] line-clamp-2 leading-relaxed ${currentTheme.textSecondary}`}>
                                {citation.snippet || citation.source_uri || '-'}
                              </p>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>

                {/* 3. Preserved Session Assets & Files (Input & Output) */}
                <div className={`rounded-xl border overflow-hidden shadow-2xs flex flex-col ${expandedSections.outputs ? 'flex-initial max-h-[calc(100vh-260px)]' : 'shrink-0'} ${currentTheme.cardClass}`}>
                  <button
                    onClick={() => toggleSection('outputs')}
                    className={`w-full p-2.5 flex items-center justify-between border-b text-xs shrink-0 ${currentTheme.headingFont} cursor-pointer transition select-none ${currentTheme.sidebarHeaderClass} ${currentTheme.textPrimary}`}
                  >
                    <div className="flex items-center gap-2">
                      <Sparkles className={`w-3.5 h-3.5 ${currentTheme.accentText}`} />
                      <span>Session Assets & Files ({allSessionAssets.length})</span>
                    </div>
                    {expandedSections.outputs ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                  </button>

                  {expandedSections.outputs && (
                    <div className="p-1.5 space-y-1 overflow-y-auto max-h-72">
                      {allSessionAssets.length === 0 ? (
                        <div className="p-3 text-center text-[11px] text-zinc-400">
                          No inbound or generated files in this session.
                        </div>
                      ) : (
                        allSessionAssets.map((art, idx) => {
                          const isAudio = art.file_name?.endsWith('.mp3') || art.file_name?.endsWith('.wav') || art.mime_type?.startsWith('audio/');
                          const isVideo = art.file_name?.endsWith('.mp4') || art.mime_type?.startsWith('video/');
                          const isImg = art.file_name?.endsWith('.png') || art.mime_type?.startsWith('image/');
                          const isPdf = art.file_name?.endsWith('.pdf') || art.mime_type?.includes('pdf');
                          const isSlides = art.file_name?.includes('slides') || art.file_name?.endsWith('.pptx') || art.file_name?.endsWith('.html') || art.mime_type?.includes('html');
                          const isInput = art.assetKind === 'INPUT';

                          return (
                            <div
                              key={idx}
                              onClick={() =>
                                setSelectedEvidence({
                                  type: 'ARTIFACT',
                                  title: art.file_name,
                                  mediaType: isAudio ? 'AUDIO' : isVideo ? 'VIDEO' : isImg ? 'IMAGE' : isPdf ? 'PDF' : isSlides ? 'SLIDES' : 'FILE',
                                  gcs_uri: art.gcs_uri,
                                  preview_url: art.preview_url,
                                  web_url: art.web_url,
                                  size_bytes: art.size_bytes,
                                  sha256: art.sha256,
                                  crc32c: art.crc32c,
                                  snippet: art.snippet,
                                  assetKind: art.assetKind,
                                })
                              }
                              className={`p-2 rounded-lg border border-transparent transition cursor-pointer space-y-1 text-left ${currentTheme.cardHoverClass}`}
                            >
                              <div className="flex items-center justify-between gap-1.5">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  {isAudio ? (
                                    <Headphones className={`w-3.5 h-3.5 shrink-0 ${currentTheme.accentText}`} />
                                  ) : isVideo ? (
                                    <Video className={`w-3.5 h-3.5 shrink-0 ${currentTheme.accentText}`} />
                                  ) : isImg ? (
                                    <ImageIcon className={`w-3.5 h-3.5 shrink-0 ${currentTheme.accentText}`} />
                                  ) : isSlides ? (
                                    <Presentation className={`w-3.5 h-3.5 shrink-0 ${currentTheme.accentText}`} />
                                  ) : (
                                    <FileText className={`w-3.5 h-3.5 shrink-0 ${currentTheme.accentText}`} />
                                  )}
                                  <span className={`${currentTheme.headingFont} text-xs truncate ${currentTheme.textPrimary}`}>
                                    {art.file_name}
                                  </span>
                                </div>
                                <span
                                  className={`text-[8px] font-mono font-bold px-1.5 py-0.2 rounded shrink-0 ${
                                    isInput
                                      ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                                      : 'bg-sky-500/20 text-sky-700 dark:text-sky-300'
                                  }`}
                                >
                                  {isInput ? 'INPUT' : 'OUTPUT'}
                                </span>
                              </div>
                              <div className="flex items-center justify-between text-[9px] font-mono text-zinc-400">
                                <span>{art.mime_type || (isPdf ? 'application/pdf' : 'asset')}</span>
                                {art.size_bytes ? <span>{Math.round(art.size_bytes / 1024)} KB</span> : null}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* ========================================================================= */}
        {/* COLUMN 3: Deep Evidence & Continuous Reading Canvas */}
        {/* ========================================================================= */}
        <main className={`flex-1 min-h-0 min-w-0 flex flex-col h-full overflow-hidden relative ${currentTheme.mainBgClass}`}>
          {!activeItem ? (
            <div className="flex-1 min-h-0 flex items-center justify-center p-8 text-center select-none">
              <div className={`flex flex-col items-center max-w-sm p-8 rounded-3xl border shadow-xl ${currentTheme.cardClass}`}>
                <div className={`w-14 h-14 rounded-2xl border flex items-center justify-center mb-4 shadow-inner ${currentTheme.quoteBox}`}>
                  <BookOpen className={`w-6 h-6 ${currentTheme.accentText}`} />
                </div>
                <h3 className={`${currentTheme.headingFont} text-base mb-1.5 ${currentTheme.textPrimary}`}>
                  No Matter Selected
                </h3>
                <p className={`text-xs leading-relaxed ${currentTheme.textSecondary}`}>
                  Select a compliance workspace session from the left rail to inspect conversational turns, grounded sources, and archived assets.
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Header Banner */}
              <div className={`px-6 py-3.5 border-b flex items-start justify-between shrink-0 shadow-2xs ${currentTheme.mainHeaderClass}`}>
                <div className="space-y-1.5 max-w-3xl">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[10px] font-mono uppercase tracking-wider px-2.5 py-0.5 rounded-full border font-bold ${currentTheme.badgePill}`}>
                      {activeItem.surface === 'NOTEBOOK_LM' ? 'NOTEBOOKS' : 'CHAT'}
                    </span>
                    <span className={`text-xs font-mono px-2 py-0.5 rounded border ${currentTheme.quoteBox}`}>
                      STREAM ID: <strong className={currentTheme.textPrimary}>{activeItem.id}</strong>
                    </span>
                    {selectedEvidence && (
                      <button
                        onClick={() => setSelectedEvidence(null)}
                        className={`inline-flex items-center gap-1 text-[10px] font-sans font-semibold px-2 py-0.5 rounded-md border transition cursor-pointer ${currentTheme.cardClass} ${currentTheme.accentText}`}
                      >
                        <ArrowLeft className="w-3 h-3" />
                        <span>Back to Full Brief</span>
                      </button>
                    )}
                  </div>

                  <h1 className={`${currentTheme.headingFont} text-lg leading-tight ${currentTheme.textPrimary}`}>
                    {activeItem.title}
                  </h1>

                  <div className={`flex items-center gap-3 text-xs ${currentTheme.bodyFont} ${currentTheme.textSecondary} flex-wrap`}>
                    <span>
                      User: <strong className={currentTheme.textPrimary}>{activeItem.user_email || activeItem.user_name || 'Unattributed'}</strong>
                    </span>
                    {activeItem.timestamp && (
                      <>
                        <span>•</span>
                        <span>Archived: {formatTimestampWithRelative(activeItem.timestamp)}</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Export Action */}
                <div className="flex items-center shrink-0">
                  <button
                    onClick={() => window.print()}
                    className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border text-xs font-sans font-semibold transition cursor-pointer shadow-2xs ${currentTheme.cardClass} ${currentTheme.cardHoverClass} ${currentTheme.accentText}`}
                    title="Export or print this brief as a clean PDF"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Export Brief (PDF)</span>
                  </button>
                </div>
              </div>

              {/* Reading Column Canvas */}
              <div className="flex-1 overflow-y-auto px-8 py-6 w-full space-y-6">
            {/* SCENARIO A: SPECIFIC EVIDENCE ITEM IS SELECTED */}
            {selectedEvidence?.type === 'SOURCE' && (() => {
              const src = selectedEvidence.source;
              const meta = typeof src.metadata === 'string'
                ? (() => {
                    try {
                      return JSON.parse(src.metadata || '{}');
                    } catch {
                      return {};
                    }
                  })()
                : ((src.metadata as Record<string, any>) || {});
              const rawUrl = src.original_url || src.source_url || meta.webpageMetadata?.webpageUrl || meta.webpage_metadata?.webpageUrl || '';
              const safeRawUrl = sanitizeExternalUrl(rawUrl);
              const rawDriveFileId = String(meta.driveFileId || meta.drive_file_id || meta.driveMetadata?.driveFileId || '').trim();
              const driveFileId = /^[A-Za-z0-9_-]+$/.test(rawDriveFileId) ? rawDriveFileId : '';
              const srcKindUpper = (src.source_kind || src.source_type || '').toUpperCase();
              const isDrive =
                srcKindUpper === 'GOOGLE_DOC' ||
                srcKindUpper === 'GOOGLE_SLIDES' ||
                Boolean(driveFileId) ||
                Boolean(safeRawUrl && /^https:\/\/(docs|drive)\.google\.com\//i.test(safeRawUrl));
              const isWeb = !isDrive && (srcKindUpper === 'WEB_URL' || srcKindUpper === 'YOUTUBE' || Boolean(safeRawUrl));
              const isDirectUpload = !isDrive && !isWeb;
              const crawlReason = meta.crawlFailureReason || meta.crawl_failure_reason;
              const isPdfSource = Boolean(
                src.gcs_uri &&
                (src.mime_type === 'application/pdf' ||
                  src.mime_type?.toLowerCase().includes('pdf') ||
                  getCleanExtension(src.gcs_uri).endsWith('.pdf') ||
                  ['PDF', 'DISCOVERED_PDF', 'GOOGLE_DOC', 'GOOGLE_SLIDES'].includes(srcKindUpper))
              );
              const resolvedByteSize = src.byte_size ?? meta.byteSize;
              const resolvedHash = src.sha256_hash || meta.crc32cHash;

              // YouTube video embed ID
              const ytMatch = (safeRawUrl || '').match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
              const ytId = ytMatch ? ytMatch[1] : null;

              // Derive Drive Link
              const driveLink = safeRawUrl || (driveFileId ? `https://drive.google.com/open?id=${encodeURIComponent(driveFileId)}` : undefined);
              const driveExportLink = driveFileId ? `https://docs.google.com/document/d/${encodeURIComponent(driveFileId)}/export?format=pdf` : undefined;

              return (
                <article className={`p-6 rounded-2xl border space-y-4 shadow-xs ${currentTheme.cardClass}`}>
                  <div className="flex items-center justify-between border-b pb-3">
                    <div className="flex items-center gap-2">
                      <BookOpen className={`w-5 h-5 ${currentTheme.accentText}`} />
                      <span className={`text-xs font-mono font-bold uppercase ${currentTheme.accentText}`}>
                        Ingested Grounding Source Evidence
                      </span>
                    </div>
                    <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${currentTheme.badgePill}`}>
                      {isDrive ? 'Google Workspace' : isWeb ? 'Web Source' : 'Direct Upload'}
                    </span>
                  </div>

                  <h2 className={`${currentTheme.headingFont} text-xl leading-snug ${currentTheme.textPrimary}`}>
                    {src.source_title}
                  </h2>

                  {/* YouTube Embed if applicable */}
                  {ytId && (
                    <div className="rounded-xl overflow-hidden border aspect-video w-full bg-black/90 shadow-md">
                      <iframe
                        src={`https://www.youtube.com/embed/${ytId}`}
                        title={src.source_title}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        className="w-full h-full border-0"
                      />
                    </div>
                  )}

                  {/* 3-WAY MODALITY HANDLING */}
                  {/* Mode 1: Google Drive Sources */}
                  {isDrive && (
                    <div className="space-y-3">
                      <div className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 ${currentTheme.quoteBox}`}>
                        <div className="min-w-0 pr-2">
                          <span className={`text-[10px] font-mono uppercase tracking-wider block font-bold ${currentTheme.textMuted}`}>
                            Google Drive Document:
                          </span>
                          <span className="text-xs font-mono truncate block text-blue-600 dark:text-blue-400">
                            {driveLink || `Drive ID: ${driveFileId || 'Ingested Document'}`}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {driveLink && (
                            <a
                              href={driveLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={`p-2 rounded-lg border flex items-center gap-1 text-xs font-sans font-medium transition ${currentTheme.cardClass} ${currentTheme.cardHoverClass}`}
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                              <span>Open in Drive</span>
                            </a>
                          )}
                          {(src.gcs_uri || driveExportLink) && (
                            <a
                              href={src.gcs_uri ? getDirectMediaUrl(src.gcs_uri) : driveExportLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={`p-2 rounded-lg border flex items-center gap-1.5 text-xs font-sans font-semibold transition ${currentTheme.accentBtn}`}
                            >
                              <Download className="w-3.5 h-3.5" />
                              <span>Download PDF Export</span>
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Mode 2: Web URLs */}
                  {isWeb && (
                    <div className="space-y-3">
                      {safeRawUrl && (
                        <div className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 ${currentTheme.quoteBox}`}>
                          <div className="min-w-0 pr-2">
                            <span className={`text-[10px] font-mono uppercase tracking-wider block font-bold ${currentTheme.textMuted}`}>
                              Preserved Origin Link:
                            </span>
                            <span className="text-xs font-mono truncate block text-blue-600 dark:text-blue-400">
                              {safeRawUrl}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <a
                              href={safeRawUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={`p-2 rounded-lg border flex items-center gap-1 text-xs font-sans font-medium transition ${currentTheme.cardClass} ${currentTheme.cardHoverClass}`}
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                              <span>Open Origin</span>
                            </a>
                            {src.gcs_uri && (
                              <a
                                href={getDirectMediaUrl(src.gcs_uri)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`p-2 rounded-lg border flex items-center gap-1.5 text-xs font-sans font-semibold transition ${currentTheme.accentBtn}`}
                              >
                                <Download className="w-3.5 h-3.5" />
                                <span>Download Snapshot</span>
                              </a>
                            )}
                          </div>
                        </div>
                      )}

                      {!src.gcs_uri && (
                        <div className={`p-3.5 rounded-xl border space-y-1 ${currentTheme.quoteBox}`}>
                          <div className="flex items-center gap-2 font-mono text-[10px] font-bold text-amber-600 dark:text-amber-400">
                            <Globe className="w-3.5 h-3.5 shrink-0" />
                            <span>External Grounding Reference Ingested Live</span>
                          </div>
                          <p className={`text-xs ${currentTheme.bodyFont} leading-relaxed ${currentTheme.textSecondary}`}>
                            {crawlReason
                              ? `External Snapshot: ${crawlReason}. Ingested live into the Active Grounding Index.`
                              : 'External Snapshot: Host protected by authentication/paywall or bot restriction. Ingested live as grounding reference.'}
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Mode 3: Direct File Uploads */}
                  {isDirectUpload && (
                    <div className={`p-4 rounded-xl border space-y-3 ${currentTheme.quoteBox}`}>
                      <div className="flex items-center justify-between">
                        <span className={`text-[10px] font-mono uppercase tracking-wider font-bold ${currentTheme.textMuted}`}>
                          Direct Upload Document Provenance
                        </span>
                        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-700 dark:text-emerald-300">
                          Active Grounding Index
                        </span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-mono text-[10px]">
                        <div>
                          <span className={`block font-semibold ${currentTheme.textMuted}`}>Filename</span>
                          <span className={`truncate block ${currentTheme.textPrimary}`}>{src.source_title}</span>
                        </div>
                        <div>
                          <span className={`block font-semibold ${currentTheme.textMuted}`}>Word Count</span>
                          <span className={currentTheme.textPrimary}>{src.word_count ? `${src.word_count.toLocaleString()} words` : (meta.wordCount ? `${meta.wordCount.toLocaleString()} words` : '-')}</span>
                        </div>
                        <div>
                          <span className={`block font-semibold ${currentTheme.textMuted}`}>Byte Size</span>
                          <span className={currentTheme.textPrimary}>{resolvedByteSize ? `${Math.round(resolvedByteSize / 1024)} KB (${resolvedByteSize.toLocaleString()} B)` : (src.token_count ? `${src.token_count} tokens` : '-')}</span>
                        </div>
                        <div>
                          <span className={`block font-semibold ${currentTheme.textMuted}`}>{src.sha256_hash ? 'SHA-256 Hash' : 'CRC32C Hash'}</span>
                          <span className="text-emerald-600 dark:text-emerald-400 font-mono text-[9px] truncate block">{resolvedHash || 'Verified on Ingestion'}</span>
                        </div>
                      </div>
                      {src.gcs_uri && (
                        <div className="pt-2">
                          <a
                            href={getDirectMediaUrl(src.gcs_uri)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`p-2 rounded-lg border inline-flex items-center gap-1.5 text-xs font-sans font-semibold transition ${currentTheme.accentBtn}`}
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>Download Preserved Archive</span>
                          </a>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Inline PDF Viewer when source binary is PDF or exported Google Workspace PDF */}
                  {isPdfSource && src.gcs_uri && (
                    <PresentationViewer
                      title={src.source_title || 'Archived Source Document'}
                      gcsUri={src.gcs_uri}
                      previewUrl={getDirectMediaUrl(src.gcs_uri)}
                      mimeType={src.mime_type || 'application/pdf'}
                      sizeBytes={resolvedByteSize}
                      sha256={src.sha256_hash}
                      theme={currentTheme}
                    />
                  )}

                  {/* Content Preview if available */}
                  {(src.full_content || src.content_preview) && (
                    <div className={`p-4 rounded-xl border leading-relaxed text-xs ${currentTheme.bodyFont} whitespace-pre-wrap ${currentTheme.quoteBox}`}>
                      {src.full_content || src.content_preview}
                    </div>
                  )}

                  {/* Provenance Footer */}
                  <div className={`p-3.5 rounded-xl border font-mono text-[10px] space-y-1.5 ${currentTheme.quoteBox}`}>
                    {src.gcs_uri ? (
                      <>
                        <div>Archive Location: <span className="font-semibold text-emerald-600 dark:text-emerald-400">{src.gcs_uri}</span></div>
                        <div>Storage Format: <span className="font-semibold text-emerald-600 dark:text-emerald-400">Cloud Storage Snapshot</span></div>
                      </>
                    ) : (
                      <>
                        <div>Source Type: <span className="font-semibold text-zinc-600 dark:text-zinc-400">External Web Reference (Origin Link Preserved)</span></div>
                        <div>Snapshot Status: <span className="font-semibold text-zinc-600 dark:text-zinc-400">Not Mirrored to Cloud Storage</span></div>
                      </>
                    )}
                    {src.word_count ? <div>Word Count: {src.word_count.toLocaleString()}</div> : null}
                    {src.event_time && (
                      <div>Source Ingest Timestamp: {formatTimestampWithRelative(src.event_time)}</div>
                    )}
                  </div>
                </article>
              );
            })()}

            {selectedEvidence?.type === 'CHAT_TURN' && (
              <article className={`p-6 rounded-2xl border space-y-4 shadow-xs ${currentTheme.cardClass}`}>
                <div className="flex items-center justify-between border-b pb-3">
                  <span className={`text-xs font-semibold ${currentTheme.accentText}`}>
                    Turn #{selectedEvidence.turnNumber}
                  </span>
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${currentTheme.badgePill}`}>
                    {'session_path' in selectedEvidence.turn ? 'Chat Turn' : 'Notebook Q&A'}
                  </span>
                </div>

                {'input_text' in selectedEvidence.turn ? (
                  <div className="space-y-4">
                    <div>
                      <span className={`text-xs font-semibold block ${currentTheme.textPrimary} mb-1.5`}>
                        User Prompt
                      </span>
                      <blockquote className={`p-4 rounded-xl border text-xs ${currentTheme.bodyFont} italic ${currentTheme.quoteBox}`}>
                        “{selectedEvidence.turn.input_text}”
                      </blockquote>
                    </div>

                    {/* Attached Inbound Assets / Uploads */}
                    {ensureArray<ArtifactFile>(selectedEvidence.turn.input_artifacts).length > 0 && (
                      <div className="space-y-2">
                        <span className={`text-xs font-semibold block ${currentTheme.textPrimary}`}>
                          Inbound Attachments ({ensureArray(selectedEvidence.turn.input_artifacts).length})
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          {ensureArray<ArtifactFile>(selectedEvidence.turn.input_artifacts).map((art, aIdx) => {
                            const isAudio = art.file_name?.endsWith('.mp3') || art.file_name?.endsWith('.wav') || art.mime_type?.startsWith('audio/');
                            const isPdf = art.file_name?.endsWith('.pdf') || art.mime_type?.includes('pdf');
                            return (
                              <div
                                key={aIdx}
                                onClick={() =>
                                  setSelectedEvidence({
                                    type: 'ARTIFACT',
                                    title: art.file_name,
                                    mediaType: isAudio ? 'AUDIO' : isPdf ? 'PDF' : 'FILE',
                                    gcs_uri: art.gcs_uri,
                                    web_url: art.web_url,
                                    size_bytes: art.size_bytes,
                                    sha256: art.sha256,
                                    snippet: art.snippet,
                                    assetKind: 'INPUT',
                                  })
                                }
                                className={`p-3 rounded-xl border flex items-center justify-between gap-3 transition cursor-pointer hover:border-emerald-500 shadow-2xs ${currentTheme.cardClass}`}
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                                    {isAudio ? <Headphones className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
                                  </div>
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                                        {isAudio ? 'Inbound Audio' : 'Inbound File'}
                                      </span>
                                      <span className={`text-xs font-semibold truncate ${currentTheme.headingFont} ${currentTheme.textPrimary}`}>
                                        {art.file_name}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-2 text-[10px] text-zinc-400 mt-0.5 font-mono">
                                      <span>{art.mime_type || (isAudio ? 'audio/mpeg' : isPdf ? 'application/pdf' : 'file')}</span>
                                      {art.size_bytes ? <span>• {Math.round(art.size_bytes / 1024)} KB</span> : null}
                                    </div>
                                  </div>
                                </div>
                                {art.gcs_uri && (
                                  <a
                                    href={getDirectMediaUrl(art.gcs_uri)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className="p-1.5 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-600 transition"
                                    title="Download preserved attachment"
                                  >
                                    <Download className="w-3.5 h-3.5" />
                                  </a>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Model Reasoning & Response */}
                    <div>
                      <span className={`text-xs font-semibold block ${currentTheme.accentText} mb-1.5`}>
                        Model Reasoning & Response
                      </span>
                      <div className={`p-4 rounded-xl border text-xs ${currentTheme.bodyFont} leading-relaxed ${currentTheme.cardClass}`}>
                        <MarkdownContent
                          content={selectedEvidence.turn.output_text}
                          theme={currentTheme}
                          onArtifactClick={(fileName) => {
                            const matched = allSessionAssets.find((a) => a.file_name === fileName);
                            if (matched) {
                              const isAudio = matched.file_name?.endsWith('.mp3') || matched.file_name?.endsWith('.wav') || matched.mime_type?.startsWith('audio/');
                              const isVideo = matched.file_name?.endsWith('.mp4') || matched.mime_type?.startsWith('video/');
                              const isImg = matched.file_name?.endsWith('.png') || matched.mime_type?.startsWith('image/');
                              const isPdf = matched.file_name?.endsWith('.pdf') || matched.mime_type?.includes('pdf');
                              const isSlides = matched.file_name?.includes('slides') || matched.file_name?.endsWith('.pptx') || matched.file_name?.endsWith('.html') || matched.mime_type?.includes('html');
                              setSelectedEvidence({
                                type: 'ARTIFACT',
                                title: matched.file_name,
                                mediaType: isAudio ? 'AUDIO' : isVideo ? 'VIDEO' : isImg ? 'IMAGE' : isPdf ? 'PDF' : isSlides ? 'SLIDES' : 'FILE',
                                gcs_uri: matched.gcs_uri,
                                web_url: matched.web_url,
                                size_bytes: matched.size_bytes,
                                sha256: matched.sha256,
                                snippet: matched.snippet,
                                assetKind: matched.assetKind,
                              });
                            }
                          }}
                        />
                      </div>
                    </div>

                    {/* Generated Artifacts */}
                    {ensureArray<ArtifactFile>(selectedEvidence.turn.output_artifacts).length > 0 && (
                      <div className="space-y-2 pt-1">
                        <span className={`text-xs font-semibold block ${currentTheme.accentText}`}>
                          Generated Artifacts ({ensureArray(selectedEvidence.turn.output_artifacts).length})
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          {ensureArray<ArtifactFile>(selectedEvidence.turn.output_artifacts).map((art, aIdx) => {
                            const isAudio = art.file_name?.endsWith('.mp3') || art.file_name?.endsWith('.wav') || art.mime_type?.startsWith('audio/');
                            const isImg = art.file_name?.endsWith('.png') || art.mime_type?.startsWith('image/');
                            const isVid = art.file_name?.endsWith('.mp4') || art.mime_type?.startsWith('video/');
                            const isSlides = art.file_name?.includes('slides') || art.file_name?.endsWith('.pptx') || art.file_name?.endsWith('.html') || art.mime_type?.includes('html');
                            const label = isAudio ? 'Generated Audio Podcast' : isImg ? 'Generated Image' : isVid ? 'Generated Video' : isSlides ? 'Generated Presentation' : 'Generated Document';

                            return (
                              <div
                                key={aIdx}
                                onClick={() =>
                                  setSelectedEvidence({
                                    type: 'ARTIFACT',
                                    title: art.file_name,
                                    mediaType: isAudio ? 'AUDIO' : isImg ? 'IMAGE' : isVid ? 'VIDEO' : isSlides ? 'SLIDES' : 'FILE',
                                    gcs_uri: art.gcs_uri,
                                    preview_url: art.preview_url,
                                    web_url: art.web_url,
                                    size_bytes: art.size_bytes,
                                    sha256: art.sha256,
                                    snippet: art.snippet,
                                    assetKind: 'OUTPUT',
                                  })
                                }
                                className={`p-3 rounded-xl border flex items-center justify-between gap-3 transition cursor-pointer hover:border-sky-500 shadow-2xs ${currentTheme.cardClass}`}
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <div className="p-2 rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400">
                                    {isAudio ? <Headphones className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
                                  </div>
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-700 dark:text-sky-300">
                                        {label}
                                      </span>
                                      <span className={`text-xs font-semibold truncate ${currentTheme.headingFont} ${currentTheme.textPrimary}`}>
                                        {art.file_name}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-2 text-[10px] text-zinc-400 mt-0.5 font-mono">
                                      <span>{art.mime_type || (isAudio ? 'audio/mpeg' : 'Generated Asset')}</span>
                                      {art.size_bytes ? <span>• {Math.round(art.size_bytes / 1024)} KB</span> : null}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <span className={`text-[10px] font-mono uppercase tracking-wider block font-bold ${currentTheme.textMuted}`}>
                        User Query:
                      </span>
                      <blockquote className={`p-4 rounded-xl border text-xs ${currentTheme.bodyFont} italic ${currentTheme.quoteBox}`}>
                        “{selectedEvidence.turn.user_query}”
                      </blockquote>
                    </div>

                    <div>
                      <span className={`text-[10px] font-mono uppercase tracking-wider block font-bold ${currentTheme.accentText}`}>
                        Grounded Response:
                      </span>
                      <div className={`p-4 rounded-xl border text-xs ${currentTheme.bodyFont} leading-relaxed whitespace-pre-wrap ${currentTheme.cardClass}`}>
                        {selectedEvidence.turn.model_response}
                      </div>
                    </div>
                  </div>
                )}
              </article>
            )}

            {(selectedEvidence?.type === 'STUDIO_NOTE' || selectedEvidence?.type === 'AUDIO_OVERVIEW') && (
              <ModalityViewer
                studio={selectedEvidence.studio}
                theme={currentTheme}
                index={'index' in selectedEvidence ? selectedEvidence.index : 0}
              />
            )}

            {selectedEvidence?.type === 'CITATION' && (
              <article className={`p-6 rounded-2xl border space-y-4 shadow-xs ${currentTheme.cardClass}`}>
                <div className="flex items-center justify-between border-b pb-3">
                  <div className="flex items-center gap-2">
                    <Globe className={`w-5 h-5 ${currentTheme.accentText}`} />
                    <span className={`text-xs font-mono font-bold uppercase ${currentTheme.accentText}`}>
                      Grounded Citation #{selectedEvidence.index + 1}
                    </span>
                  </div>
                  <span className="text-[9px] font-mono font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-700 dark:text-amber-300">
                    {selectedEvidence.citation.source_uri?.includes('mail.google.com') ? 'Google Mail' : 'Web Citation'}
                  </span>
                </div>

                <h2 className={`${currentTheme.headingFont} text-xl leading-snug ${currentTheme.textPrimary}`}>
                  {selectedEvidence.citation.title || 'Referenced Document / Web Citation'}
                </h2>

                <div className="space-y-1.5">
                  <span className={`text-[10px] font-mono uppercase tracking-wider block font-bold ${currentTheme.textMuted}`}>
                    Referenced Content & Extracted Snippet:
                  </span>
                  <div className={`p-4 rounded-xl border text-xs ${currentTheme.bodyFont} leading-relaxed whitespace-pre-wrap ${currentTheme.quoteBox}`}>
                    {selectedEvidence.citation.snippet || 'No raw snippet payload preserved in metadata.'}
                  </div>
                </div>

                <div className={`p-3.5 rounded-xl border font-mono text-[10px] space-y-1.5 ${currentTheme.quoteBox}`}>
                  <div className="flex items-start gap-1.5 flex-wrap">
                    <span className={`font-semibold shrink-0 ${currentTheme.textMuted}`}>Source URI:</span>
                    {sanitizeExternalUrl(selectedEvidence.citation.source_uri) ? (
                      <a
                        href={sanitizeExternalUrl(selectedEvidence.citation.source_uri)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 dark:text-blue-400 hover:underline break-all inline-flex items-center gap-1"
                      >
                        <span>{selectedEvidence.citation.source_uri}</span>
                        <ExternalLink className="w-3 h-3 shrink-0" />
                      </a>
                    ) : (
                      <span>{selectedEvidence.citation.source_uri || '-'}</span>
                    )}
                  </div>
                  {Number(selectedEvidence.citation.confidence_score) > 0 && (
                    <div>
                      <span className={`font-semibold ${currentTheme.textMuted}`}>Confidence Score: </span>
                      <span>{selectedEvidence.citation.confidence_score}</span>
                    </div>
                  )}
                </div>

                {sanitizeExternalUrl(selectedEvidence.citation.source_uri) && (
                  <a
                    href={sanitizeExternalUrl(selectedEvidence.citation.source_uri)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`w-full py-2.5 px-4 rounded-xl text-xs font-sans font-semibold transition flex items-center justify-center gap-1.5 shadow-2xs ${currentTheme.accentBtn}`}
                  >
                    <ExternalLink className="w-4 h-4" />
                    <span>Open in {selectedEvidence.citation.source_uri?.includes('mail.google.com') ? 'Google Mail' : 'Browser'}</span>
                  </a>
                )}
              </article>
            )}

            {selectedEvidence?.type === 'ARTIFACT' && (
              <article className={`p-6 rounded-2xl border space-y-4 shadow-xs ${currentTheme.cardClass}`}>
                <div className="flex items-center justify-between border-b pb-3">
                  <div className="flex items-center gap-2">
                    {selectedEvidence.mediaType === 'IMAGE' ? (
                      <ImageIcon className={`w-5 h-5 ${currentTheme.accentText}`} />
                    ) : selectedEvidence.mediaType === 'VIDEO' ? (
                      <Video className={`w-5 h-5 ${currentTheme.accentText}`} />
                    ) : selectedEvidence.mediaType === 'AUDIO' ? (
                      <Headphones className={`w-5 h-5 ${currentTheme.accentText}`} />
                    ) : (
                      <FileText className={`w-5 h-5 ${currentTheme.accentText}`} />
                    )}
                    <span className={`text-xs font-mono font-bold uppercase ${currentTheme.accentText}`}>
                      Preserved {selectedEvidence.assetKind || selectedEvidence.mediaType} Asset
                    </span>
                  </div>
                  {selectedEvidence.assetKind && (
                    <span
                      className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded ${
                        selectedEvidence.assetKind === 'INPUT'
                          ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                          : 'bg-sky-500/20 text-sky-700 dark:text-sky-300'
                      }`}
                    >
                      {selectedEvidence.assetKind}
                    </span>
                  )}
                </div>

                <h2 className={`${currentTheme.headingFont} text-xl leading-snug ${currentTheme.textPrimary}`}>
                  {selectedEvidence.title}
                </h2>

                {/* Image Viewport */}
                {selectedEvidence.mediaType === 'IMAGE' && (
                  <div className="rounded-xl overflow-hidden border p-2 bg-black/5 flex flex-col items-center justify-center">
                    <img
                      src={
                        selectedEvidence.preview_url ||
                        (selectedEvidence.gcs_uri ? getDirectMediaUrl(selectedEvidence.gcs_uri) : undefined)
                      }
                      alt={selectedEvidence.title}
                      className="max-h-96 w-full object-contain rounded-lg shadow-xs"
                    />
                  </div>
                )}

                {/* Video Player */}
                {selectedEvidence.mediaType === 'VIDEO' && (
                  <ChatVideoPlayer
                    title={selectedEvidence.title}
                    gcsUri={selectedEvidence.gcs_uri}
                    previewUrl={selectedEvidence.preview_url}
                    webUrl={selectedEvidence.web_url}
                    sizeBytes={selectedEvidence.size_bytes}
                    sha256={selectedEvidence.sha256}
                    theme={currentTheme}
                  />
                )}

                {/* Genuine Audio Player Canvas */}
                {selectedEvidence.mediaType === 'AUDIO' && (
                  <div className={`rounded-xl border overflow-hidden p-6 space-y-4 shadow-xs ${currentTheme.quoteBox}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="p-2 rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400">
                          <Headphones className="w-4 h-4" />
                        </div>
                        <span className="text-[9px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-sky-500/20 text-sky-700 dark:text-sky-300">
                          Audio Podcast Stream
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-zinc-400">
                        HTML5 Audio Stream
                      </span>
                    </div>

                    <div className="flex items-center justify-center gap-1 py-3 px-4 bg-zinc-950/5 dark:bg-zinc-950/40 rounded-xl border border-zinc-200/60 dark:border-zinc-800/60">
                      <div className="flex items-end gap-1 h-8">
                        <div className="w-1 bg-sky-500/40 dark:bg-sky-400/40 rounded-full h-3 animate-pulse" />
                        <div className="w-1 bg-sky-500/60 dark:bg-sky-400/60 rounded-full h-5 animate-pulse [animation-delay:150ms]" />
                        <div className="w-1 bg-sky-500 dark:bg-sky-400 rounded-full h-7 animate-pulse [animation-delay:300ms]" />
                        <div className="w-1 bg-sky-500/80 dark:bg-sky-400/80 rounded-full h-4 animate-pulse [animation-delay:450ms]" />
                        <div className="w-1 bg-sky-500/50 dark:bg-sky-400/50 rounded-full h-6 animate-pulse [animation-delay:200ms]" />
                        <div className="w-1 bg-sky-500 dark:bg-sky-400 rounded-full h-8 animate-pulse [animation-delay:350ms]" />
                        <div className="w-1 bg-sky-500/70 dark:bg-sky-400/70 rounded-full h-5 animate-pulse [animation-delay:500ms]" />
                        <div className="w-1 bg-sky-500/40 dark:bg-sky-400/40 rounded-full h-3 animate-pulse [animation-delay:100ms]" />
                        <div className="w-1 bg-sky-500/90 dark:bg-sky-400/90 rounded-full h-7 animate-pulse [animation-delay:250ms]" />
                        <div className="w-1 bg-sky-500 dark:bg-sky-400 rounded-full h-4 animate-pulse [animation-delay:400ms]" />
                      </div>
                    </div>

                    <audio
                      controls
                      src={
                        selectedEvidence.gcs_uri
                          ? getDirectMediaUrl(selectedEvidence.gcs_uri)
                          : selectedEvidence.preview_url || selectedEvidence.web_url
                      }
                      className="w-full h-10 accent-sky-600"
                    />
                  </div>
                )}

                {/* Genuine Slide Presentation Canvas */}
                {(selectedEvidence.mediaType === 'SLIDES' ||
                  selectedEvidence.mediaType === 'PDF' ||
                  getCleanExtension(selectedEvidence.gcs_uri || selectedEvidence.title).endsWith('.html') ||
                  getCleanExtension(selectedEvidence.gcs_uri || selectedEvidence.title).endsWith('.pdf')) && (
                  <PresentationViewer
                    title={selectedEvidence.title}
                    gcsUri={selectedEvidence.gcs_uri}
                    previewUrl={selectedEvidence.preview_url}
                    webUrl={selectedEvidence.web_url}
                    snippet={selectedEvidence.snippet}
                    sizeBytes={selectedEvidence.size_bytes}
                    sha256={selectedEvidence.sha256}
                    theme={currentTheme}
                  />
                )}

                {/* File Provenance & Cryptographic Integrity Box */}
                {selectedEvidence.mediaType !== 'VIDEO' && (
                  <>
                    {selectedEvidence.snippet &&
                      selectedEvidence.mediaType !== 'SLIDES' &&
                      selectedEvidence.mediaType !== 'PDF' && (
                      <div className={`p-4 rounded-xl border text-xs ${currentTheme.bodyFont} leading-relaxed whitespace-pre-wrap ${currentTheme.quoteBox}`}>
                        {selectedEvidence.snippet}
                      </div>
                    )}

                    <div className={`p-3.5 rounded-xl border font-mono text-[10px] space-y-1.5 ${currentTheme.quoteBox}`}>
                      <div className="flex items-start gap-1.5 flex-wrap">
                        <span className={`font-semibold shrink-0 ${currentTheme.textMuted}`}>GCS Storage Path:</span>
                        {selectedEvidence.gcs_uri ? (
                          <a
                            href={getDirectMediaUrl(selectedEvidence.gcs_uri)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 dark:text-blue-400 hover:underline break-all"
                          >
                            {selectedEvidence.gcs_uri}
                          </a>
                        ) : (
                          <span>-</span>
                        )}
                      </div>
                      <div>
                        <span className={`font-semibold ${currentTheme.textMuted}`}>File Size:</span>{' '}
                        {selectedEvidence.size_bytes ? `${Math.round(selectedEvidence.size_bytes / 1024)} KB (${selectedEvidence.size_bytes.toLocaleString()} bytes)` : '-'}
                      </div>
                      {selectedEvidence.sha256 && (
                        <div className="flex items-start gap-1.5 flex-wrap">
                          <span className={`font-semibold shrink-0 ${currentTheme.textMuted}`}>SHA-256 Integrity:</span>
                          <span className="text-emerald-600 dark:text-emerald-400 font-mono text-[9px] break-all">{selectedEvidence.sha256}</span>
                        </div>
                      )}
                      {selectedEvidence.crc32c && (
                        <div className="flex items-start gap-1.5 flex-wrap">
                          <span className={`font-semibold shrink-0 ${currentTheme.textMuted}`}>CRC32C Integrity:</span>
                          <span className="text-emerald-600 dark:text-emerald-400 font-mono text-[9px] break-all">{selectedEvidence.crc32c}</span>
                        </div>
                      )}
                      {sanitizeExternalUrl(selectedEvidence.web_url) && (
                        <div className="flex items-start gap-1.5 flex-wrap">
                          <span className={`font-semibold shrink-0 ${currentTheme.textMuted}`}>Origin URL:</span>
                          <a
                            href={sanitizeExternalUrl(selectedEvidence.web_url)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 dark:text-blue-400 hover:underline break-all"
                          >
                            {selectedEvidence.web_url}
                          </a>
                        </div>
                      )}
                    </div>

                    {selectedEvidence.gcs_uri && (
                      <a
                        href={getDirectMediaUrl(selectedEvidence.gcs_uri)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`w-full py-2.5 px-4 rounded-xl text-xs font-sans font-semibold transition flex items-center justify-center gap-1.5 shadow-2xs ${currentTheme.accentBtn}`}
                      >
                        <Download className="w-4 h-4" />
                        <span>Download Original Preserved File</span>
                      </a>
                    )}
                  </>
                )}
              </article>
            )}

            {/* SCENARIO B: DEFAULT / FULL BRIEF VIEW (Continuous Narrative) */}
            {!selectedEvidence && (
              <>
                {/* 1. CHAT STREAM BRIEF VIEW */}
                {!isNotebook &&
                  active.turns.length > 0 &&
                  active.turns.map((turn, idx) => {
                    const inArts = ensureArray<ArtifactFile>(turn.input_artifacts);
                    const outArts = ensureArray<ArtifactFile>(turn.output_artifacts);
                    const turnCits = ensureArray<GroundedCitation>(turn.citations);
                    const { reasoning, output: cleanOutput } = parseReasoningAndOutput(turn.output_text, turn.reasoning_text);
                    const isFailed = turn.output_text?.startsWith('ERROR [') || turn.state === 'FAILED';

                    return (
                      <article key={idx} id={`turn-${idx + 1}`} className="space-y-4 border-b pb-6 last:border-b-0">
                        <div className="flex items-center justify-between text-xs font-mono border-b pb-1.5">
                          <span className={`font-semibold ${currentTheme.accentText}`}>
                            Turn #{idx + 1}
                          </span>
                          <span className={currentTheme.textMuted}>
                            {turn.timestamp ? formatTimestampWithRelative(turn.timestamp) : ''}
                          </span>
                        </div>

                        {/* User Prompt */}
                        <div className="space-y-2">
                          <span className={`text-xs font-semibold block ${currentTheme.textPrimary}`}>
                            User Prompt
                          </span>
                          <blockquote className={`p-4 rounded-xl border leading-relaxed text-xs ${currentTheme.bodyFont} italic ${currentTheme.quoteBox}`}>
                            “{turn.input_text}”
                          </blockquote>

                          {/* Attached Inbound Files */}
                          {inArts.length > 0 && (
                            <div className="space-y-1.5 pt-1">
                              <span className={`text-xs font-semibold block ${currentTheme.textPrimary}`}>
                                Inbound Attachments ({inArts.length})
                              </span>
                              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                                {inArts.map((art, aIdx) => {
                                  const isAudio = art.file_name?.endsWith('.mp3') || art.file_name?.endsWith('.wav') || art.mime_type?.startsWith('audio/');
                                  const isPdf = art.file_name?.endsWith('.pdf') || art.mime_type?.includes('pdf');
                                  return (
                                    <div
                                      key={aIdx}
                                      onClick={() =>
                                        setSelectedEvidence({
                                          type: 'ARTIFACT',
                                          title: art.file_name,
                                          mediaType: isAudio ? 'AUDIO' : isPdf ? 'PDF' : 'FILE',
                                          gcs_uri: art.gcs_uri,
                                          web_url: art.web_url,
                                          snippet: art.snippet,
                                          size_bytes: art.size_bytes,
                                          sha256: art.sha256,
                                          assetKind: 'INPUT',
                                        })
                                      }
                                      className={`p-2.5 rounded-xl border transition cursor-pointer flex items-center justify-between group shadow-2xs ${currentTheme.cardClass} ${currentTheme.cardHoverClass}`}
                                    >
                                      <div className="flex items-center gap-2 min-w-0 pr-1">
                                        {isAudio ? (
                                          <Headphones className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
                                        ) : (
                                          <FileText className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
                                        )}
                                        <div className="min-w-0">
                                          <div className="flex items-center gap-1">
                                            <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                                              {isAudio ? 'Inbound Audio' : 'Inbound File'}
                                            </span>
                                            <span className={`${currentTheme.headingFont} text-xs truncate block group-hover:underline ${currentTheme.textPrimary}`}>
                                              {art.file_name}
                                            </span>
                                          </div>
                                        </div>
                                      </div>
                                      <Eye className={`w-3.5 h-3.5 shrink-0 opacity-60 group-hover:opacity-100 ${currentTheme.accentText}`} />
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* Grounded Citations */}
                          {turnCits.length > 0 && (
                            <div className="space-y-1.5 pt-1">
                              <span className={`text-xs font-semibold block ${currentTheme.textPrimary}`}>
                                Grounded Citations ({turnCits.length})
                              </span>
                              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                                {turnCits.map((cit, cIdx) => (
                                  <div
                                    key={cIdx}
                                    onClick={() => setSelectedEvidence({ type: 'CITATION', citation: cit, index: cIdx })}
                                    className={`p-2.5 rounded-xl border transition cursor-pointer flex items-center justify-between group shadow-2xs ${currentTheme.cardClass} ${currentTheme.cardHoverClass}`}
                                  >
                                    <div className="flex items-center gap-2 min-w-0 pr-1">
                                      <Globe className={`w-3.5 h-3.5 shrink-0 ${currentTheme.accentText}`} />
                                      <span className={`${currentTheme.headingFont} text-xs truncate block group-hover:underline ${currentTheme.textPrimary}`}>
                                        {cit.title || 'Citation'}
                                      </span>
                                    </div>
                                    <ExternalLink className="w-3.5 h-3.5 shrink-0 opacity-60" />
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Model Reasoning & Response or Execution Error */}
                        <div className="space-y-1.5 pt-1">
                          <span className={`text-xs font-semibold block ${isFailed ? 'text-amber-700' : currentTheme.accentText}`}>
                            {isFailed
                              ? 'Execution Error & Diagnostics'
                              : 'Model Reasoning & Response'}
                          </span>
                          <div className="space-y-3">
                            {/* In-Flight Deep Research Status Banner */}
                            {(turn.state === 'REQUESTED' || turn.state === 'PROCESSING') && (
                              <div className="p-3.5 rounded-xl border border-purple-300/60 bg-purple-500/10 text-purple-900 dark:text-purple-200 flex items-center justify-between animate-pulse">
                                <div className="flex items-center gap-2 text-xs font-semibold">
                                  <Loader2 className="w-4 h-4 animate-spin text-purple-600 dark:text-purple-400" />
                                  <span>Deep Research in Progress...</span>
                                </div>
                                <span className="text-[10px] font-mono text-purple-600 dark:text-purple-400">
                                  Autonomous web exploration & synthesis
                                </span>
                              </div>
                            )}

                            {/* Audio Podcast Player if present */}
                            {outArts.some((art) => art.mime_type?.startsWith('audio/') || art.file_name?.endsWith('.mp3') || art.file_name?.endsWith('.wav')) && (
                              <div className="p-3.5 rounded-xl border border-purple-200 bg-purple-50/70 dark:bg-purple-950/30 space-y-2">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <Headphones className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                                    <span className="text-xs font-semibold text-purple-900 dark:text-purple-100 font-sans">
                                      Deep Research Audio Podcast
                                    </span>
                                  </div>
                                  <span className="text-[10px] font-mono text-purple-600 dark:text-purple-400">
                                    Generated Audio Overview
                                  </span>
                                </div>
                                {outArts
                                  .filter((art) => art.mime_type?.startsWith('audio/') || art.file_name?.endsWith('.mp3') || art.file_name?.endsWith('.wav'))
                                  .map((audioArt, aIdx) => (
                                    <div key={aIdx} className="space-y-1">
                                      <audio
                                        controls
                                        src={audioArt.gcs_uri ? getDirectMediaUrl(audioArt.gcs_uri) : audioArt.web_url}
                                        className="w-full h-8 accent-purple-600"
                                      />
                                      <div className="flex items-center justify-between text-[10px] font-mono text-purple-600 dark:text-purple-400">
                                        <span>{audioArt.file_name || 'podcast.mp3'}</span>
                                        {audioArt.size_bytes ? <span>{Math.round(audioArt.size_bytes / 1024)} KB</span> : null}
                                      </div>
                                    </div>
                                  ))}
                              </div>
                            )}

                            {reasoning && (
                              <div className={`rounded-xl border overflow-hidden ${currentTheme.quoteBox}`}>
                                <button
                                  type="button"
                                  onClick={() => toggleReasoning(`turn_${idx}`)}
                                  className="w-full flex items-center justify-between px-3.5 py-2 text-left text-xs font-mono font-medium hover:opacity-80 transition cursor-pointer"
                                >
                                  <div className="flex items-center gap-1.5">
                                    <Sparkles className={`w-3.5 h-3.5 ${currentTheme.accentText}`} />
                                    <span>Reasoning Steps</span>
                                    <span className="text-[10px] opacity-70">
                                      ({reasoning.split('\n').length} steps)
                                    </span>
                                  </div>
                                  {expandedReasoning[`turn_${idx}`] ? (
                                    <ChevronDown className="w-3.5 h-3.5 opacity-60" />
                                  ) : (
                                    <ChevronRight className="w-3.5 h-3.5 opacity-60" />
                                  )}
                                </button>
                                {expandedReasoning[`turn_${idx}`] && (
                                  <div className="p-3.5 border-t border-inherit text-xs font-mono whitespace-pre-wrap max-h-72 overflow-auto bg-white/70">
                                    {reasoning}
                                  </div>
                                )}
                              </div>
                            )}

                            {isFailed ? (
                              <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-2 text-xs">
                                <div className="flex items-center gap-2 font-bold text-amber-900 font-sans">
                                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                                  <span>System Execution Failure</span>
                                </div>
                                <div className="p-3 bg-white/80 rounded-lg border border-amber-200 font-mono text-xs text-amber-900 whitespace-pre-wrap">
                                  {turn.output_text}
                                </div>
                              </div>
                            ) : (
                              <div className={`rounded-xl border p-4.5 text-xs ${currentTheme.bodyFont} leading-relaxed ${currentTheme.cardClass} ${currentTheme.textPrimary}`}>
                                <MarkdownContent
                                  content={cleanOutput}
                                  theme={currentTheme}
                                  onArtifactClick={(fileName) => {
                                    const matched = allSessionAssets.find((a) => a.file_name === fileName);
                                    if (matched) {
                                      const isAudio = matched.file_name?.endsWith('.mp3') || matched.file_name?.endsWith('.wav') || matched.mime_type?.startsWith('audio/');
                                      const isVideo = matched.file_name?.endsWith('.mp4') || matched.mime_type?.startsWith('video/');
                                      const isImg = matched.file_name?.endsWith('.png') || matched.mime_type?.startsWith('image/');
                                      const isPdf = matched.file_name?.endsWith('.pdf') || matched.mime_type?.includes('pdf');
                                      const isSlides = matched.file_name?.includes('slides') || matched.file_name?.endsWith('.pptx') || matched.file_name?.endsWith('.html') || matched.mime_type?.includes('html');
                                      setSelectedEvidence({
                                        type: 'ARTIFACT',
                                        title: matched.file_name,
                                        mediaType: isAudio ? 'AUDIO' : isVideo ? 'VIDEO' : isImg ? 'IMAGE' : isPdf ? 'PDF' : isSlides ? 'SLIDES' : 'FILE',
                                        gcs_uri: matched.gcs_uri,
                                        web_url: matched.web_url,
                                        size_bytes: matched.size_bytes,
                                        sha256: matched.sha256,
                                        snippet: matched.snippet,
                                        assetKind: matched.assetKind,
                                      });
                                    }
                                  }}
                                />
                              </div>
                            )}
                          </div>

                          {/* Generated Artifacts */}
                          {outArts.length > 0 && (
                            <div className={`p-4 rounded-xl border space-y-3 mt-2 shadow-xs ${currentTheme.quoteBox}`}>
                              <div className="flex items-center justify-between border-b pb-2">
                                <span className={`text-xs font-semibold block ${currentTheme.accentText}`}>
                                  Generated Artifacts ({outArts.length})
                                </span>
                                <span className={`text-[10px] font-mono ${currentTheme.textMuted}`}>
                                  SHA-256 Verified
                                </span>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                                {outArts.map((art, oIdx) => {
                                  const isAudio = art.file_name?.endsWith('.mp3') || art.file_name?.endsWith('.wav') || art.mime_type?.startsWith('audio/');
                                  const isVideo = art.file_name?.endsWith('.mp4') || art.mime_type?.startsWith('video/');
                                  const isImg = art.file_name?.endsWith('.png') || art.mime_type?.startsWith('image/');
                                  const isSlides = art.file_name?.includes('slides') || art.file_name?.endsWith('.pptx') || art.file_name?.endsWith('.html') || art.mime_type?.includes('html');
                                  const label = isAudio ? 'Generated Audio Podcast' : isImg ? 'Generated Image' : isVideo ? 'Generated Video' : isSlides ? 'Generated Presentation' : 'Generated Document';

                                  return (
                                    <div
                                      key={oIdx}
                                      onClick={() =>
                                        setSelectedEvidence({
                                          type: 'ARTIFACT',
                                          title: art.file_name,
                                          mediaType: isAudio ? 'AUDIO' : isVideo ? 'VIDEO' : isImg ? 'IMAGE' : isSlides ? 'SLIDES' : 'FILE',
                                          gcs_uri: art.gcs_uri,
                                          preview_url: art.preview_url,
                                          size_bytes: art.size_bytes,
                                          sha256: art.sha256,
                                          crc32c: art.crc32c,
                                          assetKind: 'OUTPUT',
                                        })
                                      }
                                      className={`p-2.5 rounded-xl border transition cursor-pointer flex items-center justify-between group shadow-2xs ${currentTheme.cardClass} ${currentTheme.cardHoverClass}`}
                                    >
                                      <div className="flex items-center gap-2 min-w-0 pr-1">
                                        {isAudio ? (
                                          <Headphones className={`w-3.5 h-3.5 shrink-0 ${currentTheme.accentText}`} />
                                        ) : (
                                          <Sparkles className={`w-3.5 h-3.5 shrink-0 ${currentTheme.accentText}`} />
                                        )}
                                        <div className="min-w-0">
                                          <div className="flex items-center gap-1">
                                            <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-700 dark:text-sky-300">
                                              {label}
                                            </span>
                                            <span className={`${currentTheme.headingFont} text-xs truncate block group-hover:underline ${currentTheme.textPrimary}`}>
                                              {art.file_name}
                                            </span>
                                          </div>
                                        </div>
                                      </div>
                                      <Eye className={`w-3.5 h-3.5 shrink-0 opacity-60 group-hover:opacity-100 ${currentTheme.accentText}`} />
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      </article>
                    );
                  })}

                {/* 2. NOTEBOOKLM CONTINUOUS WORKSPACE VIEW */}
                {isNotebook && (
                  <div className="space-y-6">
                    {/* Sources Section */}
                    {active.sources.length > 0 && (
                      <section className="space-y-3">
                        <div className="flex items-center gap-2 border-b pb-2">
                          <BookOpen className={`w-4 h-4 ${currentTheme.accentText}`} />
                          <h3 className={`${currentTheme.headingFont} text-sm ${currentTheme.textPrimary}`}>
                            Grounded Ingested Sources ({active.sources.length})
                          </h3>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {active.sources.map((s, idx) => (
                            <div
                              key={s.source_id || idx}
                              onClick={() => setSelectedEvidence({ type: 'SOURCE', source: s, index: idx })}
                              className={`p-4 rounded-xl border transition cursor-pointer space-y-2 shadow-2xs ${currentTheme.cardClass} ${currentTheme.cardHoverClass}`}
                            >
                              <div className="flex items-center justify-between">
                                <span className={`${currentTheme.headingFont} text-xs truncate max-w-[200px] ${currentTheme.textPrimary}`}>
                                  {s.source_title}
                                </span>
                                <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${currentTheme.badgePill}`}>
                                  {s.source_type}
                                </span>
                              </div>
                              <p className={`text-xs ${currentTheme.bodyFont} line-clamp-2 leading-relaxed ${currentTheme.textSecondary}`}>
                                {s.content_preview || s.full_content || s.original_url || (s as any).source_url || s.gcs_uri || (s as any).source_kind || s.source_type || 'Ingested Source'}
                              </p>
                              <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400">
                                <span>{s.word_count ? `${s.word_count} words` : (s.source_type === 'YOUTUBE' ? 'YouTube Stream' : 'Preserved Text')}</span>
                                {s.event_time && <span>{formatEasternDateTime(s.event_time)}</span>}
                                <Eye className={`w-3.5 h-3.5 ${currentTheme.accentText}`} />
                              </div>
                            </div>
                          ))}
                        </div>
                      </section>
                    )}

                    {/* Chat Turns Section */}
                    <section className="space-y-3">
                      <div className="flex items-center gap-2 border-b pb-2">
                        <MessageSquare className={`w-4 h-4 ${currentTheme.accentText}`} />
                        <h3 className={`${currentTheme.headingFont} text-sm ${currentTheme.textPrimary}`}>
                          Notebook Q&A Sequence ({active.chats.length})
                        </h3>
                      </div>

                      {active.chats.length === 0 ? (
                        <div className={`p-4 rounded-xl border text-xs ${currentTheme.bodyFont} leading-relaxed ${currentTheme.quoteBox} ${currentTheme.textSecondary}`}>
                          NotebookLM conversational text is scrubbed at the platform layer and has no public session read API.
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {active.chats.map((c, idx) => (
                            <div
                              key={c.turn_id || idx}
                              onClick={() => setSelectedEvidence({ type: 'CHAT_TURN', turn: c, turnNumber: idx + 1 })}
                              className={`p-4 rounded-xl border transition cursor-pointer space-y-2.5 shadow-2xs ${currentTheme.cardClass} ${currentTheme.cardHoverClass}`}
                            >
                              <div className="flex items-center justify-between text-[10px] font-mono">
                                <span className={`font-bold ${currentTheme.accentText}`}>Turn #{idx + 1}</span>
                                <span className={currentTheme.textMuted}>{c.citations?.length || 0} Grounded Citations</span>
                              </div>

                              <blockquote className={`p-3 rounded-lg border text-xs ${currentTheme.bodyFont} italic ${currentTheme.quoteBox}`}>
                                “{c.user_query}”
                              </blockquote>

                              <div className={`p-3 rounded-lg border text-xs ${currentTheme.bodyFont} leading-relaxed whitespace-pre-wrap ${currentTheme.cardClass} ${currentTheme.textPrimary}`}>
                                {c.model_response}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </section>

                    {/* Studio Outputs Section */}
                    {active.studio.length > 0 && (
                      <section className="space-y-3">
                        <div className="flex items-center gap-2 border-b pb-2">
                          <Layers className={`w-4 h-4 ${currentTheme.accentText}`} />
                          <h3 className={`${currentTheme.headingFont} text-sm ${currentTheme.textPrimary}`}>
                            Studio Outputs & Notes ({active.studio.length})
                          </h3>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {active.studio.map((st, idx) => {
                            const modality = detectStudioModality(st);
                            const isGenerating = Boolean(
                              st.lifecycle_state === 'REQUESTED' ||
                              st.lifecycle_state === 'PROCESSING' ||
                              st.lifecycle_state === 'GENERATING'
                            );
                            const isFailed = st.lifecycle_state === 'FAILED';
                            return (
                              <div
                                key={st.artifact_id || idx}
                                onClick={() =>
                                  setSelectedEvidence({ type: 'STUDIO_NOTE', studio: st, index: idx })
                                }
                                className={`p-4 rounded-xl border transition cursor-pointer space-y-2 shadow-2xs ${currentTheme.cardClass} ${currentTheme.cardHoverClass}`}
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2 min-w-0">
                                    {renderModalityIcon(st, `w-4 h-4 shrink-0 ${currentTheme.accentText}`)}
                                    <span className={`${currentTheme.headingFont} text-xs truncate max-w-[180px] ${currentTheme.textPrimary}`}>
                                      {st.title}
                                    </span>
                                  </div>
                                  {isFailed ? (
                                    <span className="inline-flex items-center gap-1 text-[9px] font-mono px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30">
                                      <span>Failed</span>
                                    </span>
                                  ) : isGenerating ? (
                                    <span className="inline-flex items-center gap-1 text-[9px] font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 animate-pulse">
                                      <Loader2 className="w-2.5 h-2.5 animate-spin" />
                                      <span>Generating...</span>
                                    </span>
                                  ) : (
                                    <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${currentTheme.badgePill}`}>
                                      {formatStudioModalityLabel(modality)}
                                    </span>
                                  )}
                                </div>
                                <p className={`text-xs ${currentTheme.bodyFont} line-clamp-2 leading-relaxed ${currentTheme.textSecondary}`}>
                                  {st.note_content || st.customization_prompt || (isFailed ? (st.status_message || 'Generation unfulfilled within retention window.') : isGenerating ? 'Generating artifact in background...' : '-')}
                                </p>
                                <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400">
                                  <span>{isFailed ? 'Failed' : isGenerating ? 'Processing' : (st.mime_type || 'GCS Preserved Asset')}</span>
                                  {st.event_time && <span>{formatEasternDateTime(st.event_time)}</span>}
                                  <Eye className={`w-3.5 h-3.5 ${currentTheme.accentText}`} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </section>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}
    </main>
      </div>
    </div>
  );
};

export default LegalBriefNarrative;
