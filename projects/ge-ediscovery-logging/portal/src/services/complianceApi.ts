import { getActiveAuthToken } from './firebaseAuth';

export interface ComplianceDataResponse {
  processed_logs: any[];
  sources: any[];
  chat: any[];
  studio: any[];
  notebook_raw_logs: any[];
  sandbox_artifacts: any[];
  fetched_at: string;
  is_live: boolean;
  cached?: boolean;
  error?: string;
  http_status?: number;
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  try {
    const token = await getActiveAuthToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  } catch {
    // Rely on same-origin IAP cookies/headers when no explicit Bearer token is set.
  }
  return headers;
}

export async function fetchLiveComplianceLogs(forceRefresh = false): Promise<ComplianceDataResponse> {
  try {
    const url = `/api/logs?force_refresh=${forceRefresh ? 'true' : 'false'}`;
    const headers = await getAuthHeaders();
    const response = await fetch(url, {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      headers,
    });

    if (response.ok) {
      const data = await response.json();
      return {
        processed_logs: data.processed_logs || [],
        sources: data.sources || [],
        chat: data.chat || [],
        studio: data.studio || [],
        notebook_raw_logs: data.notebook_raw_logs || [],
        sandbox_artifacts: data.sandbox_artifacts || [],
        fetched_at: data.fetched_at || new Date().toISOString(),
        is_live: true,
        cached: data.cached,
        http_status: response.status,
      };
    }

    let serverError = `Compliance API returned HTTP ${response.status}.`;
    try {
      const errBody = await response.json();
      if (typeof errBody?.error === 'string' && errBody.error.trim()) {
        serverError = errBody.error.trim();
      }
    } catch {
      // Keep status message when non-JSON body is returned.
    }

    return {
      processed_logs: [],
      sources: [],
      chat: [],
      studio: [],
      notebook_raw_logs: [],
      sandbox_artifacts: [],
      fetched_at: new Date().toISOString(),
      is_live: false,
      error: serverError,
      http_status: response.status,
    };
  } catch {
    return {
      processed_logs: [],
      sources: [],
      chat: [],
      studio: [],
      notebook_raw_logs: [],
      sandbox_artifacts: [],
      fetched_at: new Date().toISOString(),
      is_live: false,
      error: 'Network error while fetching compliance telemetry from /api/logs.',
    };
  }
}

/**
 * Fetch signed or direct media proxy URL for native in-browser media rendering/streaming.
 * Credentials are never placed in URL query parameters.
 */
export async function fetchSignedUrl(gcsUri: string): Promise<string> {
  if (!gcsUri) return '';
  if (gcsUri.startsWith('http://') || gcsUri.startsWith('https://')) {
    return gcsUri;
  }
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/signed-url?gcs_uri=${encodeURIComponent(gcsUri)}`, {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      headers,
    });
    if (res.ok) {
      const data = await res.json();
      return data.url || `/api/media?gcs_uri=${encodeURIComponent(gcsUri)}`;
    }
  } catch {
    // Fall back to authenticated same-origin /api/media proxy.
  }
  return `/api/media?gcs_uri=${encodeURIComponent(gcsUri)}`;
}

export function getCleanExtension(urlOrUri?: string): string {
  if (!urlOrUri) return '';
  try {
    const parsed = new URL(urlOrUri, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
    const gcsParam = parsed.searchParams.get('gcs_uri');
    const target = gcsParam || parsed.pathname;
    return target.split('?')[0].split('#')[0].toLowerCase();
  } catch {
    return urlOrUri.split('?')[0].split('#')[0].toLowerCase();
  }
}

export function getDirectMediaUrl(gcsUri?: string): string {
  if (!gcsUri) return '';
  if (gcsUri.startsWith('http://') || gcsUri.startsWith('https://')) {
    return gcsUri;
  }
  const cleanUri = gcsUri.startsWith('gs://') ? gcsUri : `gs://${gcsUri}`;
  return `/api/media?gcs_uri=${encodeURIComponent(cleanUri)}`;
}

/**
 * Search BigQuery directly using inverted search indexes.
 */
export async function searchBigQuery(
  query: string,
  userEmail = ''
): Promise<{
  matched_sessions: string[];
  matched_notebooks: string[];
  total_matches: number;
  search_dataset?: {
    processed_logs?: any[];
    sources?: any[];
    chat?: any[];
    studio?: any[];
    notebook_raw_logs?: any[];
  };
}> {
  if ((!query || query.trim().length < 2) && !userEmail) {
    return { matched_sessions: [], matched_notebooks: [], total_matches: 0 };
  }
  try {
    const params = new URLSearchParams();
    if (query) params.append('q', query);
    if (userEmail) params.append('user_email', userEmail);
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/search?${params.toString()}`, {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      headers,
    });
    if (res.ok) {
      return await res.json();
    }
  } catch {
    // Return empty match set on transient search error.
  }
  return { matched_sessions: [], matched_notebooks: [], total_matches: 0 };
}
