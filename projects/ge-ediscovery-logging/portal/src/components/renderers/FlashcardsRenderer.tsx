import React, { useState, useEffect, useMemo } from 'react';
import { NotebookStudioRecord } from '../../types/schema';
import { ThemeConfig } from '../../types/theme';
import { getDirectMediaUrl } from '../../services/complianceApi';
import {
  Layers,
  RotateCcw,
  Columns,
  LayoutGrid,
  Search,
  Copy,
  Check,
  Loader2,
  Download,
  Printer,
  Sparkles,
} from 'lucide-react';

interface FlashcardItem {
  id: number;
  front: string;
  back: string;
}

interface FlashcardsRendererProps {
  studio: NotebookStudioRecord;
  theme: ThemeConfig;
}

const flashcardsCache = new Map<string, string>();

function safeJsonParse(raw: unknown): any {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    try {
      return JSON.parse(trimmed);
    } catch {
      return null;
    }
  }
  return null;
}

function cleanDifficultyLabel(raw?: unknown): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const stripped = raw
    .replace(/^FLASHCARDS_DIFFICULTY_/i, '')
    .replace(/^DIFFICULTY_/i, '')
    .replace(/_/g, ' ')
    .trim();
  if (!stripped || stripped.toUpperCase() === 'UNSPECIFIED') return null;
  return stripped.charAt(0).toUpperCase() + stripped.slice(1).toLowerCase();
}

function parseFlashcardsPayload(studio: NotebookStudioRecord, rawFetchedText?: string): {
  cards: FlashcardItem[];
  difficulty: string | null;
} {
  const candidates: any[] = [];

  if (studio.flashcards_data) candidates.push(safeJsonParse(studio.flashcards_data) ?? studio.flashcards_data);
  if (rawFetchedText) {
    const parsedFetched = safeJsonParse(rawFetchedText);
    if (parsedFetched) candidates.push(parsedFetched);
  }
  if (studio.note_content) {
    const parsedNote = safeJsonParse(studio.note_content);
    if (parsedNote) candidates.push(parsedNote);
  }

  const parsedMeta = safeJsonParse(studio.metadata) || {};
  const parsedCustomOpts = safeJsonParse(studio.customization_options) || {};

  if (parsedMeta) {
    const respArt = parsedMeta.response?.artifact || parsedMeta.artifact || parsedMeta.response || {};
    const reqArt = parsedMeta.request?.artifact || parsedMeta.request || {};
    const appObj = respArt.app || reqArt.app || parsedMeta.app || {};
    if (appObj.appData) candidates.push(safeJsonParse(appObj.appData) ?? appObj.appData);
    if (respArt.appData) candidates.push(safeJsonParse(respArt.appData) ?? respArt.appData);
    if (appObj.flashcards) candidates.push(appObj.flashcards);
    if (respArt.flashcards) candidates.push(respArt.flashcards);
    if (parsedMeta.flashcards) candidates.push(parsedMeta.flashcards);
    if (parsedMeta.cards) candidates.push(parsedMeta);
  }

  let rawCards: any[] = [];
  let rawDifficulty: string | undefined =
    parsedCustomOpts.difficulty ||
    parsedMeta.flashcardsDifficulty ||
    parsedMeta.flashcards_difficulty;

  for (const cand of candidates) {
    if (!cand) continue;
    if (Array.isArray(cand) && cand.length > 0) {
      rawCards = cand;
      break;
    }
    if (typeof cand === 'object') {
      if (!rawDifficulty) {
        rawDifficulty =
          cand.flashcardsDifficulty ||
          cand.flashcards_difficulty ||
          cand.difficulty ||
          cand.flashcards?.flashcardsDifficulty ||
          cand.flashcards?.difficulty;
      }
      const list =
        (Array.isArray(cand.flashcards) && cand.flashcards) ||
        (Array.isArray(cand.cards) && cand.cards) ||
        (Array.isArray(cand.flashcards?.cards) && cand.flashcards.cards) ||
        (Array.isArray(cand.items) && cand.items);
      if (list && list.length > 0) {
        rawCards = list;
        break;
      }
    }
  }

  const cards: FlashcardItem[] = rawCards.map((c: any, idx: number) => ({
    id: idx + 1,
    front: c?.front || c?.f || c?.term || c?.question || c?.prompt || `Card #${idx + 1}`,
    back: c?.back || c?.b || c?.definition || c?.answer || c?.explanation || '',
  }));

  return {
    cards,
    difficulty: cleanDifficultyLabel(rawDifficulty),
  };
}

