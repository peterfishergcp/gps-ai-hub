/**
 * PresentationViewer.tsx
 * ---------------------------------------------------------------------------
 * Gemini Enterprise Compliance Review Portal: Slide Deck Evidence Viewer.
 *
 * SECURITY ARCHITECTURE:
 *  • Zero third-party CDN script loading: PDF decks render via a native
 *    same-origin `<iframe src="/api/media?gcs_uri=...#page=N&view=Fit">` backed
 *    by the authenticated `/api/media` endpoint (`X-Frame-Options: SAMEORIGIN`,
 *    `frame-ancestors 'self'`).
 *  • Zero unsafe React raw-HTML props or direct DOM HTML string assignments:
 *    HTML / Markdown decks are sanitized with DOMPurify + DOMParser +
 *    XMLSerializer and rendered inside a zero-privilege `<iframe sandbox="">`
 *    (`srcDoc`), preventing script execution, form submission, and parent-origin
 *    access at the browser engine boundary.
 *  • Zero `localStorage` or `sessionStorage` writes.
 * ---------------------------------------------------------------------------
 */

import React, {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import DOMPurify from 'dompurify';
import type { ThemeConfig } from '../../types/theme';
import { getDirectMediaUrl, getCleanExtension } from '../../services/complianceApi';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  Grid,
  Layers,
  Loader2,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  Presentation,
  RotateCcw,
  ShieldAlert,
  Timer,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

/* ========================================================================== */
/* 1. PUBLIC TYPES                                                            */
/* ========================================================================== */

export interface ParsedSlide {
  index: number;
  id: string;
  title: string;
  htmlContent: string;
  plainText: string;
  notes?: string;
}

export interface PresentationViewerProps {
  title: string;
  gcsUri?: string;
  previewUrl?: string;
  webUrl?: string;
  mimeType?: string;
  rawHtml?: string;
  snippet?: string;
  sizeBytes?: number;
  sha256?: string;
  slideCount?: number;
  theme: ThemeConfig;
  className?: string;
  onClose?: () => void;
}

type ViewMode = 'SLIDE' | 'GRID';
type DeckKind = 'PDF' | 'HTML';
type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

interface Size {
  w: number;
  h: number;
}

/* ========================================================================== */
/* 2. CONSTANTS & UTILITIES                                                   */
/* ========================================================================== */

const MIN_ZOOM = 1;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.25;

const AUTOPLAY_INTERVALS = [3000, 5000, 10000] as const;
type AutoplayInterval = (typeof AUTOPLAY_INTERVALS)[number];

/** Stable, collision-resistant key for anonymous URLs (FNV-1a 32). */
function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

const clamp = (value: number, min: number, max: number): number =>
  value < min ? min : value > max ? max : value;

const formatBytes = (bytes?: number): string => {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

function escapeHtmlText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Always-fresh callback identity-stable across renders (avoids effect churn). */
function useEventCallback<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  const ref = useRef(fn);
  useLayoutEffect(() => {
    ref.current = fn;
  });
  return useCallback((...args: A) => ref.current(...args), []);
}

/** ResizeObserver-backed element measurement, integer-quantized to stop loops. */
function useElementSize<T extends HTMLElement>(): [React.RefObject<T>, Size] {
  const ref = useRef<T>(null);
  const [size, setSize] = useState<Size>({ w: 0, h: 0 });

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;

    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect) return;
      const next = { w: Math.round(rect.width), h: Math.round(rect.height) };
      setSize((prev) => (prev.w === next.w && prev.h === next.h ? prev : next));
    });

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return [ref, size];
}

const BLOCKED_TAGS = new Set([
  'SCRIPT', 'IFRAME', 'OBJECT', 'EMBED', 'LINK', 'META', 'BASE', 'FORM', 'INPUT', 'BUTTON',
  'SVG', 'FOREIGNOBJECT', 'MATH', 'STYLE', 'TEMPLATE', 'NOSCRIPT', 'NOEMBED', 'NOFRAMES',
  'XMP', 'PLAINTEXT', 'TITLE', 'TEXTAREA', 'MARQUEE', 'APPLET',
]);

/** Serializes the child nodes of an element using XMLSerializer without touching innerHTML. */
function serializeElementChildren(container: Element): string {
  const serializer = new XMLSerializer();
  const parts: string[] = [];
  container.childNodes.forEach((child) => {
    parts.push(serializer.serializeToString(child));
  });
  return parts.join('');
}

