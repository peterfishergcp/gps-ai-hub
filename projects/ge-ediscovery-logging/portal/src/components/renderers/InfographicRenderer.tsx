import React, { useState } from 'react';
import { NotebookStudioRecord } from '../../types/schema';
import { ThemeConfig } from '../../types/theme';
import { getDirectMediaUrl } from '../../services/complianceApi';
import {
  ImageIcon,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  Download,
  Sparkles,
} from 'lucide-react';

interface InfographicRendererProps {
  studio: NotebookStudioRecord;
  theme: ThemeConfig;
}

export const InfographicRenderer: React.FC<InfographicRendererProps> = ({ studio, theme }) => {
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [imageError, setImageError] = useState<boolean>(false);
  const [imageLoaded, setImageLoaded] = useState<boolean>(false);

  const directUrl = studio.gcs_uri ? getDirectMediaUrl(studio.gcs_uri) : undefined;
  const metadata =
    typeof studio.metadata === 'object' && studio.metadata !== null
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

  const customization =
    typeof studio.customization_prompt === 'string'
      ? studio.customization_prompt
      : metadata.customization_options
      ? typeof metadata.customization_options === 'string'
        ? metadata.customization_options
        : JSON.stringify(metadata.customization_options)
      : '';

  const widthPx = studio.metadata?.width_pixels || metadata.width_pixels || 1920;
  const heightPx = studio.metadata?.height_pixels || metadata.height_pixels || 1080;
  const aspectRatio = metadata.aspect_ratio || '16:9';

  return (
    <div className={`rounded-2xl border overflow-hidden shadow-sm space-y-4 p-6 ${theme.cardClass}`}>
      {/* Header Banner */}
      <div className="flex items-center justify-between border-b pb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2.5">
          <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400">
            <ImageIcon className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-purple-500/20 text-purple-700 dark:text-purple-300">
                Visual Infographic
              </span>
              <span className={`text-xs font-mono ${theme.textMuted}`}>
                {widthPx}x{heightPx}px • {aspectRatio}
              </span>
            </div>
            <h2 className={`${theme.headingFont} text-lg font-bold ${theme.textPrimary} mt-0.5`}>
              {studio.title || 'Visual Overview Infographic'}
            </h2>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          <div className={`flex items-center rounded-lg border p-0.5 ${theme.quoteBox}`}>
            <button
              onClick={() => setZoomLevel((z) => Math.max(50, z - 25))}
              className="p-1.5 rounded hover:opacity-75 transition cursor-pointer"
              title="Zoom Out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="text-[11px] font-mono px-2">{zoomLevel}%</span>
            <button
              onClick={() => setZoomLevel((z) => Math.min(200, z + 25))}
              className="p-1.5 rounded hover:opacity-75 transition cursor-pointer"
              title="Zoom In"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className={`p-2 rounded-lg border hover:opacity-80 transition cursor-pointer ${theme.quoteBox}`}
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          {directUrl && (
            <a
              href={directUrl}
              target="_blank"
              rel="noopener noreferrer"
              download
              className={`p-2 rounded-lg border hover:opacity-80 transition flex items-center gap-1 text-xs font-semibold ${theme.accentBtn}`}
              title="Download Infographic PNG"
            >
              <Download className="w-4 h-4" />
              <span>Download</span>
            </a>
          )}
        </div>
      </div>

      {/* User Steering Focus & Topic Prompt */}
      {(studio.customization_prompt || studio.note_content || customization) && (
        <div className={`p-4 rounded-xl border text-xs leading-relaxed space-y-1.5 ${theme.quoteBox}`}>
          <div className="flex items-center gap-1.5 font-semibold text-purple-600 dark:text-purple-400">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Infographic Steering Focus & Visual Specification</span>
          </div>
          <p className={`${theme.textSecondary}`}>
            {studio.customization_prompt || studio.note_content || customization}
          </p>
        </div>
      )}

      {/* Visual Canvas Viewport */}
      <div
        className={`relative rounded-xl border overflow-hidden bg-black/5 dark:bg-black/30 flex items-center justify-center p-4 min-h-[420px] ${
          isFullscreen ? 'fixed inset-4 z-50 bg-zinc-950/95 flex flex-col p-8' : ''
        }`}
      >
        {isFullscreen && (
          <button
            onClick={() => setIsFullscreen(false)}
            className="absolute top-4 right-4 p-2 rounded-xl bg-white/20 text-white hover:bg-white/30 transition cursor-pointer"
          >
            <Minimize2 className="w-5 h-5" />
          </button>
        )}

        <div
          style={{ transform: `scale(${zoomLevel / 100})`, transformOrigin: 'center center' }}
          className="w-full flex items-center justify-center transition-transform duration-150"
        >
          {directUrl && !imageError ? (
            <div className="relative max-h-[500px] w-auto max-w-full flex items-center justify-center">
              <img
                src={directUrl}
                alt={studio.title || 'Infographic'}
                onLoad={() => setImageLoaded(true)}
                onError={() => setImageError(true)}
                className="max-h-[500px] w-auto max-w-full object-contain rounded-lg shadow-md transition-opacity duration-200"
              />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center p-8 text-center text-zinc-400 space-y-2">
              <ImageIcon className="w-12 h-12 stroke-1 text-zinc-500 opacity-60" />
              <p className="text-xs font-mono">
                {imageError ? 'Unable to load infographic image preview' : 'Infographic image asset pending or unavailable'}
              </p>
              {studio.gcs_uri && (
                <span className="text-[10px] font-mono text-zinc-500 truncate max-w-md">
                  {studio.gcs_uri}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Technical Telemetry & Cryptographic Verification */}
      <div className={`p-3.5 rounded-xl border text-[11px] font-mono space-y-1 ${theme.quoteBox}`}>
        <div className="flex items-center justify-between">
          <span className={`${theme.textMuted}`}>GCS Storage URI:</span>
          <span className="font-semibold">{studio.gcs_uri || '-'}</span>
        </div>
        {studio.sha256_hash && (
          <div className="flex items-center justify-between">
            <span className={`${theme.textMuted}`}>SHA-256 Integrity:</span>
            <span className="truncate max-w-[280px]">{studio.sha256_hash}</span>
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className={`${theme.textMuted}`}>Lifecycle State:</span>
          <span className="font-bold text-emerald-600">{studio.action_type || 'READY'}</span>
        </div>
      </div>
    </div>
  );
};

export default InfographicRenderer;
