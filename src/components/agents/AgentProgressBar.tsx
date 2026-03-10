// ── AgentProgressBar — Barre de progression de l'agent (0-100%) ──────────────

import type { TaskQueueStatus } from '../../types';

interface Props {
  progress: number;
  status?: TaskQueueStatus | null;
  showLabel?: boolean;
  height?: 'sm' | 'md';
}

const STATUS_COLORS: Record<string, string> = {
  running:   'bg-blue-500',
  completed: 'bg-green-500',
  failed:    'bg-red-500',
  paused:    'bg-yellow-500',
  pending:   'bg-gray-400',
  cancelled: 'bg-gray-400',
};

export function AgentProgressBar({ progress, status, showLabel = false, height = 'sm' }: Props) {
  const clampedProgress = Math.min(100, Math.max(0, progress));
  const colorClass = STATUS_COLORS[status ?? 'running'] ?? 'bg-blue-500';
  const heightClass = height === 'md' ? 'h-2' : 'h-1.5';
  const isAnimated = status === 'running';

  return (
    <div className="w-full">
      {showLabel && (
        <div className="flex justify-between items-center mb-1">
          <span className="text-xs text-gray-500">{Math.round(clampedProgress)}%</span>
        </div>
      )}
      <div className={`w-full ${heightClass} bg-gray-200 rounded-full overflow-hidden`}>
        <div
          className={`${heightClass} ${colorClass} rounded-full transition-all duration-500 ${isAnimated ? 'animate-pulse' : ''}`}
          style={{ width: `${clampedProgress}%` }}
        />
      </div>
    </div>
  );
}