/** Strips executable, read-beacon, and mutation-XSS vectors; DOMPurify is the terminal step. */
function sanitizeHtml(html: string): string {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(`<div id="ge-root">${html}</div>`, 'text/html');
  const root = doc.getElementById('ge-root');
  if (!root) return '';

  root.querySelectorAll('*').forEach((el) => {
    const tag = el.tagName.toUpperCase();
    if (BLOCKED_TAGS.has(tag)) {
      el.remove();
      return;
    }
    Array.from(el.attributes).forEach(({ name, value }) => {
      const attr = name.toLowerCase();
      const isUrlAttr =
        attr === 'href' ||
        attr === 'src' ||
        attr === 'xlink:href' ||
        attr === 'action' ||
        attr === 'formaction' ||
        attr === 'data' ||
        attr === 'poster';
      if (attr.startsWith('on') || attr === 'srcdoc' || attr === 'formaction' || attr === 'style') {
        el.removeAttribute(name);
        return;
      }
      if (isUrlAttr) {
        const normalized = value.replace(/[\u0000-\u0020]+/g, '');
        const isSafeHttpLink = tag === 'A' && attr === 'href' && /^https?:\/\//i.test(normalized);
        const isSafeMailto = tag === 'A' && attr === 'href' && /^mailto:/i.test(normalized);
        const isSafeRelative = normalized.startsWith('/api/media?') || normalized.startsWith('#');
        const isSafeDataImg =
          tag === 'IMG' &&
          attr === 'src' &&
          /^data:image\/(png|jpeg|jpg|gif|webp);base64,[a-z0-9+/=]+$/i.test(normalized);
        if (!isSafeHttpLink && !isSafeMailto && !isSafeRelative && !isSafeDataImg) {
          el.removeAttribute(name);
        }
      }
    });
  });

  const preCleaned = serializeElementChildren(root);
  return DOMPurify.sanitize(preCleaned, {
    FORBID_TAGS: Array.from(BLOCKED_TAGS).map((t) => t.toLowerCase()),
    FORBID_ATTR: ['style', 'srcdoc', 'formaction', 'action', 'xlink:href'],
    ALLOW_DATA_ATTR: false,
  });
}

/** Sanitizes slide deck CSS so it cannot break out of `<style>` or import external resources. */
function sanitizeScopedCss(css: string): string {
  if (!css.trim()) return '';
  return css
    .replace(/<\/style/gi, '')
    .replace(/@import[^;]+;/gi, '')
    .replace(/url\s*\([^)]*\)/gi, 'none')
    .replace(/expression\s*\([^)]*\)/gi, 'none');
}

/* ========================================================================== */
/* 3. HTML DECK PARSER (public API preserved, zero innerHTML usage)           */
/* ========================================================================== */

export function parseHtmlIntoSlides(htmlText: string): {
  slides: ParsedSlide[];
  styles: string;
  documentTitle: string;
} {
  if (!htmlText || !htmlText.trim()) return { slides: [], styles: '', documentTitle: '' };

  const doc = new DOMParser().parseFromString(htmlText, 'text/html');
  const styles = Array.from(doc.querySelectorAll('style'))
    .map((node) => node.textContent || '')
    .join('\n');
  const documentTitle = doc.title || '';

  const SELECTOR_TIERS = [
    '.reveal .slides > section, .slides > section',
    'body > section, main > section, section.slide, section[data-slide]',
    'section',
    '.slide, .slide-container > div, .page, article.slide, [data-slide], .swiper-slide, .carousel-item',
  ];

  let nodes: Element[] = [];
  for (const selector of SELECTOR_TIERS) {
    nodes = Array.from(doc.querySelectorAll(selector));
    if (nodes.length > 0) break;
  }

  if (nodes.length === 0) {
    const children = Array.from(doc.body.children).filter(
      (el) => !['STYLE', 'SCRIPT', 'NOSCRIPT', 'LINK', 'META'].includes(el.tagName),
    );
    if (children.length > 1) nodes = children;
  }
  if (nodes.length === 0 && (doc.body.textContent || '').trim()) {
    nodes = [doc.body];
  }

  const slides = nodes.map<ParsedSlide>((node, index) => {
    const clone = node.cloneNode(true) as HTMLElement;

    const noteEl = clone.querySelector('aside.notes, .notes, .speaker-notes, [data-speaker-notes]');
    const notes = noteEl?.textContent?.trim() || undefined;
    noteEl?.remove();

    const heading = clone.querySelector('h1, h2, h3, h4, .slide-title, [data-title], header');
    let title = heading?.textContent?.trim() ?? '';
    if (!title) {
      const firstLine = clone.textContent?.trim().split('\n')[0] ?? '';
      title = firstLine.length > 45 ? `${firstLine.slice(0, 45)}…` : firstLine || `Slide ${index + 1}`;
    }

    const serialized = serializeElementChildren(clone);
    return {
      index,
      id: node.id || `slide-${index + 1}`,
      title,
      htmlContent: serialized || `<p>${escapeHtmlText(clone.textContent?.trim() ?? '')}</p>`,
      plainText: clone.textContent?.trim() ?? '',
      notes,
    };
  });

  return { slides, styles, documentTitle };
}

/* ========================================================================== */
/* 4. AUTOPLAY HOOK                                                           */
/* ========================================================================== */

function useAutoplay(
  enabled: boolean,
  intervalMs: number,
  resetToken: number,
  barRef: React.RefObject<HTMLDivElement>,
  onAdvance: () => void,
): void {
  const advance = useEventCallback(onAdvance);

  useEffect(() => {
    const bar = barRef.current;
    if (!enabled) {
      if (bar) bar.style.transform = 'scaleX(0)';
      return;
    }

    let frame = 0;
    let start = performance.now();

    const tick = (now: number): void => {
      const progress = Math.min(1, (now - start) / intervalMs);
      if (barRef.current) barRef.current.style.transform = `scaleX(${progress})`;
      if (progress >= 1) {
        start = now;
        advance();
      }
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      if (barRef.current) barRef.current.style.transform = 'scaleX(0)';
    };
  }, [enabled, intervalMs, resetToken, advance, barRef]);
}

/* ========================================================================== */
/* 5. NATIVE SAME-ORIGIN PDF SLIDE STAGE (ZERO THIRD-PARTY CDN)               */
/* ========================================================================== */