export const FlashcardsRenderer: React.FC<FlashcardsRendererProps> = ({ studio, theme }) => {
  const cacheKey = studio.gcs_uri || '';
  const [fetchedRaw, setFetchedRaw] = useState<string>(() =>
    cacheKey && flashcardsCache.has(cacheKey) ? flashcardsCache.get(cacheKey) || '' : ''
  );
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [flippedIds, setFlippedIds] = useState<Record<number, boolean>>({});
  const [layoutMode, setLayoutMode] = useState<'flip' | 'side-by-side'>('flip');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);

  const initialParsed = useMemo(() => parseFlashcardsPayload(studio, fetchedRaw), [studio, fetchedRaw]);

  useEffect(() => {
    if (initialParsed.cards.length > 0 || !cacheKey) {
      setIsLoading(false);
      return;
    }
    if (flashcardsCache.has(cacheKey)) {
      setFetchedRaw(flashcardsCache.get(cacheKey) || '');
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    setIsLoading(true);

    void (async () => {
      try {
        const res = await fetch(getDirectMediaUrl(cacheKey), { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        if (cancelled) return;
        flashcardsCache.set(cacheKey, text);
        setFetchedRaw(text);
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') return;
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [initialParsed.cards.length, cacheKey]);

  const { cards, difficulty } = initialParsed;
  const directUrl = studio.gcs_uri ? getDirectMediaUrl(studio.gcs_uri) : undefined;

  const filteredCards = useMemo(() => {
    if (!searchQuery.trim()) return cards;
    const q = searchQuery.toLowerCase();
    return cards.filter(
      (c) => c.front.toLowerCase().includes(q) || c.back.toLowerCase().includes(q)
    );
  }, [cards, searchQuery]);

  const toggleFlip = (id: number) => {
    setFlippedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleFlipAll = () => {
    const allFlipped = cards.length > 0 && cards.every((c) => flippedIds[c.id]);
    if (allFlipped) {
      setFlippedIds({});
    } else {
      const next: Record<number, boolean> = {};
      cards.forEach((c) => {
        next[c.id] = true;
      });
      setFlippedIds(next);
    }
  };

  const handleCopy = () => {
    const text = cards.map((c) => `Card #${c.id}\nFront: ${c.front}\nBack: ${c.back}`).join('\n\n');
    navigator.clipboard.writeText(`# ${studio.title || 'Flashcards Deck'}\n\n${text}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`rounded-2xl border overflow-hidden shadow-sm space-y-6 p-8 ${theme.cardClass}`}>
      {/* Header */}
      <div className="border-b pb-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[9px] font-mono font-bold uppercase tracking-wider px-2.5 py-0.5 rounded bg-violet-500/20 text-violet-700 dark:text-violet-300">
              Flashcards
            </span>
            <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded border border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300">
              {cards.length} {cards.length === 1 ? 'Card' : 'Cards'}
            </span>
            {difficulty && (
              <span className={`text-xs font-mono ${theme.textMuted}`}>
                • Difficulty: {difficulty}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className={`flex items-center rounded-xl border p-0.5 ${theme.quoteBox}`}>
              <button
                type="button"
                onClick={() => setLayoutMode('flip')}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition cursor-pointer ${
                  layoutMode === 'flip'
                    ? 'bg-violet-600 text-white shadow-xs'
                    : 'hover:opacity-80'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>Interactive Flip</span>
              </button>
              <button
                type="button"
                onClick={() => setLayoutMode('side-by-side')}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition cursor-pointer ${
                  layoutMode === 'side-by-side'
                    ? 'bg-violet-600 text-white shadow-xs'
                    : 'hover:opacity-80'
                }`}
              >
                <Columns className="w-3.5 h-3.5" />
                <span>Front & Back</span>
              </button>
            </div>

            {layoutMode === 'flip' && cards.length > 0 && (
              <button
                type="button"
                onClick={handleFlipAll}
                className={`p-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${theme.quoteBox}`}
              >
                <RotateCcw className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />
                <span>{cards.every((c) => flippedIds[c.id]) ? 'Reset All' : 'Flip All'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleCopy}
              className={`p-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${theme.quoteBox}`}
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied' : 'Copy Deck'}</span>
            </button>

            {directUrl ? (
              <a
                href={directUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={`p-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${theme.accentBtn}`}
              >
                <Download className="w-3.5 h-3.5" />
                <span>JSON Deck</span>
              </a>
            ) : (
              <button
                type="button"
                onClick={() => window.print()}
                className={`p-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${theme.accentBtn}`}
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Export PDF</span>
              </button>
            )}
          </div>
        </div>

        <div>
          <h1 className={`${theme.headingFont} text-2xl font-bold ${theme.textPrimary}`}>
            {studio.title || 'Interactive Flashcards Deck'}
          </h1>
          <p className="text-xs text-zinc-500 mt-1">
            Click any flashcard to flip between Front (Prompt/Term) and Back (Grounded Answer/Definition).
          </p>
        </div>

        {studio.user_steering_prompt && (
          <div className={`p-3.5 rounded-xl border text-xs leading-relaxed flex items-start gap-2 ${theme.quoteBox}`}>
            <Sparkles className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400 shrink-0 mt-0.5" />
            <span className={theme.textSecondary}>{studio.user_steering_prompt}</span>
          </div>
        )}

        {cards.length > 0 && (
          <div className="relative max-w-md">
            <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-zinc-400" />
            <input
              type="text"
              placeholder="Search flashcard prompts or definitions..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`w-full pl-9 pr-3 py-2 text-xs rounded-xl border outline-none font-sans focus:ring-1 focus:ring-violet-500 ${theme.quoteBox}`}
            />
          </div>
        )}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className={`p-8 rounded-xl border flex items-center justify-center gap-2.5 text-xs ${theme.quoteBox} ${theme.textSecondary}`}>
          <Loader2 className="w-4 h-4 animate-spin text-violet-600 dark:text-violet-400" />
          <span>Hydrating flashcard deck from Cloud Storage...</span>
        </div>
      ) : cards.length === 0 ? (
        <div className={`p-6 rounded-xl border text-xs whitespace-pre-wrap ${theme.quoteBox} ${theme.textSecondary}`}>
          {studio.note_content || fetchedRaw || 'No structured flashcards preserved for this record.'}
        </div>
      ) : layoutMode === 'side-by-side' ? (
        <div className="space-y-3">
          {filteredCards.map((card) => (
            <div
              key={card.id}
              className={`p-4 rounded-xl border grid grid-cols-1 md:grid-cols-2 gap-4 shadow-2xs ${theme.cardClass}`}
            >
              <div className="space-y-1.5 border-b md:border-b-0 md:border-r pb-3 md:pb-0 md:pr-4 border-zinc-200 dark:border-zinc-800">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono font-bold uppercase text-violet-600 dark:text-violet-400">
                    Card #{card.id} • Front
                  </span>
                  <Layers className="w-3.5 h-3.5 text-violet-500 opacity-60" />
                </div>
                <p className={`text-xs font-semibold leading-relaxed ${theme.headingFont} ${theme.textPrimary}`}>
                  {card.front}
                </p>
              </div>
              <div className="space-y-1.5">
                <span className="text-[10px] font-mono font-bold uppercase text-emerald-600 dark:text-emerald-400 block">
                  Back • Verified Definition
                </span>
                <p className={`text-xs leading-relaxed whitespace-pre-wrap ${theme.textSecondary}`}>
                  {card.back}
                </p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredCards.map((card) => {
            const isFlipped = Boolean(flippedIds[card.id]);
            return (
              <div
                key={card.id}
                onClick={() => toggleFlip(card.id)}
                className={`p-5 rounded-xl border min-h-[168px] flex flex-col justify-between gap-4 cursor-pointer transition select-none shadow-2xs ${
                  isFlipped
                    ? 'border-emerald-500/50 bg-emerald-500/5'
                    : `${theme.cardClass} ${theme.cardHoverClass}`
                }`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded ${
                      isFlipped
                        ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                        : 'bg-violet-500/15 text-violet-700 dark:text-violet-300'
                    }`}
                  >
                    Card #{card.id} • {isFlipped ? 'Back (Answer)' : 'Front (Prompt)'}
                  </span>
                  <RotateCcw className="w-3.5 h-3.5 text-zinc-400" />
                </div>

                <div className={`text-xs leading-relaxed whitespace-pre-wrap ${
                  isFlipped ? theme.textSecondary : `font-semibold ${theme.headingFont} ${theme.textPrimary}`
                }`}>
                  {isFlipped ? card.back : card.front}
                </div>

                <div className="text-[10px] font-mono text-zinc-400 flex items-center justify-between pt-2 border-t border-zinc-200/60 dark:border-zinc-800/60">
                  <span>Click card to {isFlipped ? 'show prompt' : 'reveal answer'}</span>
                  <span>#{card.id} of {cards.length}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Storage Provenance Footer */}
      <div className={`p-3.5 rounded-xl border font-mono text-[10px] space-y-1 ${theme.quoteBox}`}>
        <div>GCS Storage Path: {studio.gcs_uri || '-'}</div>
        {studio.sha256_hash && <div>SHA-256 Integrity: {studio.sha256_hash}</div>}
      </div>
    </div>
  );
};

export default FlashcardsRenderer;
