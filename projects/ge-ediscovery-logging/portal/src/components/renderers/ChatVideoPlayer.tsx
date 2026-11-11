import React, { useState, useRef } from 'react';
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
} from 'lucide-react';

interface ChatVideoPlayerProps {
  title: string;
  gcsUri?: string;
  previewUrl?: string;
  webUrl?: string;
  sizeBytes?: number;
  sha256?: string;
  theme: ThemeConfig;
}

/**
 * Dedicated, custom-controlled video canvas for Gemini Enterprise Chat preserved outputs.
 * Provides interactive scrubber, 10s skip controls, speed toggles, and direct GCS streaming.
 */
export const ChatVideoPlayer: React.FC<ChatVideoPlayerProps> = ({
  title,
  gcsUri,
  previewUrl,
  webUrl,
  sizeBytes,
  sha256,
  theme,
}) => {
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [playbackRate, setPlaybackRate] = useState<number>(1.0);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const videoRef = useRef<HTMLVideoElement>(null);

  const directUrl = gcsUri ? getDirectMediaUrl(gcsUri) : previewUrl || webUrl;

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

  return (
    <div className="space-y-4">
      {/* Video Viewport */}
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
            aria-label="Play video"
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
            {[1.0, 1.25, 1.5, 2.0].map((rate) => (
              <button
                key={rate}
                onClick={() => handleRateChange(rate)}
                className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-medium transition cursor-pointer ${
                  playbackRate === rate
                    ? 'bg-rose-600 text-white font-bold'
                    : 'text-zinc-600 dark:text-zinc-400 hover:bg-black/5 dark:hover:bg-white/10'
                }`}
              >
                {rate}x
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Provenance Metadata Card */}
      <div className={`p-3.5 rounded-xl border font-mono text-[10px] space-y-1.5 ${theme.quoteBox}`}>
        <div className="flex items-start gap-1.5 flex-wrap">
          <span className={`font-semibold shrink-0 ${theme.textMuted}`}>GCS Storage Path:</span>
          {gcsUri ? (
            <a
              href={getDirectMediaUrl(gcsUri)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 dark:text-blue-400 hover:underline break-all"
            >
              {gcsUri}
            </a>
          ) : (
            <span>-</span>
          )}
        </div>
        <div>
          <span className={`font-semibold ${theme.textMuted}`}>File Size:</span>{' '}
          {sizeBytes ? `${Math.round(sizeBytes / 1024)} KB (${sizeBytes.toLocaleString()} bytes)` : '-'}
        </div>
        {sha256 && (
          <div className="flex items-start gap-1.5 flex-wrap">
            <span className={`font-semibold shrink-0 ${theme.textMuted}`}>SHA-256 Integrity:</span>
            <span className="text-emerald-600 dark:text-emerald-400 font-mono text-[9px] break-all">{sha256}</span>
          </div>
        )}
      </div>

      {/* Download Action */}
      {directUrl && (
        <a
          href={directUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={`w-full py-2.5 px-4 rounded-xl text-xs font-sans font-semibold transition flex items-center justify-center gap-1.5 shadow-2xs ${theme.accentBtn}`}
        >
          <Download className="w-4 h-4" />
          <span>Download Original Preserved File</span>
        </a>
      )}
    </div>
  );
};