interface PdfSlideFrameProps {
  directUrl: string;
  pageNumber: number;
  zoom: number;
}

const PdfSlideFrame = memo<PdfSlideFrameProps>(function PdfSlideFrame({
  directUrl,
  pageNumber,
  zoom,
}) {
  const [stageRef, stage] = useElementSize<HTMLDivElement>();
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setLoaded(false);
  }, [directUrl, pageNumber]);

  const box = useMemo<Size>(() => {
    if (stage.w < 8 || stage.h < 8) return { w: 0, h: 0 };
    const width = Math.min(stage.w, (stage.h * 16) / 9);
    return { w: Math.round(width), h: Math.round((width * 9) / 16) };
  }, [stage.w, stage.h]);

  const frameSrc = useMemo(() => {
    const base = directUrl.split('#')[0];
    return `${base}#page=${pageNumber}&view=Fit&toolbar=0&navpanes=0`;
  }, [directUrl, pageNumber]);

  return (
    <div ref={stageRef} className="relative flex h-full w-full items-center justify-center overflow-hidden">
      <div
        className="overflow-hidden rounded-xl border border-slate-700/70 bg-white shadow-2xl shadow-black/60"
        style={{
          width: box.w || '100%',
          height: box.h || '100%',
          transform: `scale(${zoom})`,
          transition: 'transform 140ms cubic-bezier(0.16,1,0.3,1)',
        }}
      >
        <iframe
          key={`pdf-frame-${pageNumber}`}
          src={frameSrc}
          title={`PDF Slide ${pageNumber}`}
          referrerPolicy="no-referrer"
          onLoad={() => setLoaded(true)}
          className="h-full w-full border-0 bg-white"
        />
      </div>
      {!loaded && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-950/40">
          <Loader2 className="h-7 w-7 animate-spin text-orange-500" />
        </div>
      )}
    </div>
  );
});

/* ========================================================================== */
/* 6. SANDBOXED HTML / MARKDOWN SLIDE STAGE (`<iframe sandbox="" srcDoc>`)     */
/* ========================================================================== */

interface HtmlSlideStageProps {
  slide: ParsedSlide;
  sanitizedCss: string;
  index: number;
  zoom: number;
}

const HtmlSlideStage = memo<HtmlSlideStageProps>(function HtmlSlideStage({
  slide,
  sanitizedCss,
  index,
  zoom,
}) {
  const [stageRef, stage] = useElementSize<HTMLDivElement>();
  const sanitizedMarkup = useMemo(() => sanitizeHtml(slide.htmlContent), [slide.htmlContent]);

  const slideSrcDoc = useMemo(() => {
    return [
      '<!DOCTYPE html>',
      '<html lang="en"><head><meta charset="utf-8">',
      "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; style-src 'unsafe-inline'; img-src data: blob:;\">",
      '<style>',
      'html,body{margin:0;padding:16px 22px;background:#0f172a;color:#e2e8f0;font-family:system-ui,-apple-system,sans-serif;line-height:1.6;font-size:14px;}',
      'h1,h2,h3,h4{color:#7dd3fc;margin-top:0.25em;}',
      'a{color:#38bdf8;word-break:break-all;}',
      'pre,code{background:#020617;padding:2px 6px;border-radius:6px;font-family:ui-monospace,monospace;font-size:12px;}',
      'table{border-collapse:collapse;width:100%;margin:8px 0;}',
      'th,td{border:1px solid #334155;padding:6px 10px;text-align:left;}',
      sanitizedCss,
      '</style></head><body>',
      sanitizedMarkup,
      '</body></html>',
    ].join('\n');
  }, [sanitizedCss, sanitizedMarkup]);

  const box = useMemo<Size>(() => {
    if (stage.w < 8 || stage.h < 8) return { w: 0, h: 0 };
    const width = Math.min(stage.w, (stage.h * 16) / 9);
    return { w: Math.round(width), h: Math.round((width * 9) / 16) };
  }, [stage.w, stage.h]);

  return (
    <div ref={stageRef} className="relative flex h-full w-full items-center justify-center overflow-hidden">
      <article
        key={slide.id}
        className="ge-fade flex flex-col overflow-hidden rounded-xl border border-slate-700/70 bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 shadow-2xl shadow-black/60"
        style={{
          width: box.w || '100%',
          height: box.h || '100%',
          transform: `scale(${zoom})`,
          transition: 'transform 140ms cubic-bezier(0.16,1,0.3,1)',
        }}
      >
        <header className="flex shrink-0 items-center justify-between border-b border-slate-800/80 px-5 py-2.5">
          <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-orange-400">
            Slide #{index + 1}
          </span>
          <h2 className="max-w-[70%] truncate text-sm font-bold text-sky-300">{slide.title}</h2>
        </header>
        <iframe
          sandbox=""
          referrerPolicy="no-referrer"
          srcDoc={slideSrcDoc}
          title={`Slide ${index + 1}: ${slide.title}`}
          className="w-full flex-1 border-0 bg-slate-900"
        />
      </article>
    </div>
  );
});

/* ========================================================================== */
/* 7. THUMBNAIL RAIL + GRID                                                   */
/* ========================================================================== */

interface ThumbCardProps {
  index: number;
  label: string;
  previewText?: string;
  active: boolean;
  variant: 'rail' | 'grid';
  onSelect: (index: number) => void;
}

