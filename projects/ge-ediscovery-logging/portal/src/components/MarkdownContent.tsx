import React from 'react';
import { FileCheck, Terminal, ArrowRight } from 'lucide-react';
import { ThemeConfig } from '../types/theme';

interface MarkdownContentProps {
  content: string;
  theme: ThemeConfig;
  onArtifactClick?: (fileName: string) => void;
}

/**
 * Parses and renders Markdown text with support for:
 * - Headings (#, ##, ###)
 * - Bold (**text** or __text__)
 * - Italics (*text* or _text_)
 * - Inline code (`code`)
 * - Code blocks (```lang ... ```)
 * - Bullet lists (* item, - item)
 * - Numbered lists (1. item)
 * - System section tags ([[section: ...]])
 * - Embedded artifact badges ([FILE_UPLOAD: ...])
 */
export const MarkdownContent: React.FC<MarkdownContentProps> = ({
  content,
  theme,
  onArtifactClick,
}) => {
  if (!content) return null;

  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeBlockLines: string[] = [];
  let codeBlockLang = '';
  let listItems: React.ReactNode[] = [];
  let listType: 'ul' | 'ol' | null = null;

  const flushList = () => {
    if (listItems.length > 0) {
      if (listType === 'ul') {
        elements.push(
          <ul key={`ul-${elements.length}`} className="my-2 space-y-1.5 pl-4 list-disc marker:text-sky-500">
            {listItems}
          </ul>
        );
      } else if (listType === 'ol') {
        elements.push(
          <ol key={`ol-${elements.length}`} className="my-2 space-y-1.5 pl-4 list-decimal marker:font-bold marker:text-sky-500">
            {listItems}
          </ol>
        );
      }
      listItems = [];
      listType = null;
    }
  };

  const renderInline = (text: string, keyPrefix: string): React.ReactNode => {
    const tokenRegex = /(\[[A-Z_]+:\s*[^\]]+\]|\[\[section:\s*[^\]]+\]\]|`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_)/g;
    const parts = text.split(tokenRegex);

    return (
      <span key={keyPrefix}>
        {parts.map((part, i) => {
          const k = `${keyPrefix}-${i}`;
          if (!part) return null;

          // 1. Embedded Artifact
          if (part.startsWith('[FILE_UPLOAD:') || part.startsWith('[DOCUMENT:') || part.startsWith('[CODE_PREVIEW:')) {
            const fileName = part.replace(/^\[[A-Z_]+:\s*/, '').replace(/\]$/, '');
            return (
              <span
                key={k}
                onClick={(e) => {
                  e.stopPropagation();
                  onArtifactClick?.(fileName);
                }}
                className={`inline-flex items-center gap-1 mx-1 px-2 py-0.5 rounded border text-[11px] font-sans font-medium transition cursor-pointer hover:opacity-80 ${theme.quoteBox}`}
              >
                <FileCheck className="w-3 h-3 text-emerald-600" />
                <span>{fileName}</span>
              </span>
            );
          }

          // 2. System Section Chip
          if (part.startsWith('[[section:')) {
            const sectionName = part.replace(/^\[\[section:\s*/, '').replace(/\]\]$/, '');
            return (
              <span
                key={k}
                className="inline-flex items-center gap-1.5 my-1 px-2.5 py-1 rounded-md text-[11px] font-mono font-semibold bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20 shadow-2xs"
              >
                <ArrowRight className="w-3 h-3 text-sky-500" />
                <span>Step: {sectionName}</span>
              </span>
            );
          }

          // 3. Inline Code
          if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
            const codeText = part.slice(1, -1);
            return (
              <code
                key={k}
                className="font-mono text-[11px] px-1.5 py-0.5 mx-0.5 rounded bg-zinc-200/70 dark:bg-zinc-800 text-sky-600 dark:text-sky-300 border border-zinc-300/60 dark:border-zinc-700 font-medium"
              >
                {codeText}
              </code>
            );
          }

          // 4. Bold
          if (
            (part.startsWith('**') && part.endsWith('**') && part.length >= 4) ||
            (part.startsWith('__') && part.endsWith('__') && part.length >= 4)
          ) {
            const boldText = part.slice(2, -2);
            return (
              <strong key={k} className={`font-bold ${theme.textPrimary}`}>
                {renderInline(boldText, `${k}-b`)}
              </strong>
            );
          }

          // 5. Italic
          if (
            (part.startsWith('*') && part.endsWith('*') && part.length >= 2) ||
            (part.startsWith('_') && part.endsWith('_') && part.length >= 2)
          ) {
            const italicText = part.slice(1, -1);
            return (
              <em key={k} className="italic">
                {renderInline(italicText, `${k}-i`)}
              </em>
            );
          }

          return part;
        })}
      </span>
    );
  };

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    // Code block toggle
    if (trimmed.startsWith('```')) {
      if (inCodeBlock) {
        // End code block
        elements.push(
          <div key={`code-${i}`} className="my-3 rounded-lg overflow-hidden border border-zinc-700/60 bg-zinc-950 text-zinc-100 font-mono text-xs shadow-inner">
            {codeBlockLang && (
              <div className="px-3 py-1 bg-zinc-900 border-b border-zinc-800 text-[10px] text-zinc-400 flex items-center justify-between">
                <span className="uppercase tracking-wider">{codeBlockLang}</span>
                <Terminal className="w-3 h-3 text-zinc-500" />
              </div>
            )}
            <pre className="p-3 overflow-x-auto leading-relaxed">
              <code>{codeBlockLines.join('\n')}</code>
            </pre>
          </div>
        );
        codeBlockLines = [];
        codeBlockLang = '';
        inCodeBlock = false;
      } else {
        flushList();
        inCodeBlock = true;
        codeBlockLang = trimmed.slice(3).trim();
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockLines.push(rawLine);
      continue;
    }

    // Empty line
    if (!trimmed) {
      flushList();
      continue;
    }

    // Heading 1 (# ...)
    if (trimmed.startsWith('# ')) {
      flushList();
      elements.push(
        <h1 key={`h1-${i}`} className={`text-base font-bold mt-4 mb-2 pb-1 border-b ${theme.headingFont} ${theme.textPrimary}`}>
          {renderInline(trimmed.slice(2), `h1-${i}`)}
        </h1>
      );
      continue;
    }

    // Heading 2 (## ...)
    if (trimmed.startsWith('## ')) {
      flushList();
      elements.push(
        <h2 key={`h2-${i}`} className={`text-sm font-bold mt-3.5 mb-1.5 ${theme.headingFont} ${theme.textPrimary}`}>
          {renderInline(trimmed.slice(3), `h2-${i}`)}
        </h2>
      );
      continue;
    }

    // Heading 3 (### ...)
    if (trimmed.startsWith('### ')) {
      flushList();
      elements.push(
        <h3 key={`h3-${i}`} className={`text-xs font-bold mt-3 mb-1 uppercase tracking-wide ${theme.headingFont} ${theme.accentText}`}>
          {renderInline(trimmed.slice(4), `h3-${i}`)}
        </h3>
      );
      continue;
    }

    // Bullet List (* or -)
    if (/^[*+-]\s+/.test(trimmed)) {
      if (listType !== 'ul') {
        flushList();
        listType = 'ul';
      }
      const itemContent = trimmed.replace(/^[*+-]\s+/, '');
      listItems.push(
        <li key={`li-${i}`} className={`text-xs leading-relaxed ${theme.textSecondary}`}>
          {renderInline(itemContent, `li-${i}`)}
        </li>
      );
      continue;
    }

    // Numbered List (1. 2. ...)
    if (/^\d+\.\s+/.test(trimmed)) {
      if (listType !== 'ol') {
        flushList();
        listType = 'ol';
      }
      const itemContent = trimmed.replace(/^\d+\.\s+/, '');
      listItems.push(
        <li key={`oli-${i}`} className={`text-xs leading-relaxed ${theme.textSecondary}`}>
          {renderInline(itemContent, `oli-${i}`)}
        </li>
      );
      continue;
    }

    // Standalone Bold Header (e.g. **Searching Recent Emails**)
    if (/^\*\*[^*]+\*\*:?$/.test(trimmed)) {
      flushList();
      const headerTitle = trimmed.replace(/^\*\*|\*\*$/g, '').replace(/:$/, '');
      elements.push(
        <div key={`sh-${i}`} className="mt-3.5 mb-1 flex items-center gap-1.5">
          <span className={`text-xs font-bold ${theme.headingFont} ${theme.textPrimary}`}>
            {headerTitle}
          </span>
        </div>
      );
      continue;
    }

    // Standard Paragraph
    flushList();
    elements.push(
      <p key={`p-${i}`} className={`text-xs leading-relaxed mb-2.5 ${theme.textSecondary}`}>
        {renderInline(rawLine, `p-${i}`)}
      </p>
    );
  }

  flushList();

  return <div className="space-y-0.5">{elements}</div>;
};
