import React, { useState, useMemo } from 'react';
import { NotebookStudioRecord } from '../../types/schema';
import { ThemeConfig } from '../../types/theme';
import { useHydratedStudioContent } from './useHydratedStudioContent';
import {
  Network,
  ChevronRight,
  ChevronDown,
  Search,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Sparkles,
  Layers,
  BookOpen,
} from 'lucide-react';

interface MindMapNode {
  id: string;
  label: string;
  description?: string;
  category?: string;
  children?: MindMapNode[];
}

interface MindMapRendererProps {
  studio: NotebookStudioRecord;
  theme: ThemeConfig;
}

function normalizeMindMapNode(raw: Record<string, any>, pathId = 'root'): MindMapNode {
  const label = String(raw?.label || raw?.name || raw?.title || pathId);
  const rawChildren = Array.isArray(raw?.children)
    ? raw.children
    : Array.isArray(raw?.nodes)
      ? raw.nodes
      : [];
  return {
    id: String(raw?.id || pathId),
    label,
    description: typeof raw?.description === 'string' ? raw.description : undefined,
    category: typeof raw?.category === 'string' ? raw.category : undefined,
    children: rawChildren.map((child: Record<string, any>, idx: number) =>
      normalizeMindMapNode(child, `${pathId}_${idx}`)
    ),
  };
}

/**
 * Parses structured JSON graph or extracts markdown bullet hierarchy into nodes.
 */
function parseMindMapTree(studio: NotebookStudioRecord, contentText: string): MindMapNode {
  const metadata = typeof studio.metadata === 'object' && studio.metadata !== null
    ? studio.metadata
    : typeof studio.metadata === 'string'
      ? (() => {
          try {
            return JSON.parse(studio.metadata);
          } catch {
            return {};
          }
        })()
      : {};

  let structuredGraph =
    studio.mind_map_data ||
    metadata.mind_map_data ||
    metadata.mindMapData ||
    metadata.graph;

  if (!structuredGraph && contentText.trim().startsWith('{')) {
    try {
      structuredGraph = JSON.parse(contentText);
    } catch {
      structuredGraph = undefined;
    }
  }

  if (structuredGraph?.root && typeof structuredGraph.root === 'object') {
    return normalizeMindMapNode(structuredGraph.root, 'root');
  }
  if (
    structuredGraph &&
    typeof structuredGraph === 'object' &&
    (structuredGraph.label || structuredGraph.name || Array.isArray(structuredGraph.children))
  ) {
    return normalizeMindMapNode(structuredGraph, 'root');
  }

  // Parse markdown bullets if structured JSON is not present
  const lines = contentText.split('\n').filter((line) => line.trim().length > 0);
  const rootNode: MindMapNode = {
    id: 'root',
    label: studio.title || 'Central Concept',
    description: studio.customization_prompt || 'Ingested concept architecture',
    children: [],
  };

  let currentSection: MindMapNode | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('#')) {
      const headingText = line.replace(/^#+\s*/, '').trim();
      const node: MindMapNode = {
        id: `node_h_${i}`,
        label: headingText,
        children: [],
      };
      rootNode.children!.push(node);
      currentSection = node;
    } else if (line.trim().startsWith('-') || line.trim().startsWith('*')) {
      const itemText = line.trim().replace(/^[-*]\s*/, '').trim();
      const node: MindMapNode = {
        id: `node_item_${i}`,
        label: itemText,
      };
      if (currentSection) {
        currentSection.children!.push(node);
      } else {
        rootNode.children!.push(node);
      }
    }
  }

  return rootNode;
}

