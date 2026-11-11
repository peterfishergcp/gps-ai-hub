import React, { useMemo } from 'react';
import { Calendar } from 'lucide-react';
import { ThemeConfig } from '../types/theme';

interface DateRangeSliderProps {
  minTimestamp: number;
  maxTimestamp: number;
  selectedStartTime: number;
  onStartTimeChange: (startTime: number) => void;
  theme: ThemeConfig;
  totalEventsCount: number;
  filteredEventsCount: number;
}

function formatDateShort(ms: number): string {
  const d = new Date(ms);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export const DateRangeSlider: React.FC<DateRangeSliderProps> = ({
  minTimestamp,
  maxTimestamp,
  selectedStartTime,
  onStartTimeChange,
  theme,
  totalEventsCount,
  filteredEventsCount,
}) => {
  const isRangeValid = maxTimestamp > minTimestamp;

  const presets = useMemo(() => {
    const now = maxTimestamp || Date.now();
    return [
      {
        label: 'All',
        startTime: minTimestamp,
      },
      {
        label: '30d',
        startTime: Math.max(minTimestamp, now - 30 * 24 * 60 * 60 * 1000),
      },
      {
        label: '7d',
        startTime: Math.max(minTimestamp, now - 7 * 24 * 60 * 60 * 1000),
      },
      {
        label: '24h',
        startTime: Math.max(minTimestamp, now - 24 * 60 * 60 * 1000),
      },
    ];
  }, [minTimestamp, maxTimestamp]);

  if (!isRangeValid) {
    return null;
  }

  const daysDiff = Math.max(1, Math.round((maxTimestamp - selectedStartTime) / (24 * 60 * 60 * 1000)));
  const isAllTime = selectedStartTime <= minTimestamp + 60000;

  const rangeSummary = isAllTime
    ? `${formatDateShort(minTimestamp)} – Today`
    : `Past ${daysDiff}d (${formatDateShort(selectedStartTime)} – Today)`;

  return (
    <div className="space-y-2 p-2.5 rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/50 backdrop-blur-xs select-none">
      {/* Header with Title, Count and Quick Presets */}
      <div className="flex items-center justify-between text-[10px] font-mono">
        <span className={`font-bold flex items-center gap-1 uppercase tracking-wider ${theme.textMuted}`}>
          <Calendar className="w-3 h-3 text-blue-600" />
          Time Window ({filteredEventsCount}/{totalEventsCount})
        </span>

        <div className="flex items-center gap-1">
          {presets.map((p) => {
            const isPresetActive = Math.abs(selectedStartTime - p.startTime) < 60000;
            return (
              <button
                key={p.label}
                type="button"
                onClick={() => onStartTimeChange(p.startTime)}
                className={`px-1.5 py-0.5 rounded text-[9px] font-bold transition cursor-pointer ${
                  isPresetActive
                    ? theme.accentBtn
                    : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50'
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Single Horizontal Slider: Left = Earliest, Right = Today */}
      <div className="space-y-1 pt-0.5">
        <input
          type="range"
          min={minTimestamp}
          max={maxTimestamp}
          value={selectedStartTime}
          onChange={(e) => onStartTimeChange(Number(e.target.value))}
          className="w-full h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
        />
        <div className="flex items-center justify-between text-[8px] font-mono text-zinc-400">
          <span>{formatDateShort(minTimestamp)}</span>
          <span className="font-bold text-blue-600 dark:text-blue-400">
            {isAllTime ? 'All Time' : `Past ${daysDiff} Days`}
          </span>
          <span>Today</span>
        </div>
      </div>
    </div>
  );
};

export default DateRangeSlider;
