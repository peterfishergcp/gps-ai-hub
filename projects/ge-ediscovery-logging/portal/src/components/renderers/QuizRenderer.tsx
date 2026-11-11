import React, { useState, useEffect, useMemo } from 'react';
import { NotebookStudioRecord } from '../../types/schema';
import { ThemeConfig } from '../../types/theme';
import { getDirectMediaUrl } from '../../services/complianceApi';
import {
  HelpCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  Printer,
  Loader2,
  Download,
  Sparkles,
} from 'lucide-react';

interface NormalizedQuizOption {
  index: number;
  label: string;
  isCorrect: boolean;
  rationale?: string;
}

interface NormalizedQuizQuestion {
  id: number;
  question: string;
  options: NormalizedQuizOption[];
  shortAnswer?: string;
  rationale?: string;
  difficulty?: string;
}

interface QuizRendererProps {
  studio: NotebookStudioRecord;
  theme: ThemeConfig;
}

const quizCache = new Map<string, string>();

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

function cleanDifficultyLabel(raw?: unknown): string {
  if (!raw || typeof raw !== 'string') return 'Standard';
  const stripped = raw
    .replace(/^QUIZ_DIFFICULTY_/i, '')
    .replace(/^DIFFICULTY_/i, '')
    .replace(/_/g, ' ')
    .trim();
  if (!stripped || stripped.toUpperCase() === 'UNSPECIFIED') return 'Standard';
  return stripped.charAt(0).toUpperCase() + stripped.slice(1).toLowerCase();
}

function parseQuizPayload(studio: NotebookStudioRecord, rawFetchedText?: string): {
  questions: NormalizedQuizQuestion[];
  difficulty: string;
} {
  const candidates: any[] = [];

  if (studio.quiz_data) candidates.push(safeJsonParse(studio.quiz_data) ?? studio.quiz_data);
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
    if (appObj.quiz) candidates.push(appObj.quiz);
    if (respArt.quiz) candidates.push(respArt.quiz);
    if (parsedMeta.quiz) candidates.push(parsedMeta.quiz);
    if (parsedMeta.questions) candidates.push(parsedMeta);
  }

  let rawQuestions: any[] = [];
  let rawDifficulty: string | undefined =
    parsedCustomOpts.difficulty ||
    parsedMeta.quizDifficulty ||
    parsedMeta.quiz_difficulty;

  for (const cand of candidates) {
    if (!cand) continue;
    if (Array.isArray(cand) && cand.length > 0) {
      rawQuestions = cand;
      break;
    }
    if (typeof cand === 'object') {
      if (!rawDifficulty) {
        rawDifficulty =
          cand.quizDifficulty ||
          cand.quiz_difficulty ||
          cand.difficulty ||
          cand.quiz?.quizDifficulty ||
          cand.quiz?.difficulty;
      }
      const list =
        (Array.isArray(cand.questions) && cand.questions) ||
        (Array.isArray(cand.quiz) && cand.quiz) ||
        (Array.isArray(cand.quiz?.questions) && cand.quiz.questions) ||
        (Array.isArray(cand.items) && cand.items);
      if (list && list.length > 0) {
        rawQuestions = list;
        break;
      }
    }
  }

  const questions: NormalizedQuizQuestion[] = rawQuestions.map((item: any, idx: number) => {
    const qText =
      item?.question ||
      item?.prompt ||
      item?.text ||
      item?.stem ||
      item?.title ||
      `Question ${idx + 1}`;

    const rawOpts: any[] =
      item?.answerOptions ||
      item?.answer_options ||
      item?.options ||
      item?.choices ||
      item?.answers ||
      [];

    const explicitCorrectIdx =
      typeof item?.correctAnswerIndex === 'number'
        ? item.correctAnswerIndex
        : typeof item?.correct_answer_index === 'number'
          ? item.correct_answer_index
          : typeof item?.correctOptionIndex === 'number'
            ? item.correctOptionIndex
            : typeof item?.correctIndex === 'number'
              ? item.correctIndex
              : typeof item?.answerIndex === 'number'
                ? item.answerIndex
                : undefined;

    const correctStr =
      typeof item?.correctAnswer === 'string'
        ? item.correctAnswer.trim()
        : typeof item?.correct_answer === 'string'
          ? item.correct_answer.trim()
          : typeof item?.answer === 'string'
            ? item.answer.trim()
            : '';

    const normalizedOpts: NormalizedQuizOption[] = Array.isArray(rawOpts)
      ? rawOpts.map((opt: any, oIdx: number) => {
          const optText =
            typeof opt === 'string'
              ? opt
              : opt?.text || opt?.label || opt?.answer || opt?.option || String(opt?.value ?? '');
          const optRationale =
            typeof opt === 'object' ? opt?.rationale || opt?.explanation || opt?.feedback : undefined;

          let isCorrect = Boolean(
            typeof opt === 'object' && (opt?.isCorrect || opt?.is_correct || opt?.correct)
          );
          if (!isCorrect && explicitCorrectIdx !== undefined && explicitCorrectIdx === oIdx) {
            isCorrect = true;
          }
          if (!isCorrect && correctStr) {
            if (
              optText.toLowerCase().trim() === correctStr.toLowerCase() ||
              String.fromCharCode(65 + oIdx) === correctStr.toUpperCase() ||
              String(oIdx + 1) === correctStr
            ) {
              isCorrect = true;
            }
          }

          return {
            index: oIdx,
            label: optText,
            isCorrect,
            rationale: optRationale,
          };
        })
      : [];

    const correctOptObj = normalizedOpts.find((o) => o.isCorrect);
    const rationale =
      item?.rationale ||
      item?.explanation ||
      item?.hint ||
      item?.feedback ||
      correctOptObj?.rationale ||
      undefined;

    return {
      id: idx + 1,
      question: qText,
      options: normalizedOpts,
      shortAnswer: normalizedOpts.length === 0 ? correctStr || undefined : undefined,
      rationale,
      difficulty: item?.difficulty ? cleanDifficultyLabel(item.difficulty) : undefined,
    };
  });

  return {
    questions,
    difficulty: cleanDifficultyLabel(rawDifficulty),
  };
}

