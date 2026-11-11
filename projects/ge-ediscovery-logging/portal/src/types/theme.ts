export type EditorialTheme = 'cloud' | 'canvas' | 'legal' | 'dark';

export interface ThemeConfig {
  id: EditorialTheme;
  name: string;
  headingFont: string;
  bodyFont: string;
  monoFont: string;

  // Ambient Layer
  ambientClass?: string;

  // Top Navigation Bar
  topBarClass: string;
  topBarBrandTitle: string;
  topBarBrandSubtitle: string;
  topBarLogoClass: string;
  topBarSearchContainer: string;
  topBarSearchInputClass: string;
  topBarSyncBtnClass: string;
  topBarUserPillClass: string;

  // Layout & Canvas
  appBgClass: string;
  containerClass: string;
  sidebarClass: string;
  sidebarHeaderClass: string;
  mainBgClass: string;
  mainHeaderClass: string;

  // Cards & Interactive Elements
  cardClass: string;
  cardSelectedClass: string;
  cardHoverClass: string;
  borderClass: string;

  // Typography
  textPrimary: string;
  textSecondary: string;
  textMuted: string;

  // Accents & Buttons
  accentText: string;
  accentBtn: string;
  quoteBox: string;
  badgePill: string;
  bubbleUser: string;
  bubbleModel: string;

  // Theme Dropdown Menu
  menuClass: string;
  menuItemActive: string;
  menuItemInactive: string;
  menuItemHover: string;

  // Segmented Controls & Toggles
  segmentedTrackClass: string;
  segmentedActiveClass: string;
  segmentedInactiveClass: string;
  themeSelectorBtnClass: string;
}

