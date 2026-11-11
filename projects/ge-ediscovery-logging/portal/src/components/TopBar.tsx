import React from 'react';
import { Search, Scale, X, LogOut, User as UserIcon, RefreshCw } from 'lucide-react';
import { User } from '../services/firebaseAuth';
import { EditorialTheme, ThemeConfig, THEMES } from '../types/theme';
import { UnifiedReviewItem } from '../types/schema';
import { SearchResultItem, searchAllItems } from '../utils/searchUtils';

interface TopBarProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  currentUser: User | null;
  onSignOut: () => void;
  onSyncBigQuery?: () => void;
  isSyncing?: boolean;
  lastSyncedTime?: string;
  selectedTheme: EditorialTheme;
  allItems?: UnifiedReviewItem[];
  onSelectSearchResult?: (res: SearchResultItem) => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  searchQuery,
  onSearchChange,
  currentUser,
  onSignOut,
  onSyncBigQuery,
  isSyncing = false,
  lastSyncedTime,
  selectedTheme,
  allItems = [],
  onSelectSearchResult,
}) => {
  const theme: ThemeConfig = THEMES[selectedTheme] || THEMES.cloud;
  const [searchFocused, setSearchFocused] = React.useState(false);

  const searchResults = React.useMemo(() => {
    if (!searchQuery || searchQuery.trim().length < 2) return [];
    return searchAllItems(allItems, searchQuery);
  }, [allItems, searchQuery]);

  return (
    <header className={`flex items-center justify-between px-5 select-none shrink-0 z-40 transition-colors duration-150 relative ${theme.topBarClass}`}>
      {/* Brand & Identity */}
      <div className="flex items-center gap-3 shrink-0">
        <div className={`h-8 w-8 flex items-center justify-center ${theme.topBarLogoClass}`}>
          <Scale className="w-4 h-4" />
        </div>
        <div>
          <span className={`text-xs block leading-tight ${theme.topBarBrandTitle}`}>
            Notebooks & Chat
          </span>
          <span className={`block leading-tight ${theme.topBarBrandSubtitle}`}>
            Compliance & Audit Logging Portal
          </span>
        </div>
      </div>

      {/* Center: Global Search Bar */}
      <div className="flex-1 max-w-md mx-6 hidden md:block relative">
        <div className={`relative flex items-center ${theme.topBarSearchContainer}`}>
          <Search className={`w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 ${
            selectedTheme === 'cloud' ? 'text-blue-100' : 'text-zinc-400'
          }`} />
          <input
            type="text"
            placeholder="Search user email, chat content, or file name..."
            value={searchQuery}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setTimeout(() => setSearchFocused(false), 250)}
            onChange={(e) => onSearchChange(e.target.value)}
            className={`w-full bg-transparent pl-8 pr-7 py-1.5 text-xs focus:outline-none ${theme.topBarSearchInputClass}`}
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 p-0.5 cursor-pointer"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Global Live Search Results Dropdown */}
        {searchFocused && searchQuery.trim().length >= 2 && (
          <div className={`absolute left-0 right-0 top-full mt-1.5 max-h-96 overflow-y-auto rounded-xl border shadow-2xl z-50 p-2 space-y-1 text-left ${theme.menuClass}`}>
            <div className="px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-zinc-400 font-bold border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
              <span>Search Results ({searchResults.length})</span>
              <span>Press to Jump</span>
            </div>

            {searchResults.length === 0 ? (
              <div className="p-4 text-center text-xs text-zinc-400">
                No matching sessions, chat turns, or files found for “{searchQuery}”.
              </div>
            ) : (
              searchResults.map((res) => (
                <div
                  key={res.id}
                  onClick={() => {
                    onSelectSearchResult?.(res);
                    setSearchFocused(false);
                  }}
                  className={`p-2 rounded-lg border border-transparent transition cursor-pointer space-y-0.5 ${theme.menuItemHover}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-xs font-semibold truncate ${theme.textPrimary}`}>
                      {res.title}
                    </span>
                    <span className="text-[9px] font-mono uppercase px-1.5 py-0.2 rounded bg-sky-500/10 text-sky-600 dark:text-sky-400 shrink-0 font-bold">
                      {res.category}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-[10px] text-zinc-400">
                    <span className="truncate">{res.userEmail}</span>
                    <span className="font-mono text-[9px] truncate max-w-[180px] text-zinc-500">
                      {res.matchedText}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Right Controls: Sync BigQuery and User Profile */}
      <div className="flex items-center gap-2.5 shrink-0">
        {/* Sync BigQuery Button */}
        {onSyncBigQuery && (
          <button
            onClick={onSyncBigQuery}
            disabled={isSyncing}
            title={lastSyncedTime ? `Last synced: ${lastSyncedTime}` : 'Sync live with BigQuery'}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs transition active:scale-98 cursor-pointer disabled:opacity-50 shadow-2xs ${theme.topBarSyncBtnClass}`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span className="hidden lg:inline">{isSyncing ? 'Syncing...' : 'Sync BigQuery'}</span>
          </button>
        )}

        {/* User Profile */}
        {currentUser && (
          <div className={`flex items-center gap-2.5 ${theme.topBarUserPillClass}`}>
            {currentUser.photoURL ? (
              <img
                src={currentUser.photoURL}
                alt={currentUser.displayName || 'User'}
                className="w-7 h-7 rounded-full border border-inherit/40"
              />
            ) : (
              <div className="w-7 h-7 rounded-full bg-white/20 text-inherit flex items-center justify-center font-bold text-xs">
                <UserIcon className="w-3.5 h-3.5" />
              </div>
            )}
            <div className="text-left hidden xl:block">
              <span className="text-[11px] font-bold block leading-tight truncate max-w-[130px]">
                {currentUser.displayName || currentUser.email?.split('@')[0]}
              </span>
              <span className="text-[9px] font-mono opacity-70 block truncate max-w-[130px]">
                {currentUser.email}
              </span>
            </div>
            <button
              onClick={onSignOut}
              title="Sign Out"
              className="p-1.5 opacity-70 hover:opacity-100 hover:bg-white/10 rounded-lg transition cursor-pointer ml-1"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </header>
  );
};

export default TopBar;
