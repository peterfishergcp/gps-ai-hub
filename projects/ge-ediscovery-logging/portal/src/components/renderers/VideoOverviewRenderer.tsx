import React, { useState, useRef } from 'react';
import { NotebookStudioRecord } from '../../types/schema';
import { ThemeConfig } from '../../types/theme';
import { getDirectMediaUrl } from '../../services/complianceApi';
import {
  Video,
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
  Download,
  Sparkles,
  FileText,
  Cpu,
  Activity,
} from 'lucide-react';

interface VideoOverviewRendererProps {
  studio: NotebookStudioRecord;
  theme: ThemeConfig;
}

export const VideoOverviewRenderer: React.FC<VideoOverviewRendererProps> = ({ studio, theme }) => {
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [playbackRate, setPlaybackRate] = useState<number>(1.0);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(studio.duration_seconds || 0);
  const videoRef = useRef<HTMLVideoElement>(null);

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
    studio.customization_prompt ||
    metadata.video_focus ||
    metadata.customization_options?.target_audience ||
    studio.user_steering_prompt ||
    '';

  const isGenerating =
    !directUrl ||
    studio.action_type === 'GENERATING' ||
    studio.lifecycle_state === 'GENERATING' ||
    metadata.status === 'GENERATING' ||
    (studio.title || '').toLowerCase().startsWith('generating');

  const estimatedDurationSec = metadata.estimated_duration_sec || studio.duration_seconds || 480;

  const groundedSources = Array.isArray(studio.source_ids)
    ? studio.source_ids
    : Array.isArray(metadata.grounded_source_ids)
    ? metadata.grounded_source_ids
    : typeof studio.grounded_source_ids === 'string'
    ? (() => {
        try {
          return JSON.parse(studio.grounded_source_ids);
        } catch {
          return [];
        }
      })()
    : [];

  const chapters: Array<{ time: number; title: string }> = Array.isArray(metadata.chapters)
    ? metadata.chapters
    : [];

  const formatTime = (seconds: number): string => {
    if (!seconds || isNaN(seconds) || seconds <= 0) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleSkip = (seconds: number) => {
    if (!videoRef.current) return;
    const targetDuration = duration || videoRef.current.duration || 0;
    const newTime = Math.max(0, Math.min(targetDuration || Infinity, videoRef.current.currentTime + seconds));
    videoRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    setCurrentTime(newTime);
    if (videoRef.current) {
      videoRef.current.currentTime = newTime;
    }
  };

  const handleRateChange = (rate: number) => {
    setPlaybackRate(rate);
    if (videoRef.current) {
      videoRef.current.playbackRate = rate;
    }
  };

  const transcriptLines = (studio.note_content || '')
    .split('\n')
    .filter((l) => l.trim().length > 0);

  // Derived Title
  const displayTitle =
    studio.title && !studio.title.toLowerCase().startsWith('generating')
      ? studio.title
      : customization
      ? `Video Synthesis: ${customization.slice(0, 60)}${customization.length > 60 ? '...' : ''}`
      : 'Grounded Explainer Video Synthesis';

  return (
    <div className={`rounded-2xl border overflow-hidden shadow-sm space-y-4 p-6 ${theme.cardClass}`}>
      {/* Header Banner */}
      <div className="flex items-center justify-between border-b pb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2.5">
          <div className="p-2.5 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400">
            <Video className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-rose-500/20 text-rose-700 dark:text-rose-300">
                Video Overview
              </span>
              <span
                className={`text-[9px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                  isGenerating
                    ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300 animate-pulse'
                    : 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                }`}
              >
                {isGenerating ? 'GENERATION IN PROGRESS' : 'READY / PRESERVED'}
              </span>
              <span className={`text-xs font-mono ${theme.textMuted}`}>
                {formatTime(isGenerating ? estimatedDurationSec : duration || estimatedDurationSec)} Target
              </span>
            </div>
            <h2 className={`${theme.headingFont} text-lg font-bold ${theme.textPrimary} mt-0.5`}>
              {displayTitle}
            </h2>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {directUrl && !isGenerating && (
            <a
              href={directUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`p-2 rounded-lg border hover:opacity-80 transition flex items-center gap-1 text-xs font-semibold ${theme.accentBtn}`}
              title="Download Explainer Video MP4"
            >
              <Download className="w-4 h-4" />
              <span>Download MP4</span>
            </a>
          )}
        </div>
      </div>

      {isGenerating ? (
        /* Generation In Progress */
        <div className="space-y-4">
          <div className="relative rounded-2xl overflow-hidden border border-amber-500/30 bg-gradient-to-br from-zinc-950 via-zinc-900 to-rose-950/60 p-8 text-white shadow-xl">
            <div className="flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="flex items-center gap-4">
                <div className="relative">
                  <div className="w-16 h-16 rounded-2xl bg-rose-600/20 border border-rose-500/40 flex items-center justify-center shadow-lg">
                    <Cpu className="w-8 h-8 text-rose-400 animate-pulse" />
                  </div>
                  <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center text-[10px] font-bold text-black ring-2 ring-zinc-950">
                    <Activity className="w-3 h-3 animate-spin" />
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-amber-400 px-2 py-0.5 rounded bg-amber-950/70 border border-amber-800">
                      Gemini Enterprise Multimodal Video Pipeline
                    </span>
                    <span className="text-[10px] font-mono text-zinc-400">
                      Discovery Engine Video Synthesis
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-zinc-100">{displayTitle}</h3>
                  <p className="text-xs text-zinc-400 max-w-xl leading-relaxed">
                    Synthesizing grounded multi-speaker conversational explainer video from ingested documents and theorems.
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-black/40 border border-white/10 space-y-2 shrink-0 min-w-[220px]">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-400 font-mono">Status:</span>
                  <span className="font-bold text-amber-400 font-mono">GENERATING</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-400 font-mono">Target Duration:</span>
                  <span className="font-bold text-zinc-200 font-mono">
                    ~{Math.round(estimatedDurationSec / 60)} min ({estimatedDurationSec}s)
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-400 font-mono">Grounded Corpus:</span>
                  <span className="font-bold text-zinc-200 font-mono">
                    {groundedSources.length > 0 ? `${groundedSources.length} Sources` : 'Ingested Sources'}
                  </span>
                </div>
              </div>
            </div>

            {/* User Steering Directive */}
            {customization && (
              <div className="mt-6 p-4 rounded-xl bg-white/5 border border-white/10 space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-rose-300">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Grounded Steering Directive & Visual Focus</span>
                </div>
                <p className="text-xs text-zinc-300 leading-relaxed font-sans">{customization}</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Video Viewport */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Left 2 Cols: Real Video Player */}
          <div className="lg:col-span-2 space-y-3">
            <div className="relative rounded-2xl overflow-hidden bg-black shadow-lg aspect-video flex items-center justify-center group">
              <video
                ref={videoRef}
                src={directUrl}
                onTimeUpdate={() => {
                  if (videoRef.current) {
                    setCurrentTime(videoRef.current.currentTime);
                  }
                }}
                onLoadedMetadata={() => {
                  if (videoRef.current && videoRef.current.duration) {
                    setDuration(videoRef.current.duration);
                  }
                }}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                className="w-full h-full object-contain"
              />

              {/* Floating Play Overlay Button */}
              {!isPlaying && (
                <button
                  onClick={togglePlay}
                  className="absolute inset-0 m-auto w-14 h-14 rounded-full bg-rose-600/90 text-white flex items-center justify-center shadow-2xl hover:scale-110 transition cursor-pointer"
                >
                  <Play className="w-6 h-6 fill-current ml-1" />
                </button>
              )}
            </div>

            {/* Custom Controls Bar */}
            <div className={`p-3 rounded-xl border space-y-2 text-xs ${theme.quoteBox}`}>
              {/* Timeline Scrubber */}
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={0}
                  max={duration || 100}
                  step="0.1"
                  value={currentTime}
                  onChange={handleSeek}
                  className="w-full h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-rose-600 focus:outline-none focus:ring-2 focus:ring-rose-500/40"
                  aria-label="Video timeline scrubber"
                />
              </div>

              {/* Playback Controls and Timers */}
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-1.5 sm:gap-2">
                  {/* Skip -10s */}
                  <button
                    onClick={() => handleSkip(-10)}
                    className="p-1.5 rounded-lg border border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/10 text-zinc-700 dark:text-zinc-300 transition cursor-pointer flex items-center gap-0.5 font-mono text-[11px] font-medium"
                    title="Skip backward 10s"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>-10s</span>
                  </button>

                  {/* Play / Pause */}
                  <button
                    onClick={togglePlay}
                    className="p-1.5 rounded-lg bg-rose-600 text-white hover:bg-rose-700 transition cursor-pointer"
                    title={isPlaying ? 'Pause' : 'Play'}
                  >
                    {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
                  </button>

                  {/* Skip +10s */}
                  <button
                    onClick={() => handleSkip(10)}
                    className="p-1.5 rounded-lg border border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/10 text-zinc-700 dark:text-zinc-300 transition cursor-pointer flex items-center gap-0.5 font-mono text-[11px] font-medium"
                    title="Skip forward 10s"
                  >
                    <span>+10s</span>
                    <RotateCw className="w-3.5 h-3.5" />
                  </button>

                  {/* Volume Toggle */}
                  <button
                    onClick={() => {
                      if (videoRef.current) {
                        videoRef.current.muted = !isMuted;
                        setIsMuted(!isMuted);
                      }
                    }}
                    className="p-1.5 rounded hover:opacity-75 transition cursor-pointer text-zinc-700 dark:text-zinc-300"
                    title={isMuted ? 'Unmute' : 'Mute'}
                  >
                    {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                  </button>

                  {/* Current Time / Duration */}
                  <span className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
                    {formatTime(currentTime)} / {formatTime(duration)}
                  </span>
                </div>

                {/* Playback Speeds */}
                <div className="flex items-center gap-1">
                  <span className="text-[10px] font-mono text-zinc-400 mr-1 hidden sm:inline">Speed:</span>
                  {[0.75, 1.0, 1.25, 1.5, 2.0].map((rate) => (
                    <button
                      key={rate}
                      onClick={() => handleRateChange(rate)}
                      className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold transition cursor-pointer ${
                        playbackRate === rate
                          ? 'bg-rose-600 text-white'
                          : 'hover:bg-black/5 dark:hover:bg-white/10 text-zinc-700 dark:text-zinc-300'
                      }`}
                    >
                      {rate}x
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Right 1 Col: Dynamic Metadata & Dialogue Transcript */}
          <div className={`p-5 rounded-xl border space-y-4 ${theme.quoteBox}`}>
            {customization && (
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-rose-600 dark:text-rose-400">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Steering Focus</span>
                </div>
                <p className={`text-xs leading-relaxed ${theme.textSecondary}`}>{customization}</p>
              </div>
            )}

            {/* Video Chapters */}
            {chapters.length > 0 && (
              <div className="space-y-2 border-t pt-3">
                <span className="text-[10px] font-mono font-bold uppercase text-zinc-400">
                  Video Chapters
                </span>
                <div className="space-y-1">
                  {chapters.map((ch, idx) => (
                    <div
                      key={idx}
                      onClick={() => {
                        if (videoRef.current) {
                          videoRef.current.currentTime = ch.time;
                          setCurrentTime(ch.time);
                        }
                      }}
                      className={`p-2 rounded-lg border text-xs flex items-center justify-between cursor-pointer hover:border-rose-500 transition ${theme.cardClass}`}
                    >
                      <span className="truncate">{ch.title}</span>
                      <span className="text-[10px] font-mono text-rose-600 font-bold shrink-0">
                        {formatTime(ch.time)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Transcript */}
            {transcriptLines.length > 0 && (
              <div className="space-y-2 border-t pt-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono font-bold uppercase text-zinc-400">
                    Dialogue Transcript
                  </span>
                  <FileText className="w-3.5 h-3.5 text-zinc-400" />
                </div>
                <div
                  className={`p-3 rounded-lg border text-xs max-h-48 overflow-y-auto space-y-2 leading-relaxed ${theme.cardClass}`}
                >
                  {transcriptLines.map((line, idx) => (
                    <p key={idx} className={`${theme.textSecondary}`}>
                      {line}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Technical Telemetry & Cryptographic Verification */}
      <div className={`p-3.5 rounded-xl border text-[11px] font-mono space-y-1 ${theme.quoteBox}`}>
        <div className="flex items-center justify-between">
          <span className={`${theme.textMuted}`}>GCS Storage URI:</span>
          <span className="font-semibold">{studio.gcs_uri || 'Pending Video Synthesis'}</span>
        </div>
        {studio.sha256_hash && (
          <div className="flex items-center justify-between">
            <span className={`${theme.textMuted}`}>SHA-256 Integrity:</span>
            <span className="truncate max-w-[280px]">{studio.sha256_hash}</span>
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className={`${theme.textMuted}`}>Lifecycle State:</span>
          <span
            className={`font-bold ${
              isGenerating ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600'
            }`}
          >
            {studio.action_type || studio.lifecycle_state || 'GENERATING'}
          </span>
        </div>
      </div>
    </div>
  );
};

export default VideoOverviewRenderer;
