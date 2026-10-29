import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  buildDynamicUsers,
  getUnifiedReviewItems,
} from './data/dbData';
import { TopBar } from './components/TopBar';
import { LoginScreen } from './components/LoginScreen';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LegalBriefNarrative } from './components/architectures/LegalBriefNarrative';
import {
  auth,
  onAuthStateChanged,
  logout,
  isAuthorizedEmail,
  User,
} from './services/firebaseAuth';
import { fetchLiveComplianceLogs, searchBigQuery } from './services/complianceApi';
import { matchesQuery } from './utils/searchUtils';
import { ComplianceDataset, EMPTY_DATASET } from './types/schema';
import { EditorialTheme, THEMES } from './types/theme';
import { AlertCircle, Loader2 } from 'lucide-react';

export const App: React.FC = () => {
  // Theme State (Default: 'cloud' - True Blue)
  const [selectedTheme, setSelectedTheme] = useState<EditorialTheme>(() => {
    const saved = localStorage.getItem('ge_portal_theme') as EditorialTheme;
    if (saved && ['cloud', 'canvas', 'legal', 'dark'].includes(saved)) {
      return saved;
    }
    return 'cloud';
  });

  const handleSelectTheme = (theme: EditorialTheme) => {
    setSelectedTheme(theme);
    localStorage.setItem('ge_portal_theme', theme);
  };

  const currentTheme = THEMES[selectedTheme] || THEMES.cloud;

  // Auth State
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authInitialized, setAuthInitialized] = useState(false);

  // BigQuery Dataset + Server-Side Search Supplement (for records beyond initial LIMIT 2000)
  const [dataset, setDataset] = useState<ComplianceDataset>(EMPTY_DATASET);
  const [serverSearchDataset, setServerSearchDataset] = useState<ComplianceDataset | null>(null);

  // Syncing state
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncedTime, setLastSyncedTime] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  // Surface & Filters State
  const [surfaceMode, setSurfaceMode] = useState<'NOTEBOOK_LM' | 'GEMINI_ENTERPRISE_CHAT'>('GEMINI_ENTERPRISE_CHAT');
  const [selectedUserEmail, setSelectedUserEmail] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [selectedStartTime, setSelectedStartTime] = useState<number | null>(null);

  // Live BigQuery Sync Function
  const syncWithBigQuery = useCallback(async (forceRefresh = false) => {
    setIsSyncing(true);
    setSyncError(null);
    try {
      const live = await fetchLiveComplianceLogs(forceRefresh);
      if (live.error) {
        setDataset(EMPTY_DATASET);
        setSyncError(live.error);
        if (live.http_status === 401) {
          setCurrentUser(null);
        }
        return;
      }
      setDataset({
        processedLogs: live.processed_logs || [],
        sources: live.sources || [],
        chats: live.chat || [],
        studio: live.studio || [],
        notebookRawLogs: live.notebook_raw_logs || [],
      });
      setLastSyncedTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    } catch {
      setDataset(EMPTY_DATASET);
      setSyncError('Unexpected error synchronizing BigQuery compliance logs.');
    } finally {
      setIsSyncing(false);
    }
  }, []);

  // Initialize Firebase Auth listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user && isAuthorizedEmail(user.email)) {
        setCurrentUser(user);
      } else {
        setCurrentUser(null);
      }
      setAuthInitialized(true);
    });
    return () => unsubscribe();
  }, []);

  // Automatically sync BigQuery telemetry whenever user is authenticated
  useEffect(() => {
    if (currentUser) {
      syncWithBigQuery(false);
    }
  }, [currentUser, syncWithBigQuery]);

  // Query server-side BigQuery /api/search (debounced) so records older than LIMIT 2000 are discoverable
  useEffect(() => {
    if (!currentUser) {
      setServerSearchDataset(null);
      return;
    }
    const trimmed = searchQuery.trim();
    if (trimmed.length < 2 && !selectedUserEmail) {
      setServerSearchDataset(null);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const res = await searchBigQuery(trimmed, selectedUserEmail || '');
      if (cancelled) return;
      if (res.search_dataset) {
        setServerSearchDataset({
          processedLogs: res.search_dataset.processed_logs || [],
          sources: res.search_dataset.sources || [],
          chats: res.search_dataset.chat || [],
          studio: res.search_dataset.studio || [],
          notebookRawLogs: res.search_dataset.notebook_raw_logs || [],
        });
      }
    }, 280);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [currentUser, searchQuery, selectedUserEmail]);

  const mergedDataset = useMemo<ComplianceDataset>(() => {
    if (!serverSearchDataset) return dataset;
    const mergeByKey = <T,>(base: T[], extra: T[], keyFn: (item: T) => string): T[] => {
      const seen = new Set(base.map(keyFn));
      const out = [...base];
      for (const item of extra) {
        const k = keyFn(item);
        if (k && !seen.has(k)) {
          seen.add(k);
          out.push(item);
        }
      }
      return out;
    };
    return {
      processedLogs: mergeByKey(dataset.processedLogs, serverSearchDataset.processedLogs, (x: any) => String(x.insert_id || '')),
      sources: mergeByKey(dataset.sources, serverSearchDataset.sources, (x: any) => String(x.event_id || '')),
      chats: mergeByKey(dataset.chats, serverSearchDataset.chats, (x: any) => String(x.event_id || '')),
      studio: mergeByKey(dataset.studio, serverSearchDataset.studio, (x: any) => String(x.event_id || '')),
      notebookRawLogs: mergeByKey(dataset.notebookRawLogs, serverSearchDataset.notebookRawLogs, (x: any) => String(x.event_id || '')),
    };
  }, [dataset, serverSearchDataset]);

  const handleSignOut = async () => {
    await logout();
    setCurrentUser(null);
  };

  // Build Dynamic Users
  const users = useMemo(() => {
    return buildDynamicUsers(mergedDataset);
  }, [mergedDataset]);

  // Build Unified Review Items
  const unifiedItems = useMemo(() => {
    return getUnifiedReviewItems(mergedDataset);
  }, [mergedDataset]);

  // Compute dataset bounds: Max is ALWAYS Today (Now), Min is earliest record creation
  const { minTimestamp, maxTimestamp } = useMemo(() => {
    const now = Date.now();
    if (unifiedItems.length === 0) {
      return { minTimestamp: now - 30 * 24 * 60 * 60 * 1000, maxTimestamp: now };
    }
    let minT = Infinity;
    for (const item of unifiedItems) {
      const t = new Date(item.timestamp).getTime();
      if (!isNaN(t) && t < minT) {
        minT = t;
      }
    }
    if (minT === Infinity || minT >= now) {
      minT = now - 30 * 24 * 60 * 60 * 1000;
    }
    return { minTimestamp: minT, maxTimestamp: now };
  }, [unifiedItems]);

  const activeStartTime = useMemo<number>(() => {
    if (selectedStartTime !== null) {
      return Math.max(minTimestamp, Math.min(maxTimestamp, selectedStartTime));
    }
    return minTimestamp;
  }, [selectedStartTime, minTimestamp, maxTimestamp]);

  // Filtered items based on surface, user, search, and single lookback start time
  const filteredItems = useMemo(() => {
    const targetEmail = selectedUserEmail?.toLowerCase() ?? null;

    return unifiedItems.filter((item) => {
      if (item.surface !== surfaceMode) return false;
      if (targetEmail && item.user_email.toLowerCase() !== targetEmail) return false;
      
      const itemTime = new Date(item.timestamp).getTime();
      if (!isNaN(itemTime)) {
        if (itemTime < activeStartTime || itemTime > maxTimestamp) return false;
      }
      return matchesQuery(item, searchQuery);
    });
  }, [unifiedItems, surfaceMode, selectedUserEmail, searchQuery, activeStartTime, maxTimestamp]);

  const activeItem = useMemo(() => {
    if (selectedItemId) {
      const found = filteredItems.find((i) => i.id === selectedItemId);
      if (found) return found;
    }
    return filteredItems[0] || null;
  }, [filteredItems, selectedItemId]);

  if (!authInitialized) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-zinc-100 text-zinc-600 font-sans">
        <Loader2 className="w-6 h-6 animate-spin text-zinc-900 mr-2" />
        <span className="font-medium text-xs">Authenticating Compliance Portal...</span>
      </div>
    );
  }

  if (!currentUser) {
    return <LoginScreen onLoginSuccess={(user) => setCurrentUser(user)} />;
  }

  return (
    <ErrorBoundary>
      <div className={`flex flex-col h-screen w-screen overflow-hidden antialiased select-none transition-colors duration-150 ${currentTheme.appBgClass} ${currentTheme.bodyFont}`}>
        {/* Universal Top Navigation Header */}
        <TopBar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          currentUser={currentUser}
          onSignOut={handleSignOut}
          onSyncBigQuery={() => syncWithBigQuery(true)}
          isSyncing={isSyncing}
          lastSyncedTime={lastSyncedTime || undefined}
          selectedTheme={selectedTheme}
          allItems={unifiedItems}
          onSelectSearchResult={(res) => {
            setSurfaceMode(res.surface);
            setSelectedUserEmail(res.userEmail);
            setSelectedItemId(res.sessionId);
            setSearchQuery('');
          }}
        />

        {syncError && (
          <div
            role="alert"
            className="shrink-0 flex items-center justify-between gap-3 border-b border-rose-300 bg-rose-50 px-4 py-2 text-xs text-rose-800"
          >
            <div className="flex items-center gap-2 font-medium">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{syncError}</span>
            </div>
            <button
              type="button"
              onClick={() => syncWithBigQuery(true)}
              className="rounded-md border border-rose-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-100 cursor-pointer"
            >
              Retry Sync
            </button>
          </div>
        )}

        {/* Master-Detail Compliance Workspace */}
        <main className="flex-1 flex overflow-hidden">
          <LegalBriefNarrative
            items={filteredItems}
            allItems={unifiedItems}
            users={users}
            activeItem={activeItem}
            onSelectItem={(id) => setSelectedItemId(id)}
            selectedUserEmail={selectedUserEmail}
            onSelectUser={setSelectedUserEmail}
            surfaceMode={surfaceMode}
            onSurfaceChange={(mode) => {
              setSurfaceMode(mode);
              setSelectedItemId(null);
            }}
            selectedTheme={selectedTheme}
            onSelectTheme={handleSelectTheme}
            minTimestamp={minTimestamp}
            maxTimestamp={maxTimestamp}
            selectedStartTime={activeStartTime}
            onStartTimeChange={setSelectedStartTime}
          />
        </main>
      </div>
    </ErrorBoundary>
  );
};

export default App;
