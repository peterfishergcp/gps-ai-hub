import React, { useState, useMemo } from 'react';
import { NotebookStudioRecord } from '../../types/schema';
import { ThemeConfig } from '../../types/theme';
import { MarkdownContent } from '../MarkdownContent';
import { useHydratedStudioContent } from './useHydratedStudioContent';
import {
  BookOpen,
  HelpCircle,
  Eye,
  EyeOff,
  CheckCircle2,
  Copy,
  Check,
  Printer,
  Layers,
  Loader2,
} from 'lucide-react';

interface StudyGuideRendererProps {
  studio: NotebookStudioRecord;
  theme: ThemeConfig;
}

interface QuizItem {
  id: number;
  question: string;
  answer: string;
}

interface ConceptItem {
  term: string;
  definition: string;
}

/**
 * Parses study guide text to extract structured flashcards/quiz questions and terms.
 */
function extractStudyItems(content: string): { quizItems: QuizItem[]; concepts: ConceptItem[] } {
  const quizItems: QuizItem[] = [];
  const concepts: ConceptItem[] = [];

  const lines = (content || '').split('\n');
  let currentQ = '';
  let currentA = '';
  let idCounter = 1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Match Question / Answer patterns
    if (line.match(/^(?:Q\d*[:.]|\*{0,2}Question\s*\d*[:.]|\d+\.\s+)/i) && line.includes('?')) {
      if (currentQ && currentA) {
        quizItems.push({ id: idCounter++, question: currentQ, answer: currentA });
        currentA = '';
      }
      currentQ = line.replace(/^(?:Q\d*[:.]|\*{0,2}Question\s*\d*[:.]|\d+\.\s+)/i, '').trim();
    } else if (line.match(/^(?:A\d*[:.]|\*{0,2}Answer[:.]|Answer:)/i)) {
      currentA = line.replace(/^(?:A\d*[:.]|\*{0,2}Answer[:.]|Answer:)/i, '').trim();
    } else if (currentQ && !currentA && (line.startsWith('A:') || line.startsWith('- Answer:'))) {
      currentA = line.replace(/^(?:A:|[-*]\s*Answer:)/i, '').trim();
    } else if (currentQ && currentA) {
      currentA += ' ' + line;
    }

    // Match Glossary / Concept term definitions (e.g. "**Term**: Definition" or "- **Term**: Definition")
    const termMatch = line.match(/^[-*]?\s*\*\*([^*]+)\*\*:\s*(.+)$/);
    if (termMatch) {
      concepts.push({
        term: termMatch[1].trim(),
        definition: termMatch[2].trim(),
      });
    }
  }

  if (currentQ && currentA) {
    quizItems.push({ id: idCounter++, question: currentQ, answer: currentA });
  }

  return { quizItems, concepts };
}