const ThumbCard = memo<ThumbCardProps>(function ThumbCard({
  index,
  label,
  previewText,
  active,
  variant,
  onSelect,
}) {
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (active && variant === 'rail') {
      ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [active, variant]);

  return (
    <button
      ref={ref}
      type="button"
      aria-current={active}
      onClick={() => onSelect(index)}
      title={`Slide ${index + 1}${label ? `: ${label}` : ''}`}
      className={`group flex w-full shrink-0 flex-col overflow-hidden rounded-xl border text-left transition-all duration-150 ${
        active
          ? 'border-orange-500 bg-orange-950/40 shadow-lg shadow-orange-900/30 ring-2 ring-orange-500/60'
          : 'border-slate-800/80 bg-slate-900/60 hover:border-slate-600 hover:bg-slate-900 hover:shadow-lg'
      }`}
    >
      <div className="relative flex aspect-video min-h-[90px] w-full flex-col justify-between overflow-hidden border-b border-slate-800/60 bg-slate-950 p-2.5 pt-7">
        {previewText ? (
          <p className="line-clamp-3 text-[10px] leading-relaxed text-slate-400">
            {previewText}
          </p>
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-slate-500">
            <Presentation className="h-5 w-5 opacity-50" />
            <span className="font-mono text-[9px]">Page {index + 1}</span>
          </div>
        )}
        <span
          className={`absolute left-1.5 top-1.5 rounded px-1.5 py-0.5 font-mono text-[9px] font-bold shadow-md ${
            active ? 'bg-orange-500 text-slate-950' : 'border border-slate-700/60 bg-slate-950/90 text-slate-300'
          }`}
        >
          #{index + 1}
        </span>
      </div>
      <div className="px-2 py-1.5">
        <span
          className={`block truncate text-[10px] font-medium ${
            active ? 'font-semibold text-orange-300' : 'text-slate-400 group-hover:text-slate-200'
          }`}
        >
          {label || `Slide ${index + 1}`}
        </span>
      </div>
    </button>
  );
});

/* ========================================================================== */
/* 8. TOOLBAR PRIMITIVE                                                       */
/* ========================================================================== */

interface ToolbarButtonProps {
  icon: React.ReactNode;
  title: string;
  label?: string;
  active?: boolean;
  disabled?: boolean;
  tone?: 'default' | 'accent' | 'success';
  labelClass?: string;
  theme: ThemeConfig;
  onClick: () => void;
}

