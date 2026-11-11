/**
 * Universal safe array helper for BigQuery / JSON fields.
 * Guarantees that any input (arrays, JSON strings, objects, null, undefined)
 * is safely resolved to a standard JavaScript Array.
 */
export function ensureArray<T = any>(val: any): T[] {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed || trimmed === 'null' || trimmed === 'undefined') return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed;
      if (parsed && typeof parsed === 'object') return [parsed as T];
    } catch {
      return [];
    }
  }
  if (typeof val === 'object') {
    return [val as T];
  }
  return [];
}

/**
 * Fast timestamp parser avoiding Date instance allocations.
 */
export function parseTimestamp(val?: string | null): number {
  if (!val) return 0;
  const parsed = Date.parse(val);
  return Number.isNaN(parsed) ? 0 : parsed;
}