export const StudyGuideRenderer: React.FC<StudyGuideRendererProps> = ({ studio, theme }) => {
  const [activeTab, setActiveTab] = useState<'guide' | 'concepts' | 'quiz'>('guide');
  const [revealedAnswers, setRevealedAnswers] = useState<Record<number, boolean>>({});
  const [copied, setCopied] = useState<boolean>(false);
  const { content: hydratedContent, isLoading } = useHydratedStudioContent(studio);

  const { quizItems, concepts } = useMemo(
    () => extractStudyItems(hydratedContent || ''),
    [hydratedContent]
  );

  const toggleReveal = (id: number) => {
    setRevealedAnswers((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(`# ${studio.title}\n\n${hydratedContent || ''}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`rounded-2xl border overflow-hidden shadow-sm space-y-6 p-8 ${theme.cardClass}`}>
      {/* Header Banner */}
      <div className="border-b pb-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-mono font-bold uppercase tracking-wider px-2.5 py-0.5 rounded bg-blue-500/20 text-blue-700 dark:text-blue-300">
              Study Guide
            </span>
            <span className={`text-xs font-mono ${theme.textMuted}`}>
              {concepts.length} Key Concepts • {quizItems.length} Practice Questions
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className={`p-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${theme.quoteBox}`}
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied' : 'Copy Guide'}</span>
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
            {studio.title || 'Study Guide'}
          </h1>
          <p className="text-xs text-zinc-500 mt-1">
            Structured educational review synthesized from grounded source documents.
          </p>
        </div>

        {/* Tab Switcher (only shown if terms or quiz items are parsed) */}
        {(concepts.length > 0 || quizItems.length > 0) && (
          <div className={`flex items-center gap-1 p-1 rounded-xl border w-fit ${theme.quoteBox}`}>
            <button
              onClick={() => setActiveTab('guide')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                activeTab === 'guide'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'hover:bg-black/5 dark:hover:bg-white/10'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Full Guide</span>
            </button>
            {concepts.length > 0 && (
              <button
                onClick={() => setActiveTab('concepts')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  activeTab === 'concepts'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'hover:bg-black/5 dark:hover:bg-white/10'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Key Terms ({concepts.length})</span>
              </button>
            )}
            {quizItems.length > 0 && (
              <button
                onClick={() => setActiveTab('quiz')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  activeTab === 'quiz'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'hover:bg-black/5 dark:hover:bg-white/10'
                }`}
              >
                <HelpCircle className="w-3.5 h-3.5" />
                <span>Practice Quiz ({quizItems.length})</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* TAB 1: FULL GUIDE */}
      {isLoading ? (
        <div className={`p-8 rounded-xl border flex items-center justify-center gap-2.5 text-xs ${theme.quoteBox} ${theme.textSecondary}`}>
          <Loader2 className="w-4 h-4 animate-spin text-blue-600 dark:text-blue-400" />
          <span>Loading study guide from Cloud Storage...</span>
        </div>
      ) : activeTab === 'guide' && (
        <div className={`prose prose-sm max-w-none text-xs ${theme.bodyFont} leading-relaxed ${theme.textPrimary} space-y-4`}>
          <MarkdownContent
            content={hydratedContent || '# Study Notes\n\nNo guide text preserved.'}
            theme={theme}
          />
        </div>
      )}

      {/* TAB 2: KEY CONCEPTS GLOSSARY */}
      {activeTab === 'concepts' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {concepts.map((c, idx) => (
            <div
              key={idx}
              className={`p-4 rounded-xl border space-y-2 shadow-2xs ${theme.cardClass}`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-xs font-bold ${theme.headingFont} text-blue-600 dark:text-blue-400`}>
                  {c.term}
                </span>
                <CheckCircle2 className="w-3.5 h-3.5 text-blue-500 opacity-60" />
              </div>
              <p className={`text-xs leading-relaxed ${theme.textSecondary}`}>
                {c.definition}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* TAB 3: ACTIVE RECALL / PRACTICE QUIZ */}
      {activeTab === 'quiz' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-500">
              Click &quot;Reveal Answer&quot; to test active recall.
            </span>
            <button
              onClick={() => {
                const allRevealed = Object.keys(revealedAnswers).length === quizItems.length;
                if (allRevealed) {
                  setRevealedAnswers({});
                } else {
                  const all: Record<number, boolean> = {};
                  quizItems.forEach((q) => (all[q.id] = true));
                  setRevealedAnswers(all);
                }
              }}
              className="text-xs font-mono font-bold text-blue-600 hover:underline cursor-pointer"
            >
              {Object.keys(revealedAnswers).length === quizItems.length ? 'Hide All Answers' : 'Reveal All Answers'}
            </button>
          </div>

          <div className="space-y-3">
            {quizItems.map((q) => {
              const isRevealed = revealedAnswers[q.id];
              return (
                <div
                  key={q.id}
                  className={`p-4 rounded-xl border space-y-3 shadow-2xs ${theme.cardClass}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1 min-w-0">
                      <span className="text-[10px] font-mono font-bold text-blue-600 dark:text-blue-400">
                        QUESTION #{q.id}
                      </span>
                      <h4 className={`text-xs font-semibold ${theme.headingFont} ${theme.textPrimary}`}>
                        {q.question}
                      </h4>
                    </div>

                    <button
                      onClick={() => toggleReveal(q.id)}
                      className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold flex items-center gap-1 transition cursor-pointer shrink-0 ${theme.quoteBox}`}
                    >
                      {isRevealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      <span>{isRevealed ? 'Hide' : 'Reveal'}</span>
                    </button>
                  </div>

                  {isRevealed && (
                    <div className="p-3 rounded-lg bg-blue-50/70 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-xs text-blue-950 dark:text-blue-200 leading-relaxed animate-fadeIn">
                      <strong className="block text-[10px] font-mono uppercase tracking-wider mb-1 text-blue-700 dark:text-blue-300">
                        Grounded Answer:
                      </strong>
                      {q.answer}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default StudyGuideRenderer;
