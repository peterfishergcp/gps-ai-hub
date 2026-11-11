/**
 * Identity & Session Adapter for the Cloud Run Compliance Review Portal.
 *
 * Authentication and authorization are enforced server-side at the Cloud Run +
 * Identity-Aware Proxy (IAP) boundary (`X-Goog-IAP-JWT-Assertion` ES256 JWT or
 * verified Google OIDC RS256 Bearer token) plus explicit reviewer RBAC allowlists
 * (`ALLOWED_REVIEWER_EMAILS` / `ALLOWED_REVIEWER_DOMAINS`).
 *
 * Security invariants:
 *  - Fails closed (`null`) whenever `/api/config` returns 401/403 or fails;
 *    never fabricates a synthetic reviewer identity.
 *  - Never stores session tokens or auth flags in `localStorage` or `sessionStorage`.
 *  - Clears in-memory/session caches and triggers an IAP cookie clear / full reload on logout.
 */
import { APP_CONFIG } from '../config/appConfig';

export interface User {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  getIdToken: () => Promise<string>;
}

type AuthListener = (user: User | null) => void;

const listeners = new Set<AuthListener>();

let currentUser: User | null = null;
let runtimeBearerToken = '';
let configLoaded = false;
let lastAuthError: string | null = null;

function buildVerifiedUser(email: string, displayName?: string): User {
  const normalizedEmail = email.trim().toLowerCase();
  const resolvedName =
    (displayName && displayName.trim()) ||
    normalizedEmail.split('@')[0] ||
    'Authorized Compliance Reviewer';
  return {
    uid: `reviewer:${normalizedEmail}`,
    email: normalizedEmail,
    displayName: resolvedName,
    photoURL: null,
    getIdToken: async () => runtimeBearerToken,
  };
}

async function resolveRuntimeSessionUser(): Promise<User | null> {
  lastAuthError = null;
  try {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (runtimeBearerToken) {
      headers['Authorization'] = `Bearer ${runtimeBearerToken}`;
    }
    const resp = await fetch('/api/config', {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      headers,
    });
    if (resp.ok) {
      const cfg = await resp.json();
      configLoaded = true;
      if (typeof cfg?.reviewer_email === 'string' && cfg.reviewer_email.includes('@')) {
        return buildVerifiedUser(cfg.reviewer_email, cfg.reviewer_name);
      }
      lastAuthError = 'Backend did not return a verified reviewer email.';
      return null;
    }

    let serverMessage = `Access denied (HTTP ${resp.status}).`;
    try {
      const errBody = await resp.json();
      if (typeof errBody?.error === 'string' && errBody.error.trim()) {
        serverMessage = errBody.error.trim();
      }
    } catch {
      // Response was non-JSON; keep status code summary.
    }
    lastAuthError = serverMessage;
  } catch {
    lastAuthError = 'Unable to reach /api/config to verify reviewer session.';
  }
  configLoaded = true;
  return null;
}

function notifyListeners(): void {
  listeners.forEach((cb) => {
    try {
      cb(currentUser);
    } catch {
      // Listener error suppressed to avoid leaking user state to console.
    }
  });
}

export const auth = {
  get currentUser(): User | null {
    return currentUser;
  },
};

export function setRuntimeBearerToken(token: string): void {
  runtimeBearerToken = token.trim();
}

export function getLastAuthError(): string | null {
  return lastAuthError;
}

export function isAuthorizedEmail(email: string | null | undefined): boolean {
  if (!email || !email.includes('@')) return false;
  if (!APP_CONFIG.allowedDomains || APP_CONFIG.allowedDomains.length === 0) {
    return true;
  }
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return false;
  return APP_CONFIG.allowedDomains.some((d) => d.toLowerCase() === domain);
}

export async function loginWithGoogle(): Promise<{ user: User | null; error?: string }> {
  currentUser = await resolveRuntimeSessionUser();
  notifyListeners();
  if (!currentUser) {
    return {
      user: null,
      error:
        lastAuthError ||
        'Authentication failed. Ensure Cloud Run Identity-Aware Proxy (IAP) and reviewer allowlist are configured.',
    };
  }
  return { user: currentUser };
}

export async function logout(): Promise<void> {
  currentUser = null;
  runtimeBearerToken = '';
  configLoaded = true;
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.clear();
    }
  } catch {
    // Ignore storage clear errors in restricted environments.
  }
  notifyListeners();

  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
      window.location.reload();
    } else {
      window.location.assign('/_gcp_iap/clear_login_cookie');
    }
  }
}

export async function getActiveAuthToken(): Promise<string> {
  return runtimeBearerToken;
}

export function getCachedAuthToken(): string {
  return runtimeBearerToken;
}

export function onAuthStateChanged(_authObj: unknown, callback: AuthListener): () => void {
  listeners.add(callback);
  if (configLoaded) {
    callback(currentUser);
  } else {
    void resolveRuntimeSessionUser().then((u) => {
      currentUser = u;
      notifyListeners();
    });
  }
  return () => {
    listeners.delete(callback);
  };
}

export function onIdTokenChanged(_authObj: unknown, callback: AuthListener): () => void {
  return onAuthStateChanged(_authObj, callback);
}