export const THEMES: Record<EditorialTheme, ThemeConfig> = {
  cloud: {
    id: 'cloud',
    name: 'True Blue',
    headingFont: "font-['Google_Sans',Roboto,sans-serif] font-medium",
    bodyFont: "font-['Google_Sans',Roboto,sans-serif]",
    monoFont: 'font-mono text-slate-500 text-[11px]',

    // TopBar: Google Cloud Blue (#1A73E8) Banner
    topBarClass: 'h-14 bg-[#1A73E8] border-b border-[#1557B0] text-white shadow-md font-sans',
    topBarBrandTitle: 'text-white font-bold tracking-normal text-sm font-sans',
    topBarBrandSubtitle: 'text-blue-100 font-sans text-[10px] opacity-90',
    topBarLogoClass: 'bg-white text-[#1A73E8] rounded-md shadow-xs ring-2 ring-white/30',
    topBarSearchContainer: 'bg-white/15 hover:bg-white/20 focus-within:bg-white border border-white/20 focus-within:border-transparent focus-within:shadow-md transition rounded-lg',
    topBarSearchInputClass: 'text-white focus-within:text-slate-900 placeholder-blue-100 focus-within:placeholder-slate-400 font-sans',
    topBarSyncBtnClass: 'bg-white/15 hover:bg-white/25 border border-white/30 text-white font-sans text-xs font-medium rounded-md',
    topBarUserPillClass: 'border-l border-white/20 pl-3',

    // Canvas: Official Google Cloud Slate & Flat Material Cards
    appBgClass: 'bg-[#F8F9FA]',
    containerClass: 'bg-[#F8F9FA] text-[#202124] font-sans',
    sidebarClass: 'bg-[#FFFFFF] border-slate-200 shadow-2xs',
    sidebarHeaderClass: 'bg-[#F8F9FA] border-slate-200',
    mainBgClass: 'bg-[#FFFFFF]',
    mainHeaderClass: 'bg-[#FFFFFF] border-slate-200',

    // Cards: Flat Material Cards with Google Cloud 4px Left Blue Strip on Selection
    cardClass: 'bg-white border-slate-200 shadow-2xs rounded-md',
    cardSelectedClass: 'bg-[#E8F0FE] border-l-4 border-l-[#1A73E8] border-y-slate-200 border-r-slate-200 shadow-2xs',
    cardHoverClass: 'hover:bg-[#F1F3F4] hover:border-slate-300',
    borderClass: 'border-slate-200',

    // Typography
    textPrimary: 'text-[#202124]',
    textSecondary: 'text-[#5F6368]',
    textMuted: 'text-[#80868B]',

    // Accents: Google Cloud Blue (#1A73E8)
    accentText: 'text-[#1A73E8] font-semibold',
    accentBtn: 'bg-[#1A73E8] hover:bg-[#1557B0] text-white font-medium rounded-md shadow-xs',
    quoteBox: 'bg-[#F1F3F4] border-l-4 border-l-[#1A73E8] border-y-slate-200 border-r-slate-200 text-[#202124]',
    badgePill: 'bg-[#E8F0FE] text-[#1A73E8] border border-[#D2E3FC] rounded-full font-medium',
    bubbleUser: 'bg-[#E8F0FE] border-[#D2E3FC] text-[#1A73E8]',
    bubbleModel: 'bg-white border-slate-200 text-[#202124] shadow-2xs',

    // Menu
    menuClass: 'bg-white border-slate-200 text-[#202124] font-sans shadow-2xl rounded-xl',
    menuItemActive: 'font-bold text-[#1A73E8] bg-[#E8F0FE]',
    menuItemInactive: 'text-[#3C4043]',
    menuItemHover: 'hover:bg-[#F1F3F4]',

    // Segmented Controls & Toggles
    segmentedTrackClass: 'bg-[#E8EAED] border border-[#DADCE0] p-1 rounded-lg shadow-inner',
    segmentedActiveClass: 'bg-white text-[#1A73E8] font-bold shadow-xs border border-[#DADCE0]',
    segmentedInactiveClass: 'text-[#5F6368] hover:text-[#202124] hover:bg-black/5',
    themeSelectorBtnClass: 'bg-white hover:bg-[#F1F3F4] border border-slate-300 text-slate-800 shadow-2xs font-medium',
  },

  canvas: {
    id: 'canvas',
    name: 'Canvas',
    headingFont: "font-['Inter',-apple-system,BlinkMacSystemFont,sans-serif] font-semibold tracking-tight",
    bodyFont: "font-['Inter',-apple-system,BlinkMacSystemFont,sans-serif]",
    monoFont: 'font-mono text-neutral-500 text-[11px]',

    // Ambient Lighting Mesh Gradient for Authentic Glass Refraction
    ambientClass: 'pointer-events-none absolute inset-0 -z-10 overflow-hidden before:absolute before:-top-40 before:left-1/4 before:h-96 before:w-96 before:rounded-full before:bg-indigo-300/25 before:blur-3xl after:absolute after:-bottom-40 after:right-1/4 after:h-96 after:w-96 after:rounded-full after:bg-sky-300/25 after:blur-3xl',

    // TopBar: Apple Pro Frosted Glass with Specular Inset & Backdrop Saturation
    topBarClass: 'h-14 bg-white/65 backdrop-blur-2xl backdrop-saturate-[180%] border-b border-white/70 text-neutral-900 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.9),0_1px_8px_rgba(0,0,0,0.03)] font-sans relative',
    topBarBrandTitle: 'text-neutral-950 font-semibold tracking-tight text-sm font-sans',
    topBarBrandSubtitle: 'text-neutral-500 font-sans text-[10px]',
    topBarLogoClass: 'bg-neutral-900 text-white rounded-xl shadow-xs ring-1 ring-black/10',
    topBarSearchContainer: 'bg-white/50 backdrop-blur-md hover:bg-white/70 focus-within:bg-white border border-white/80 focus-within:border-black/20 shadow-[inset_0_1px_1px_rgba(0,0,0,0.02),0_2px_8px_rgba(0,0,0,0.03)] transition rounded-full',
    topBarSearchInputClass: 'text-neutral-900 placeholder-neutral-400 font-sans',
    topBarSyncBtnClass: 'bg-white/50 hover:bg-white/80 border border-white/80 text-neutral-800 font-sans text-xs font-medium rounded-full px-3.5 shadow-2xs transition-all',
    topBarUserPillClass: 'border-l border-black/[0.08] pl-3',

    // Canvas: Soft Translucent Surface
    appBgClass: 'bg-[#F2F2F7]',
    containerClass: 'bg-[#F2F2F7] text-neutral-900 font-sans relative',
    sidebarClass: 'bg-white/55 backdrop-blur-2xl backdrop-saturate-[180%] border-r border-white/60 shadow-[0_4px_24px_rgba(0,0,0,0.02)]',
    sidebarHeaderClass: 'bg-white/40 backdrop-blur-xl border-b border-white/60',
    mainBgClass: 'bg-transparent',
    mainHeaderClass: 'bg-white/55 backdrop-blur-2xl backdrop-saturate-[180%] border-b border-white/60 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.9),0_1px_8px_rgba(0,0,0,0.02)]',

    // Cards: Apple Pro Multi-Layer Frosted Glass Cards with Inset Specular Highlight
    cardClass: 'bg-white/60 backdrop-blur-xl backdrop-saturate-[180%] border border-white/80 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.9),0_4px_16px_rgba(0,0,0,0.03)] rounded-2xl transition-all duration-200',
    cardSelectedClass: 'bg-white/90 border-neutral-900/40 ring-1 ring-neutral-900/10 shadow-[inset_0_1px_0_0_rgba(255,255,255,1),0_8px_28px_rgba(0,0,0,0.06)] -translate-y-0.5',
    cardHoverClass: 'hover:bg-white/80 hover:shadow-[0_8px_24px_rgba(0,0,0,0.05)] hover:-translate-y-0.5',
    borderClass: 'border-white/60',

    // Typography
    textPrimary: 'text-neutral-950',
    textSecondary: 'text-neutral-600',
    textMuted: 'text-neutral-400',

    // Accents: Monochromatic Apple Minimalist Precision
    accentText: 'text-neutral-950 font-semibold',
    accentBtn: 'bg-neutral-950 hover:bg-black text-white font-medium rounded-full shadow-sm hover:shadow-md px-5 transition-all active:scale-98',
    quoteBox: 'bg-white/40 border border-white/70 text-neutral-800 rounded-2xl backdrop-blur-md shadow-2xs',
    badgePill: 'bg-white/50 text-neutral-800 border border-white/70 rounded-full font-medium shadow-2xs backdrop-blur-sm',
    bubbleUser: 'bg-neutral-900 text-white rounded-2xl shadow-sm',
    bubbleModel: 'bg-white/75 backdrop-blur-md border border-white/80 text-neutral-900 shadow-[0_2px_12px_rgba(0,0,0,0.03)] rounded-2xl',

    // Menu
    menuClass: 'bg-white/80 backdrop-blur-2xl backdrop-saturate-[180%] border border-white/80 text-neutral-900 font-sans shadow-2xl rounded-2xl',
    menuItemActive: 'font-bold text-neutral-950 bg-black/[0.05]',
    menuItemInactive: 'text-neutral-700',
    menuItemHover: 'hover:bg-black/[0.04]',

    // Segmented Controls & Toggles
    segmentedTrackClass: 'bg-black/[0.07] border border-black/[0.08] p-1 rounded-xl shadow-inner backdrop-blur-md',
    segmentedActiveClass: 'bg-white text-neutral-950 font-bold shadow-sm border border-black/[0.08]',
    segmentedInactiveClass: 'text-neutral-500 hover:text-neutral-900 hover:bg-white/40',
    themeSelectorBtnClass: 'bg-white/80 hover:bg-white border border-black/10 text-neutral-900 shadow-2xs backdrop-blur-md font-medium',
  },

  legal: {
    id: 'legal',
    name: 'Legal Brief',
    headingFont: 'font-serif font-bold',
    bodyFont: 'font-serif',
    monoFont: 'font-mono text-zinc-600',

    // TopBar: Warm parchment masthead with formal legal scale insignia
    topBarClass: 'h-14 bg-[#FDFCFA] border-b border-stone-300 text-stone-900 shadow-2xs font-serif',
    topBarBrandTitle: 'text-stone-950 font-bold tracking-tight font-serif',
    topBarBrandSubtitle: 'text-stone-600 font-serif italic text-[10px]',
    topBarLogoClass: 'bg-stone-900 text-white rounded-lg shadow-xs ring-1 ring-stone-300',
    topBarSearchContainer: 'bg-[#F7F5F0] border border-stone-300 focus-within:border-stone-800 focus-within:bg-white rounded-lg',
    topBarSearchInputClass: 'text-stone-900 placeholder-stone-400 font-serif',
    topBarSyncBtnClass: 'bg-[#F7F5F0] hover:bg-stone-200 border border-stone-300 text-stone-800 font-serif rounded-md',
    topBarUserPillClass: 'border-l border-stone-300 pl-3',

    // Canvas
    appBgClass: 'bg-[#F4F1EB]',
    containerClass: 'bg-[#F4F1EB] text-stone-900 font-serif',
    sidebarClass: 'bg-[#FAF8F5] border-stone-300',
    sidebarHeaderClass: 'bg-[#FDFCFA] border-stone-300',
    mainBgClass: 'bg-[#FDFCFA]',
    mainHeaderClass: 'bg-[#FDFCFA] border-stone-300',

    // Cards
    cardClass: 'bg-[#FAF8F5] border-stone-300 shadow-2xs rounded-lg',
    cardSelectedClass: 'bg-[#EFEBE4] border-stone-900 ring-1 ring-stone-900/20 shadow-xs',
    cardHoverClass: 'hover:bg-[#F2EFE9] hover:border-stone-400',
    borderClass: 'border-stone-300',

    // Typography
    textPrimary: 'text-stone-950',
    textSecondary: 'text-stone-700',
    textMuted: 'text-stone-500',

    // Accents
    accentText: 'text-stone-900 font-bold',
    accentBtn: 'bg-stone-900 hover:bg-stone-800 text-white font-serif rounded-md shadow-xs',
    quoteBox: 'bg-[#F5F2EC] border-stone-300 text-stone-900 italic rounded-lg',
    badgePill: 'bg-[#EAE5DC] text-stone-900 border-stone-300 rounded-md',
    bubbleUser: 'bg-[#EAE5DC] border-stone-300 text-stone-900 rounded-lg',
    bubbleModel: 'bg-white border-stone-300 text-stone-900 shadow-2xs rounded-lg',

    // Menu
    menuClass: 'bg-[#FDFCFA] border-stone-300 text-stone-900 font-serif shadow-2xl rounded-xl',
    menuItemActive: 'font-bold text-stone-950 bg-[#EFEBE4]',
    menuItemInactive: 'text-stone-700',
    menuItemHover: 'hover:bg-[#F5F2EC]',

    // Segmented Controls & Toggles
    segmentedTrackClass: 'bg-[#EAE5DC] border border-stone-300 p-1 rounded-lg shadow-inner',
    segmentedActiveClass: 'bg-[#FAF8F5] text-stone-950 font-bold shadow-xs border border-stone-300',
    segmentedInactiveClass: 'text-stone-600 hover:text-stone-900 hover:bg-black/5',
    themeSelectorBtnClass: 'bg-[#FAF8F5] hover:bg-[#F2EFE9] border border-stone-300 text-stone-900 shadow-2xs font-medium',
  },

  dark: {
    id: 'dark',
    name: 'Dark Mode',
    headingFont: "font-['Inter',sans-serif] font-semibold tracking-tight",
    bodyFont: "font-['Inter',sans-serif]",
    monoFont: 'font-mono text-zinc-400 text-[11px]',

    // Default theme configuration
    topBarClass: 'h-14 bg-[#121212] border-b border-zinc-800 text-zinc-100 shadow-none font-sans',
    topBarBrandTitle: 'text-white font-semibold tracking-tight text-sm font-sans',
    topBarBrandSubtitle: 'text-zinc-400 font-sans text-[10px]',
    topBarLogoClass: 'bg-zinc-800 text-white rounded-lg border border-zinc-700',
    topBarSearchContainer: 'bg-[#1C1C1E] border border-zinc-800 focus-within:border-zinc-600 focus-within:bg-[#242426] rounded-lg',
    topBarSearchInputClass: 'text-zinc-100 placeholder-zinc-500 font-sans',
    topBarSyncBtnClass: 'bg-[#1C1C1E] hover:bg-zinc-800 border border-zinc-800 text-zinc-300 font-sans rounded-lg',
    topBarUserPillClass: 'border-l border-zinc-800 pl-3',

    // Canvas: Pure Deep Black #0D0D0D
    appBgClass: 'bg-[#0D0D0D]',
    containerClass: 'bg-[#0D0D0D] text-zinc-100 font-sans',
    sidebarClass: 'bg-[#121212] border-zinc-800',
    sidebarHeaderClass: 'bg-[#121212] border-zinc-800',
    mainBgClass: 'bg-[#0D0D0D]',
    mainHeaderClass: 'bg-[#121212] border-zinc-800',

    // Cards: Pure Monochrome Zinc-900 (#18181B)
    cardClass: 'bg-[#18181B] border border-zinc-800/80 shadow-none rounded-xl',
    cardSelectedClass: 'bg-[#27272A] border-zinc-600 ring-1 ring-zinc-500/30 text-white shadow-xs',
    cardHoverClass: 'hover:bg-[#202023] hover:border-zinc-700',
    borderClass: 'border-zinc-800',

    // Typography
    textPrimary: 'text-zinc-100',
    textSecondary: 'text-zinc-400',
    textMuted: 'text-zinc-500',

    // Accents: Pure High-Contrast Black & White
    accentText: 'text-white font-semibold',
    accentBtn: 'bg-white hover:bg-zinc-200 text-black font-semibold rounded-lg shadow-none px-4',
    quoteBox: 'bg-[#18181B] border border-zinc-800 text-zinc-300 font-sans rounded-xl',
    badgePill: 'bg-[#27272A] text-zinc-200 border border-zinc-700 rounded-md font-mono text-[10px]',
    bubbleUser: 'bg-[#27272A] border border-zinc-700 text-zinc-100 rounded-xl',
    bubbleModel: 'bg-[#18181B] border border-zinc-800 text-zinc-200 shadow-none rounded-xl',

    // Menu
    menuClass: 'bg-[#18181B] border border-zinc-800 text-zinc-100 font-sans shadow-2xl rounded-xl',
    menuItemActive: 'font-bold text-white bg-[#27272A]',
    menuItemInactive: 'text-zinc-400',
    menuItemHover: 'hover:bg-[#222226] hover:text-zinc-100',

    // Segmented Controls & Toggles
    segmentedTrackClass: 'bg-[#09090B] border border-zinc-800 p-1 rounded-xl shadow-inner',
    segmentedActiveClass: 'bg-[#27272A] text-white font-bold shadow-xs border border-zinc-700',
    segmentedInactiveClass: 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50',
    themeSelectorBtnClass: 'bg-[#18181B] hover:bg-[#202023] border border-zinc-700 text-zinc-100 shadow-2xs font-medium',
  },
};