export const MindMapRenderer: React.FC<MindMapRendererProps> = ({ studio, theme }) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [collapsedNodes, setCollapsedNodes] = useState<Record<string, boolean>>({});
  const [selectedNode, setSelectedNode] = useState<MindMapNode | null>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const { content: hydratedContent } = useHydratedStudioContent(studio);

  const rootTree = useMemo(
    () => parseMindMapTree(studio, hydratedContent || studio.note_content || ''),
    [studio, hydratedContent]
  );

  const toggleCollapse = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCollapsedNodes((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const matchesSearch = (node: MindMapNode): boolean => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    if (node.label.toLowerCase().includes(query) || (node.description && node.description.toLowerCase().includes(query))) {
      return true;
    }
    return Boolean(node.children?.some(matchesSearch));
  };

  const renderNodeHierarchy = (node: MindMapNode, depth = 0) => {
    const isCollapsed = collapsedNodes[node.id];
    const hasChildren = node.children && node.children.length > 0;
    const isSelected = selectedNode?.id === node.id;
    const isQueryMatch = searchQuery.trim() && (node.label.toLowerCase().includes(searchQuery.toLowerCase()) || node.description?.toLowerCase().includes(searchQuery.toLowerCase()));

    if (!matchesSearch(node)) return null;

    return (
      <div key={node.id} className="relative pl-6 py-1 border-l-2 border-indigo-200 dark:border-indigo-900 ml-4 space-y-1.5">
        {/* Branch Connecting Dot */}
        <div className="absolute -left-[5px] top-4 w-2 h-2 rounded-full bg-indigo-500" />

        <div
          onClick={() => setSelectedNode(node)}
          className={`p-3 rounded-xl border transition cursor-pointer flex items-center justify-between gap-3 shadow-2xs group ${
            isSelected
              ? 'border-indigo-500 bg-indigo-50/80 dark:bg-indigo-950/60 ring-1 ring-indigo-500'
              : isQueryMatch
                ? 'border-amber-400 bg-amber-50/50 dark:bg-amber-950/30'
                : theme.cardClass
          } ${theme.cardHoverClass}`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            {hasChildren && (
              <button
                onClick={(e) => toggleCollapse(node.id, e)}
                className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/10 transition cursor-pointer"
                title={isCollapsed ? 'Expand Children' : 'Collapse Children'}
              >
                {isCollapsed ? <ChevronRight className="w-3.5 h-3.5 text-indigo-600" /> : <ChevronDown className="w-3.5 h-3.5 text-indigo-600" />}
              </button>
            )}

            <div className="min-w-0">
              <span className={`text-xs font-semibold block truncate ${theme.headingFont} ${theme.textPrimary}`}>
                {node.label}
              </span>
              {node.description && (
                <span className={`text-[10px] line-clamp-1 leading-snug ${theme.textSecondary}`}>
                  {node.description}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {hasChildren && (
              <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-700 dark:text-indigo-300">
                {node.children!.length} {node.children!.length === 1 ? 'branch' : 'branches'}
              </span>
            )}
          </div>
        </div>

        {/* Render Child Branches */}
        {hasChildren && !isCollapsed && (
          <div className="space-y-1 mt-1">
            {node.children!.map((child) => renderNodeHierarchy(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={`rounded-2xl border overflow-hidden shadow-sm space-y-4 p-6 ${theme.cardClass}`}>
      {/* Header Banner */}
      <div className="flex items-center justify-between border-b pb-4 flex-wrap gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
            <Network className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-700 dark:text-indigo-300">
                Mind Map
              </span>
              <span className={`text-xs font-mono ${theme.textMuted}`}>
                Hierarchical Concept Graph
              </span>
            </div>
            <h2 className={`${theme.headingFont} text-lg font-bold ${theme.textPrimary} mt-0.5`}>
              {studio.title || 'Concept Architecture Graph'}
            </h2>
          </div>
        </div>

        {/* Search & Zoom Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-zinc-400" />
            <input
              type="text"
              placeholder="Search concepts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`pl-8 pr-3 py-1.5 text-xs rounded-xl border outline-none font-sans focus:ring-1 focus:ring-indigo-500 ${theme.quoteBox}`}
            />
          </div>

          <div className={`flex items-center rounded-lg border p-0.5 ${theme.quoteBox}`}>
            <button
              onClick={() => setZoomLevel((z) => Math.max(70, z - 15))}
              className="p-1.5 rounded hover:opacity-75 transition cursor-pointer"
              title="Zoom Out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="text-[11px] font-mono px-2">{zoomLevel}%</span>
            <button
              onClick={() => setZoomLevel((z) => Math.min(140, z + 15))}
              className="p-1.5 rounded hover:opacity-75 transition cursor-pointer"
              title="Zoom In"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              onClick={() => {
                setZoomLevel(100);
                setCollapsedNodes({});
                setSelectedNode(null);
                setSearchQuery('');
              }}
              className="p-1.5 rounded hover:opacity-75 transition cursor-pointer border-l"
              title="Reset View"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Interactive Canvas Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left 2 Cols: Tree Graph */}
        <div
          style={{ transform: `scale(${zoomLevel / 100})`, transformOrigin: 'top left' }}
          className="lg:col-span-2 rounded-xl border p-5 bg-indigo-50/20 dark:bg-indigo-950/10 min-h-[380px] max-h-[550px] overflow-y-auto space-y-3 transition-transform duration-150"
        >
          {/* Root Central Node */}
          <div
            onClick={() => setSelectedNode(rootTree)}
            className={`p-4 rounded-2xl border-2 border-indigo-500 bg-white dark:bg-zinc-900 shadow-md cursor-pointer transition flex items-center justify-between ${
              selectedNode?.id === rootTree.id ? 'ring-2 ring-indigo-400' : ''
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-indigo-500 text-white">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[9px] font-mono uppercase font-bold text-indigo-600 dark:text-indigo-400">
                  Central Focus
                </span>
                <h3 className={`font-bold text-sm ${theme.headingFont} ${theme.textPrimary}`}>
                  {rootTree.label}
                </h3>
              </div>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-bold">
              ROOT NODE
            </span>
          </div>

          {/* Sub-Branches and Provenance */}
          {rootTree.children && rootTree.children.length > 0 ? (
            <div className="space-y-1 pt-1">
              {rootTree.children.map((child) => renderNodeHierarchy(child))}
            </div>
          ) : (
            <div className="p-4 rounded-xl border border-dashed border-indigo-300 dark:border-indigo-800 bg-white/60 dark:bg-zinc-900/60 space-y-2 mt-3">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono uppercase font-bold text-indigo-600 dark:text-indigo-400">
                  Concept Map Availability
                </span>
              </div>
              <p className={`text-xs ${theme.textSecondary} leading-relaxed`}>
                The interactive Mind Map graph is rendered directly in the NotebookLM interface and cannot be exported as a standalone file. To view or interact with this concept map, please refer to the notebook in Gemini Enterprise Notebooks.
              </p>
              {studio.user_steering_prompt && (
                <div className={`p-2.5 rounded-lg border text-xs ${theme.quoteBox}`}>
                  <span className="text-[10px] font-mono text-zinc-400 block font-bold">Steering Prompt</span>
                  <span>{studio.user_steering_prompt}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right 1 Col: Selected Node Inspector */}
        <div className={`p-5 rounded-xl border space-y-4 ${theme.quoteBox}`}>
          <div className="flex items-center gap-2 border-b pb-3">
            <Layers className="w-4 h-4 text-indigo-600" />
            <h4 className={`text-xs font-bold uppercase tracking-wider ${theme.headingFont} ${theme.textPrimary}`}>
              Concept Inspector
            </h4>
          </div>

          {selectedNode ? (
            <div className="space-y-3">
              <div>
                <span className="text-[10px] font-mono text-zinc-400 uppercase font-bold">Selected Node</span>
                <h3 className={`text-sm font-bold ${theme.headingFont} ${theme.textPrimary}`}>
                  {selectedNode.label}
                </h3>
              </div>

              {selectedNode.description && (
                <div className={`p-3 rounded-lg border text-xs leading-relaxed ${theme.cardClass}`}>
                  {selectedNode.description}
                </div>
              )}

              {selectedNode.children && selectedNode.children.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-[10px] font-mono text-zinc-400 uppercase font-bold">
                    Connected Sub-Branches ({selectedNode.children.length})
                  </span>
                  <div className="space-y-1">
                    {selectedNode.children.map((child) => (
                      <div
                        key={child.id}
                        onClick={() => setSelectedNode(child)}
                        className={`p-2 rounded-lg border text-xs flex items-center justify-between cursor-pointer hover:border-indigo-500 transition ${theme.cardClass}`}
                      >
                        <span className="truncate">{child.label}</span>
                        <ChevronRight className="w-3.5 h-3.5 text-indigo-500" />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-12 text-zinc-400 space-y-2">
              <BookOpen className="w-8 h-8 mx-auto opacity-50 text-indigo-500" />
              <p className="text-xs">Click any concept node on the left to inspect its deep evidence, grounded sources, and connected sub-branches.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MindMapRenderer;
