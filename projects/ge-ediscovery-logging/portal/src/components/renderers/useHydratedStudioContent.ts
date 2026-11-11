import { useState, useEffect } from 'react';
import { NotebookStudioRecord } from '../../types/schema';
import { getDirectMediaUrl } from '../../services/complianceApi';

const textContentCache = new Map<string, string>();

/**
 * Resolves inline `studio.note_content` or fetches archived text/markdown payload
 * from `getDirectMediaUrl(studio.gcs_uri)` when unhydrated.
 */
export function useHydratedStudioContent(studio: NotebookStudioRecord): {
  content: string;
  isLoading: boolean;
} {
  const inlineContent = studio.note_content?.trim() ? studio.note_content : '';
  const cacheKey = studio.gcs_uri || '';

  const [fetchedContent, setFetchedContent] = useState<string>(() => {
    if (inlineContent) return '';
    if (cacheKey && textContentCache.has(cacheKey)) {
      return textContentCache.get(cacheKey) || '';
    }
    return '';
  });
  const [isLoading, setIsLoading] = useState<boolean>(false);

  useEffect(() => {
    if (inlineContent || !cacheKey) {
      setIsLoading(false);
      return;
    }

    if (textContentCache.has(cacheKey)) {
      setFetchedContent(textContentCache.get(cacheKey) || '');
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    setIsLoading(true);

    void (async () => {
      try {
        const res = await fetch(getDirectMediaUrl(cacheKey), {
          signal: controller.signal,
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const rawText = await res.text();
        if (cancelled) return;

        let resolved = rawText;
        const trimmed = rawText.trim();
        if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
          try {
            const parsed = JSON.parse(trimmed);
            if (typeof parsed.markdown === 'string') {
              resolved = parsed.markdown;
            } else if (typeof parsed.content === 'string') {
              resolved = parsed.content;
            } else if (typeof parsed.note_content === 'string') {
              resolved = parsed.note_content;
            } else if (typeof parsed.text === 'string') {
              resolved = parsed.text;
            }
          } catch {
            // Keep raw text as-is
          }
        }

        textContentCache.set(cacheKey, resolved);
        setFetchedContent(resolved);
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') return;
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [inlineContent, cacheKey]);

  return {
    content: inlineContent || fetchedContent,
    isLoading: !inlineContent && isLoading,
  };
}