const ToolbarButton = memo<ToolbarButtonProps>(function ToolbarButton({
  icon,
  title,
  label,
  active = false,
  disabled = false,
  tone = 'default',
  labelClass = 'hidden md:inline',
  theme,
  onClick,
}) {
  const activeClass =
    tone === 'success'
      ? 'border-emerald-400 bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
      : theme.accentBtn;

  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex cursor-pointer items-center gap-1 rounded-lg border p-1.5 text-[11px] font-semibold shadow-2xs transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-40 ${
        active ? activeClass : `${theme.cardClass} ${theme.textSecondary} hover:${theme.textPrimary} hover:brightness-110`
      }`}
    >
      {icon}
      {label && <span className={labelClass}>{label}</span>}
    </button>
  );
});

/* ========================================================================== */
/* 9. MAIN COMPONENT                                                          */
/* ========================================================================== */

export const PresentationViewer: React.FC<PresentationViewerProps> = ({
  title,
  gcsUri,
  previewUrl,
  webUrl,
  mimeType,
  rawHtml,
  snippet,
  sizeBytes,
  sha256,
  slideCount: propSlideCount,
  theme,
  className = '',
  onClose,
}) => {
  /* ---- Source resolution ------------------------------------------------- */
  const directUrl = useMemo<string | undefined>(() => {
    if (previewUrl) return previewUrl;
    if (gcsUri) return getDirectMediaUrl(gcsUri);
    return webUrl;
  }, [previewUrl, gcsUri, webUrl]);

  const deckKind = useMemo<DeckKind>(() => {
    const cleanGcs = getCleanExtension(gcsUri);
    const cleanDirect = getCleanExtension(directUrl);
    const cleanWeb = getCleanExtension(webUrl);
    const cleanPreview = getCleanExtension(previewUrl);
    const cleanTitle = (title || '').toLowerCase();
    const cleanMime = (mimeType || '').toLowerCase();

    if (
      cleanMime.includes('pdf') ||
      cleanGcs.endsWith('.pdf') ||
      cleanDirect.endsWith('.pdf') ||
      cleanWeb.endsWith('.pdf') ||
      cleanPreview.endsWith('.pdf') ||
      cleanTitle.endsWith('.pdf') ||
      cleanGcs.includes('/pdf') ||
      cleanDirect.includes('/pdf')
    ) {
      return 'PDF';
    }
    return 'HTML';
  }, [title, gcsUri, directUrl, webUrl, previewUrl, mimeType]);

  /* ---- State ------------------------------------------------------------- */
  const [currentIndex, setCurrentIndex] = useState(0);
  const [parsedSlides, setParsedSlides] = useState<ParsedSlide[]>([]);
  const [docStyles, setDocStyles] = useState('');
  const [docTitle, setDocTitle] = useState(title);
  const [htmlStatus, setHtmlStatus] = useState<LoadStatus>('idle');
  const [pdfPageEstimate, setPdfPageEstimate] = useState<number>(Math.max(1, propSlideCount ?? 1));
  const [pdfStatus, setPdfStatus] = useState<LoadStatus>('idle');
  const [pdfError, setPdfError] = useState<string | null>(null);

  const [viewMode, setViewMode] = useState<ViewMode>('SLIDE');
  const [showRail, setShowRail] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [autoplayMs, setAutoplayMs] = useState<AutoplayInterval>(5000);
  const [zoom, setZoom] = useState(1);

  const containerRef = useRef<HTMLDivElement>(null);
  const autoplayBarRef = useRef<HTMLDivElement>(null);
  const focusedRef = useRef(false);

  const isPdf = deckKind === 'PDF';

  /* ---- Lightweight PDF page-count probe (same-origin fetch, zero CDN) ----- */
  useEffect(() => {
    if (!isPdf) {
      setPdfStatus('idle');
      setPdfError(null);
      return;
    }
    if (!directUrl) {
      setPdfStatus('error');
      setPdfError('No evidence URL available for this PDF deck.');
      return;
    }

    if (propSlideCount && propSlideCount > 0) {
      setPdfPageEstimate(propSlideCount);
      setPdfStatus('ready');
      setPdfError(null);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    setPdfStatus('loading');
    setPdfError(null);

    void (async () => {
      try {
        const resp = await fetch(directUrl, {
          method: 'GET',
          credentials: 'same-origin',
          signal: controller.signal,
        });
        if (!resp.ok) {
          throw new Error(`Document fetch failed (HTTP ${resp.status})`);
        }
        const buf = await resp.arrayBuffer();
        if (cancelled) return;
        const latin1 = new TextDecoder('latin1').decode(buf);
        const matches = latin1.match(/\/Type\s*\/Page\b(?!s)/g);
        const estimated = matches && matches.length > 0 ? matches.length : 1;
        setPdfPageEstimate(Math.max(1, estimated));
        setPdfStatus('ready');
      } catch (err) {
        if (cancelled || (err as Error)?.name === 'AbortError') return;
        // Still allow native iframe fallback if directUrl exists
        setPdfPageEstimate(Math.max(1, propSlideCount ?? 1));
        setPdfStatus('ready');
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [isPdf, directUrl, propSlideCount]);

  /* ---- HTML pipeline ----------------------------------------------------- */
  useEffect(() => {
    if (isPdf) {
      setHtmlStatus('idle');
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    setHtmlStatus('loading');

    void (async () => {
      let source = rawHtml || snippet || '';

      if (!source && directUrl) {
        try {
          const response = await fetch(directUrl, {
            credentials: 'same-origin',
            signal: controller.signal,
          });
          if (response.ok) {
            const text = await response.text();
            if (/<(html|body|section|div|article)/i.test(text)) source = text;
          }
        } catch {
          /* fall through to placeholder deck */
        }
      }
      if (cancelled) return;

      if (source.trim()) {
        const { slides, styles, documentTitle } = parseHtmlIntoSlides(source);
        setParsedSlides(
          slides.length > 0
            ? slides
            : [
                {
                  index: 0,
                  id: 'slide-1',
                  title: title || 'Slide 1',
                  htmlContent: `<p>${escapeHtmlText(source.replace(/<[^>]*>?/gm, ''))}</p>`,
                  plainText: source.replace(/<[^>]*>?/gm, ''),
                },
              ],
        );
        setDocStyles(styles);
        setDocTitle(documentTitle || title);
      } else {
        const count = Math.max(1, propSlideCount ?? 1);
        setParsedSlides(
          Array.from({ length: count }, (_, i) => ({
            index: i,
            id: `slide-${i + 1}`,
            title: `Slide ${i + 1}`,
            htmlContent:
              '<p>Inline preview unavailable for this artifact. Open or download the original evidence file to review its contents.</p>',
            plainText: 'Preview unavailable',
          })),
        );
        setDocTitle(title);
      }
      setHtmlStatus('ready');
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [isPdf, rawHtml, snippet, directUrl, title, propSlideCount]);

  const sanitizedCss = useMemo(() => sanitizeScopedCss(docStyles), [docStyles]);

  /* ---- Unified deck model ------------------------------------------------ */
  const totalSlides = useMemo(() => {
    if (isPdf) return Math.max(1, pdfPageEstimate);
    return Math.max(1, parsedSlides.length || propSlideCount || 1);
  }, [isPdf, pdfPageEstimate, parsedSlides.length, propSlideCount]);

  const labels = useMemo<string[]>(
    () =>
      Array.from({ length: totalSlides }, (_, i) =>
        isPdf ? `Slide ${i + 1}` : parsedSlides[i]?.title || `Slide ${i + 1}`,
      ),
    [totalSlides, isPdf, parsedSlides],
  );

  useEffect(() => {
    setCurrentIndex((prev) => clamp(prev, 0, totalSlides - 1));
  }, [totalSlides]);

  const status: LoadStatus = isPdf ? pdfStatus : htmlStatus;
  const errorMessage = isPdf ? pdfError : null;

  /* ---- Navigation -------------------------------------------------------- */
  const goToSlide = useCallback(
    (index: number) => {
      setCurrentIndex((prev) => {
        const next = clamp(index, 0, totalSlides - 1);
        if (next !== prev) setZoom(1);
        return next;
      });
    },
    [totalSlides],
  );

  const step = useCallback(
    (delta: number, wrap = false) => {
      setCurrentIndex((prev) => {
        const raw = prev + delta;
        const next = wrap ? (raw + totalSlides) % totalSlides : clamp(raw, 0, totalSlides - 1);
        if (next !== prev) setZoom(1);
        return next;
      });
    },
    [totalSlides],
  );

  const nextSlide = useCallback(() => step(1), [step]);
  const prevSlide = useCallback(() => step(-1), [step]);
  const advanceAutoplay = useCallback(() => step(1, true), [step]);

  useAutoplay(isPlaying && viewMode === 'SLIDE', autoplayMs, currentIndex, autoplayBarRef, advanceAutoplay);

  const cycleAutoplayInterval = useCallback(() => {
    setAutoplayMs((prev) => {
      const idx = AUTOPLAY_INTERVALS.indexOf(prev);
      return AUTOPLAY_INTERVALS[(idx + 1) % AUTOPLAY_INTERVALS.length];
    });
  }, []);

  /* ---- Fullscreen -------------------------------------------------------- */
  const toggleFullscreen = useCallback(() => {
    const node = containerRef.current;
    if (!node) return;
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    else void node.requestFullscreen().catch(() => undefined);
  }, []);

  useEffect(() => {
    const onChange = (): void => setIsFullscreen(document.fullscreenElement === containerRef.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  /* ---- Keyboard ---------------------------------------------------------- */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      if (target && (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable)) return;
      if (!focusedRef.current && !isFullscreen) return;

      switch (event.key) {
        case 'ArrowRight':
        case 'ArrowDown':
        case 'PageDown':
        case ' ':
          event.preventDefault();
          nextSlide();
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
        case 'PageUp':
          event.preventDefault();
          prevSlide();
          break;
        case 'Home':
          event.preventDefault();
          goToSlide(0);
          break;
        case 'End':
          event.preventDefault();
          goToSlide(totalSlides - 1);
          break;
        case 'Escape':
          if (viewMode === 'GRID') {
            event.preventDefault();
            setViewMode('SLIDE');
          } else if (document.fullscreenElement) {
            void document.exitFullscreen().catch(() => undefined);
          }
          break;
        default:
          if (event.ctrlKey || event.metaKey || event.altKey) return;
          if (event.key.toLowerCase() === 'f') {
            event.preventDefault();
            toggleFullscreen();
          } else if (event.key.toLowerCase() === 'g') {
            event.preventDefault();
            setViewMode((mode) => (mode === 'GRID' ? 'SLIDE' : 'GRID'));
          }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [nextSlide, prevSlide, goToSlide, toggleFullscreen, totalSlides, viewMode, isFullscreen]);

  /* ---- Actions ----------------------------------------------------------- */
  const openInNewTab = useCallback(() => {
    if (directUrl) window.open(directUrl, '_blank', 'noopener,noreferrer');
  }, [directUrl]);

  const currentSlide = parsedSlides[currentIndex] ?? parsedSlides[0] ?? null;
  const railVisible = showRail && viewMode === 'SLIDE' && totalSlides > 1;
  const deckHashSuffix = useMemo(() => (sha256 ? sha256.slice(0, 10) : fnv1a(directUrl ?? title)), [sha256, directUrl, title]);

  /* ---- Render ------------------------------------------------------------ */
  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      role="region"
      aria-label={`Presentation viewer: ${docTitle}`}
      onMouseEnter={() => {
        focusedRef.current = true;
      }}
      onMouseLeave={() => {
        focusedRef.current = false;
      }}
      onFocusCapture={() => {
        focusedRef.current = true;
      }}
      className={`flex select-none flex-col overflow-hidden rounded-2xl border shadow-lg outline-none transition-all duration-200 ${
        isFullscreen
          ? 'fixed inset-0 z-50 h-screen w-screen rounded-none bg-slate-950 text-white'
          : `h-[560px] w-full ${theme.cardClass}`
      } ${className}`}
    >
      <style>{`
        @keyframes geFade { from { opacity:0; transform:translateY(4px) } to { opacity:1; transform:none } }
        .ge-fade { animation: geFade .22s cubic-bezier(.16,1,.3,1) }
        .ge-scroll::-webkit-scrollbar { width:6px; height:6px }
        .ge-scroll::-webkit-scrollbar-thumb { background:#334155; border-radius:9999px }
        .ge-scroll::-webkit-scrollbar-track { background:transparent }
      `}</style>

      {/* ================= TOOLBAR ================= */}
      <header
        className={`flex shrink-0 items-center justify-between gap-3 border-b px-4 py-2.5 ${theme.sidebarHeaderClass}`}
      >
        <div className="flex min-w-0 items-center gap-3">
          <div className="shrink-0 rounded-lg bg-orange-500/15 p-1.5 text-orange-600 dark:text-orange-400">
            <Presentation className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-orange-500/20 px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-orange-700 dark:text-orange-300">
                Slide Deck
              </span>
              <span
                className={`rounded-md border px-2.5 py-0.5 font-mono text-xs font-bold shadow-2xs ${theme.badgePill}`}
              >
                Slide {currentIndex + 1} of {totalSlides}
              </span>
              {isPlaying && (
                <span className="inline-flex animate-pulse items-center gap-1 font-mono text-[10px] text-emerald-600 dark:text-emerald-400">
                  <Play className="h-3 w-3 fill-current" />
                  Autoplay {autoplayMs / 1000}s
                </span>
              )}
            </div>
            <h3 className={`${theme.headingFont} mt-0.5 max-w-sm truncate text-xs font-bold ${theme.textPrimary}`}>
              {docTitle}
            </h3>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          <div className={`flex items-center rounded-lg border p-0.5 ${theme.quoteBox}`}>
            <button
              type="button"
              onClick={prevSlide}
              disabled={currentIndex === 0}
              title="Previous slide (← / ↑)"
              className={`flex cursor-pointer items-center gap-1 rounded-md p-1.5 text-[11px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${theme.textPrimary}`}
            >
              <ChevronLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Prev</span>
            </button>
            <span className="px-2 font-mono text-[11px] font-bold text-zinc-500 dark:text-zinc-400">
              {currentIndex + 1}/{totalSlides}
            </span>
            <button
              type="button"
              onClick={nextSlide}
              disabled={currentIndex >= totalSlides - 1}
              title="Next slide (→ / ↓ / Space)"
              className={`flex cursor-pointer items-center gap-1 rounded-md p-1.5 text-[11px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${theme.textPrimary}`}
            >
              <span className="hidden sm:inline">Next</span>
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <ToolbarButton
            theme={theme}
            icon={<Layers className="h-3.5 w-3.5" />}
            label="Slides"
            title="Toggle slide rail"
            active={showRail}
            onClick={() => setShowRail((value) => !value)}
          />
          <ToolbarButton
            theme={theme}
            icon={<Grid className="h-3.5 w-3.5" />}
            label={viewMode === 'GRID' ? 'Single' : 'Grid'}
            title="Toggle grid overview (G)"
            active={viewMode === 'GRID'}
            onClick={() => setViewMode((mode) => (mode === 'GRID' ? 'SLIDE' : 'GRID'))}
          />

          {viewMode === 'SLIDE' && (
            <div className={`flex items-center rounded-lg border p-0.5 ${theme.quoteBox}`}>
              <button
                type="button"
                title="Zoom out"
                disabled={zoom <= MIN_ZOOM}
                onClick={() => setZoom((z) => clamp(z - ZOOM_STEP, MIN_ZOOM, MAX_ZOOM))}
                className={`cursor-pointer rounded-md p-1.5 transition disabled:opacity-40 ${theme.textPrimary}`}
              >
                <ZoomOut className="h-3.5 w-3.5" />
              </button>
              <span className="w-10 text-center font-mono text-[10px] font-bold text-zinc-500 dark:text-zinc-400">
                {Math.round(zoom * 100)}%
              </span>
              <button
                type="button"
                title="Zoom in"
                disabled={zoom >= MAX_ZOOM}
                onClick={() => setZoom((z) => clamp(z + ZOOM_STEP, MIN_ZOOM, MAX_ZOOM))}
                className={`cursor-pointer rounded-md p-1.5 transition disabled:opacity-40 ${theme.textPrimary}`}
              >
                <ZoomIn className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                title="Reset to page fit"
                disabled={zoom === 1}
                onClick={() => setZoom(1)}
                className={`cursor-pointer rounded-md p-1.5 transition disabled:opacity-40 ${theme.textPrimary}`}
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          <ToolbarButton
            theme={theme}
            tone="success"
            icon={isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            title={isPlaying ? 'Pause slideshow' : 'Start slideshow'}
            active={isPlaying}
            onClick={() => setIsPlaying((value) => !value)}
          />
          <ToolbarButton
            theme={theme}
            icon={<Timer className="h-3.5 w-3.5" />}
            label={`${autoplayMs / 1000}s`}
            labelClass="inline"
            title="Cycle autoplay interval (3s / 5s / 10s)"
            onClick={cycleAutoplayInterval}
          />
          <ToolbarButton
            theme={theme}
            icon={isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            title={isFullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen (F)'}
            onClick={toggleFullscreen}
          />

          {directUrl && (
            <>
              <a
                href={directUrl.includes('?') ? `${directUrl}&download=true` : directUrl}
                download
                target="_blank"
                rel="noopener noreferrer"
                title="Download original file"
                className={`inline-flex cursor-pointer items-center gap-1 rounded-lg border p-1.5 text-[11px] font-semibold shadow-2xs transition ${theme.accentBtn}`}
              >
                <Download className="h-3.5 w-3.5" />
                <span className="hidden lg:inline">Download</span>
              </a>
              <ToolbarButton
                theme={theme}
                icon={<ExternalLink className="h-3.5 w-3.5" />}
                title="Open in new tab"
                onClick={openInNewTab}
              />
            </>
          )}

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              title="Close presentation"
              className="ml-1 rounded-lg p-1.5 text-zinc-400 transition hover:bg-zinc-200 hover:text-zinc-600 dark:hover:bg-zinc-800"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </header>

      {/* ================= PROGRESS ================= */}
      <div className="shrink-0">
        <div className="h-1 w-full bg-slate-800">
          <div
            className="h-full bg-gradient-to-r from-orange-500 via-amber-500 to-sky-500 transition-[width] duration-300"
            style={{ width: `${((currentIndex + 1) / totalSlides) * 100}%` }}
          />
        </div>
        <div className="h-0.5 w-full overflow-hidden bg-transparent">
          <div
            ref={autoplayBarRef}
            className="h-full w-full origin-left bg-emerald-400/80"
            style={{ transform: 'scaleX(0)' }}
          />
        </div>
      </div>

      {/* ================= STAGE ================= */}
      <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden bg-slate-950">
        {railVisible && (
          <aside className="ge-scroll z-10 flex w-48 shrink-0 flex-col gap-2 overflow-y-auto border-r border-slate-800 bg-slate-950/95 p-2 sm:w-60">
            <div className="mb-0.5 flex items-center justify-between border-b border-slate-800/80 px-1.5 py-1 font-mono text-[10px]">
              <span className="font-bold uppercase tracking-wider text-orange-400">Slides ({totalSlides})</span>
            </div>
            {labels.map((label, index) => (
              <ThumbCard
                key={`rail-${index}`}
                index={index}
                label={label}
                previewText={!isPdf ? parsedSlides[index]?.plainText.slice(0, 120) : undefined}
                active={index === currentIndex}
                variant="rail"
                onSelect={goToSlide}
              />
            ))}
          </aside>
        )}

        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {status === 'loading' ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center text-zinc-400">
              <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
              <p className="font-mono text-xs">
                {isPdf ? 'Preparing PDF viewer…' : 'Parsing slide deck…'}
              </p>
            </div>
          ) : status === 'error' ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
              <ShieldAlert className="h-8 w-8 text-rose-400" />
              <p className="font-mono text-xs text-rose-300">{errorMessage}</p>
              <p className="max-w-sm text-[11px] text-zinc-500">
                Inline preview was unavailable. The original artifact remains accessible through the secured evidence link.
              </p>
              {directUrl && (
                <button
                  type="button"
                  onClick={openInNewTab}
                  className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold ${theme.accentBtn}`}
                >
                  <ExternalLink className="h-4 w-4" />
                  Open in external tab
                </button>
              )}
            </div>
          ) : viewMode === 'GRID' ? (
            <div className="ge-scroll grid flex-1 grid-cols-1 gap-4 overflow-y-auto bg-slate-900/90 p-6 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
              {labels.map((label, index) => (
                <ThumbCard
                  key={`grid-${index}`}
                  index={index}
                  label={label}
                  previewText={!isPdf ? parsedSlides[index]?.plainText.slice(0, 120) : undefined}
                  active={index === currentIndex}
                  variant="grid"
                  onSelect={(i) => {
                    goToSlide(i);
                    setViewMode('SLIDE');
                  }}
                />
              ))}
            </div>
          ) : (
            <div className="group/stage relative flex min-h-0 flex-1 flex-col overflow-hidden">
              <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden p-2 sm:p-4">
                {isPdf && directUrl ? (
                  <PdfSlideFrame
                    directUrl={directUrl}
                    pageNumber={currentIndex + 1}
                    zoom={zoom}
                  />
                ) : currentSlide ? (
                  <HtmlSlideStage
                    slide={currentSlide}
                    sanitizedCss={sanitizedCss}
                    index={currentIndex}
                    zoom={zoom}
                  />
                ) : null}

                {totalSlides > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={prevSlide}
                      disabled={currentIndex === 0}
                      title="Previous slide (←)"
                      className="absolute left-4 top-1/2 -translate-y-1/2 cursor-pointer rounded-full border border-slate-700 bg-slate-900/80 p-3 text-white opacity-0 shadow-xl backdrop-blur-md transition-all hover:scale-110 hover:bg-slate-800 group-hover/stage:opacity-100 disabled:pointer-events-none disabled:!opacity-0"
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </button>
                    <button
                      type="button"
                      onClick={nextSlide}
                      disabled={currentIndex >= totalSlides - 1}
                      title="Next slide (→)"
                      className="absolute right-4 top-1/2 -translate-y-1/2 cursor-pointer rounded-full border border-slate-700 bg-slate-900/80 p-3 text-white opacity-0 shadow-xl backdrop-blur-md transition-all hover:scale-110 hover:bg-slate-800 group-hover/stage:opacity-100 disabled:pointer-events-none disabled:!opacity-0"
                    >
                      <ChevronRight className="h-5 w-5" />
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ================= FOOTER ================= */}
      <footer className="flex shrink-0 items-center justify-between border-t border-slate-800 bg-slate-950 px-4 py-1.5 font-mono text-[10px] text-zinc-400">
        <div className="flex items-center gap-2">
          <span>
            <kbd className="rounded bg-slate-800 px-1 py-0.5 text-zinc-300">←</kbd>{' '}
            <kbd className="rounded bg-slate-800 px-1 py-0.5 text-zinc-300">→</kbd> navigate
          </span>
          <span className="hidden sm:inline">•</span>
          <span className="hidden sm:inline">
            <kbd className="rounded bg-slate-800 px-1 py-0.5 text-zinc-300">F</kbd> fullscreen
          </span>
          <span className="hidden sm:inline">•</span>
          <span className="hidden sm:inline">
            <kbd className="rounded bg-slate-800 px-1 py-0.5 text-zinc-300">G</kbd> grid
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="truncate text-zinc-500">ID {deckHashSuffix}…</span>
          {sizeBytes ? <span>{formatBytes(sizeBytes)}</span> : null}
        </div>
      </footer>
    </div>
  );
};

export default PresentationViewer;