export const QuizRenderer: React.FC<QuizRendererProps> = ({ studio, theme }) => {
  const cacheKey = studio.gcs_uri || '';
  const [fetchedRaw, setFetchedRaw] = useState<string>(() =>
    cacheKey && quizCache.has(cacheKey) ? quizCache.get(cacheKey) || '' : ''
  );
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [selectedOptions, setSelectedOptions] = useState<Record<number, number>>({});
  const [expandedRationales, setExpandedRationales] = useState<Record<number, boolean>>({});
  const [copied, setCopied] = useState<boolean>(false);

  const initialParsed = useMemo(() => parseQuizPayload(studio, fetchedRaw), [studio, fetchedRaw]);

  useEffect(() => {
    if (initialParsed.questions.length > 0 || !cacheKey) {
      setIsLoading(false);
      return;
    }
    if (quizCache.has(cacheKey)) {
      setFetchedRaw(quizCache.get(cacheKey) || '');
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
        quizCache.set(cacheKey, text);
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
  }, [initialParsed.questions.length, cacheKey]);

  const { questions, difficulty } = initialParsed;
  const directUrl = studio.gcs_uri ? getDirectMediaUrl(studio.gcs_uri) : undefined;

  const toggleRationale = (qId: number) => {
    setExpandedRationales((prev) => ({ ...prev, [qId]: !prev[qId] }));
  };

  const handleToggleAllRationales = () => {
    const allOpen = questions.length > 0 && questions.every((q) => expandedRationales[q.id]);
    if (allOpen) {
      setExpandedRationales({});
    } else {
      const next: Record<number, boolean> = {};
      questions.forEach((q) => {
        next[q.id] = true;
      });
      setExpandedRationales(next);
    }
  };

  const handleCopy = () => {
    const text = questions
      .map((q) => {
        const opts = q.options
          .map((o, i) => `  ${i + 1}. ${o.label}${o.isCorrect ? ' [Correct Answer]' : ''}`)
          .join('\n');
        const ans = q.shortAnswer ? `\n  Answer: ${q.shortAnswer}` : '';
        const rat = q.rationale ? `\n  Rationale: ${q.rationale}` : '';
        return `Q${q.id}: ${q.question}\n${opts}${ans}${rat}`;
      })
      .join('\n\n');
    navigator.clipboard.writeText(`# ${studio.title || 'Quiz Assessment'}\n\n${text}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`rounded-2xl border overflow-hidden shadow-sm space-y-6 p-8 ${theme.cardClass}`}>
      {/* Header */}
      <div className="border-b pb-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[9px] font-mono font-bold uppercase tracking-wider px-2.5 py-0.5 rounded bg-indigo-500/20 text-indigo-700 dark:text-indigo-300">
              Quiz
            </span>
            <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded border border-indigo-500/30 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300">
              Difficulty: {difficulty}
            </span>
            <span className={`text-xs font-mono ${theme.textMuted}`}>
              {questions.length} {questions.length === 1 ? 'Question' : 'Questions'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {questions.some((q) => q.rationale || q.options.some((o) => o.rationale)) && (
              <button
                type="button"
                onClick={handleToggleAllRationales}
                className={`p-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${theme.quoteBox}`}
              >
                <HelpCircle className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                <span>
                  {questions.every((q) => expandedRationales[q.id]) ? 'Collapse Rationales' : 'Expand All Rationales'}
                </span>
              </button>
            )}
            <button
              type="button"
              onClick={handleCopy}
              className={`p-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${theme.quoteBox}`}
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied' : 'Copy Quiz'}</span>
            </button>
            {directUrl ? (
              <a
                href={directUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={`p-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${theme.accentBtn}`}
              >
                <Download className="w-3.5 h-3.5" />
                <span>JSON Source</span>
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
            {studio.title || 'Interactive Practice Quiz'}
          </h1>
          <p className="text-xs text-zinc-500 mt-1">
            Structured assessment with numbered answer choices, verified answer key, and grounded rationales.
          </p>
        </div>

        {studio.user_steering_prompt && (
          <div className={`p-3.5 rounded-xl border text-xs leading-relaxed flex items-start gap-2 ${theme.quoteBox}`}>
            <Sparkles className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
            <span className={theme.textSecondary}>{studio.user_steering_prompt}</span>
          </div>
        )}
      </div>

      {/* Loading State */}
      {isLoading ? (
        <div className={`p-8 rounded-xl border flex items-center justify-center gap-2.5 text-xs ${theme.quoteBox} ${theme.textSecondary}`}>
          <Loader2 className="w-4 h-4 animate-spin text-indigo-600 dark:text-indigo-400" />
          <span>Hydrating quiz questions from Cloud Storage...</span>
        </div>
      ) : questions.length === 0 ? (
        <div className={`p-6 rounded-xl border text-xs whitespace-pre-wrap ${theme.quoteBox} ${theme.textSecondary}`}>
          {studio.note_content || fetchedRaw || 'No structured quiz questions available for this record.'}
        </div>
      ) : (
        <div className="space-y-4">
          {questions.map((q) => {
            const selectedIdx = selectedOptions[q.id];
            const isRationaleOpen = Boolean(expandedRationales[q.id]);
            const effectiveRationale =
              q.rationale ||
              (selectedIdx !== undefined ? q.options[selectedIdx]?.rationale : undefined) ||
              q.options.find((o) => o.isCorrect)?.rationale;

            return (
              <div
                key={q.id}
                className={`p-5 rounded-xl border space-y-4 shadow-2xs transition ${theme.cardClass}`}
              >
                {/* Question Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-indigo-500/15 text-indigo-700 dark:text-indigo-300">
                        QUESTION #{q.id}
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded border border-zinc-300/60 dark:border-zinc-700/60 text-zinc-600 dark:text-zinc-300">
                        {q.difficulty || difficulty}
                      </span>
                    </div>
                    <h3 className={`text-sm font-semibold leading-snug ${theme.headingFont} ${theme.textPrimary}`}>
                      {q.question}
                    </h3>
                  </div>
                </div>

                {/* Numbered Multiple-Choice Options */}
                {q.options.length > 0 ? (
                  <div className="space-y-2">
                    {q.options.map((opt) => {
                      const isSelected = selectedIdx === opt.index;
                      const isCorrect = opt.isCorrect;

                      const optionClasses = isCorrect
                        ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-950 dark:text-emerald-100'
                        : isSelected
                          ? 'border-rose-500/50 bg-rose-500/10 text-rose-950 dark:text-rose-100'
                          : `${theme.quoteBox} ${theme.textPrimary} hover:border-indigo-400/60`;

                      return (
                        <div
                          key={opt.index}
                          onClick={() =>
                            setSelectedOptions((prev) => ({
                              ...prev,
                              [q.id]: opt.index,
                            }))
                          }
                          className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-3 transition cursor-pointer ${optionClasses}`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span
                              className={`w-5 h-5 rounded-md font-mono text-[10px] font-bold flex items-center justify-center shrink-0 ${
                                isCorrect
                                  ? 'bg-emerald-600 text-white'
                                  : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300'
                              }`}
                            >
                              {opt.index + 1}
                            </span>
                            <span className="leading-relaxed">{opt.label}</span>
                          </div>

                          {isCorrect && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-600 text-white shrink-0">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>Correct Answer</span>
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  q.shortAnswer && (
                    <div className="p-3.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 text-xs space-y-1">
                      <div className="flex items-center gap-1.5 font-mono text-[10px] font-bold text-emerald-700 dark:text-emerald-300 uppercase">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Verified Answer Key</span>
                      </div>
                      <p className="text-emerald-950 dark:text-emerald-100 leading-relaxed">{q.shortAnswer}</p>
                    </div>
                  )
                )}

                {/* Rationale / Explanation Accordion */}
                {effectiveRationale && (
                  <div className={`rounded-xl border overflow-hidden ${theme.quoteBox}`}>
                    <button
                      type="button"
                      onClick={() => toggleRationale(q.id)}
                      className="w-full px-3.5 py-2 flex items-center justify-between text-xs font-mono font-semibold text-indigo-700 dark:text-indigo-300 hover:opacity-80 transition cursor-pointer"
                    >
                      <span>Rationale & Grounded Explanation</span>
                      {isRationaleOpen ? (
                        <ChevronDown className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5" />
                      )}
                    </button>
                    {isRationaleOpen && (
                      <div className={`px-3.5 py-3 border-t text-xs leading-relaxed ${theme.textSecondary}`}>
                        {effectiveRationale}
                      </div>
                    )}
                  </div>
                )}
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

export default QuizRenderer;
