import React, { useState, useMemo } from 'react';
import { NotebookStudioRecord } from '../../types/schema';
import { ThemeConfig } from '../../types/theme';
import { MarkdownContent } from '../MarkdownContent';
import { useHydratedStudioContent } from './useHydratedStudioContent';
import {
  HelpCircle,
  Search,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  Printer,
  Loader2,
} from 'lucide-react';

interface FaqItem {
  id: number;
  question: string;
  answer: string;
  category?: string;
}

interface FaqRendererProps {
  studio: NotebookStudioRecord;
  theme: ThemeConfig;
}

function parseFaqItems(content: string): FaqItem[] {
  const items: FaqItem[] = [];
  const lines = (content || '').split('\n');

  let currentQ = '';
  let currentA = '';
  let currentCat = 'General';
  let idCounter = 1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line.startsWith('#') && !line.includes('?')) {
      currentCat = line.replace(/^#+\s*/, '').trim();
      continue;
    }

    if (line.match(/^(?:Q\d*[:.]|\*{0,2}Q[:.]|###\s*Q:|\d+\.\s+)/i) || (line.startsWith('###') && line.includes('?')) || line.endsWith('?')) {
      if (currentQ && currentA) {
        items.push({ id: idCounter++, question: currentQ, answer: currentA, category: currentCat });
        currentA = '';
      }
      currentQ = line.replace(/^(?:###\s*Q:?|Q\d*[:.]|\*{0,2}Q[:.]|\d+\.\s+|###\s*)/i, '').trim();
    } else if (line.match(/^(?:A\d*[:.]|\*{0,2}A[:.]|Answer:)/i)) {
      currentA = line.replace(/^(?:A\d*[:.]|\*{0,2}A[:.]|Answer:)/i, '').trim();
    } else if (currentQ) {
      if (currentA) {
        currentA += '\n' + line;
      } else {
        currentA = line;
      }
    }
  }

  if (currentQ && currentA) {
    items.push({ id: idCounter++, question: currentQ, answer: currentA, category: currentCat });
  }

  return items;
}

export const FaqRenderer: React.FC<FaqRendererProps> = ({ studio, theme }) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [expandedItems, setExpandedItems] = useState<Record<number, boolean>>({ 1: true });
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const { content: hydratedContent, isLoading } = useHydratedStudioContent(studio);

  const faqItems = useMemo(() => parseFaqItems(hydratedContent || ''), [hydratedContent]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    faqItems.forEach((f) => {
      if (f.category) set.add(f.category);
    });
    return Array.from(set);
  }, [faqItems]);

  const filteredItems = useMemo(() => {
    return faqItems.filter((item) => {
      if (selectedCategory !== 'ALL' && item.category !== selectedCategory) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return item.question.toLowerCase().includes(q) || item.answer.toLowerCase().includes(q);
    });
  }, [faqItems, selectedCategory, searchQuery]);

  const toggleExpand = (id: number) => {
    setExpandedItems((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const copyItem = (item: FaqItem, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(`Q: ${item.question}\n\nA: ${item.answer}`);
    setCopiedId(item.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className={`rounded-2xl border overflow-hidden shadow-sm space-y-6 p-8 ${theme.cardClass}`}>
      {/* Header */}
      <div className="border-b pb-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-mono font-bold uppercase tracking-wider px-2.5 py-0.5 rounded bg-amber-500/20 text-amber-700 dark:text-amber-300">
              FAQ
            </span>
            <span className={`text-xs font-mono ${theme.textMuted}`}>
              {faqItems.length} Verified Questions & Answers
            </span>
          </div>

          <button
            onClick={() => window.print()}
            className={`p-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${theme.accentBtn}`}
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Export FAQ</span>
          </button>
        </div>

        <div>
          <h1 className={`${theme.headingFont} text-2xl font-bold ${theme.textPrimary}`}>
            {studio.title || 'Frequently Asked Questions'}
          </h1>
          <p className="text-xs text-zinc-500 mt-1">
            Grounded Q&A synthesis answering critical inquiries from ingested source materials.
          </p>
        </div>

        {/* Search and Category Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-zinc-400" />
            <input
              type="text"
              placeholder="Search questions or keywords..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`w-full pl-9 pr-3 py-2 text-xs rounded-xl border outline-none font-sans focus:ring-1 focus:ring-amber-500 ${theme.quoteBox}`}
            />
          </div>

          {categories.length > 1 && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setSelectedCategory('ALL')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  selectedCategory === 'ALL'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'hover:bg-black/5 dark:hover:bg-white/10'
                }`}
              >
                All
              </button>
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    selectedCategory === cat
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'hover:bg-black/5 dark:hover:bg-white/10'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Accordion Q&A Cards or Raw Markdown */}
      {isLoading ? (
        <div className={`p-8 rounded-xl border flex items-center justify-center gap-2.5 text-xs ${theme.quoteBox} ${theme.textSecondary}`}>
          <Loader2 className="w-4 h-4 animate-spin text-amber-600 dark:text-amber-400" />
          <span>Loading FAQ document from Cloud Storage...</span>
        </div>
      ) : faqItems.length === 0 ? (
        <div className={`prose prose-sm max-w-none text-xs ${theme.bodyFont} leading-relaxed ${theme.textPrimary} space-y-4`}>
          <MarkdownContent
            content={hydratedContent || '# FAQ\n\nNo FAQ content recorded.'}
            theme={theme}
          />
        </div>
      ) : (
        <div className="space-y-3">
          {filteredItems.length === 0 ? (
            <div className="text-center py-12 text-zinc-400 text-xs">
              No questions matched your search query.
            </div>
          ) : (
            filteredItems.map((item) => {
              const isExpanded = expandedItems[item.id];
              return (
                <div
                  key={item.id}
                  className={`rounded-xl border transition overflow-hidden shadow-2xs ${theme.cardClass}`}
                >
                  <div
                    onClick={() => toggleExpand(item.id)}
                    className="p-4 flex items-center justify-between gap-3 cursor-pointer hover:opacity-90 select-none"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-600 shrink-0">
                        <HelpCircle className="w-4 h-4" />
                      </div>
                      <span className={`text-xs font-semibold ${theme.headingFont} ${theme.textPrimary}`}>
                        {item.question}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={(e) => copyItem(item, e)}
                        className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 text-zinc-400 hover:text-zinc-600 transition"
                        title="Copy Q&A"
                      >
                        {copiedId === item.id ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-zinc-400" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-zinc-400" />
                      )}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className={`p-4 border-t text-xs ${theme.bodyFont} leading-relaxed whitespace-pre-wrap ${theme.quoteBox}`}>
                      <strong className="block text-[10px] font-mono uppercase tracking-wider mb-1 text-amber-700 dark:text-amber-400 font-bold">
                        Answer:
                      </strong>
                      {item.answer}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};

export default FaqRenderer;
