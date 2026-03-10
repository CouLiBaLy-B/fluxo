// ── AIIssueCard — Enrichissement visuel d'une carte Kanban avec indicateurs AI ─

import type { AIAgent, AITaskQueue, TaskQueueStatus } from '../../types';
import { AgentProgressBar } from '../agents/AgentProgressBar';

interface Props {
  agent?: AIAgent | null;
  task?: AITaskQueue | null;
  aiProgress?: number;
  onOpenPanel?: () => void;
}

const STATUS_LABELS: Partial<Record<TaskQueueStatus, string>> = {
  pending:   'En attente',
  running:   'En cours',
  paused:    'Pause',
  completed: 'Terminé',
  failed:    'Échec',
  cancelled: 'Annulé',
};

const STATUS_BADGE_STYLES: Partial<Record<TaskQueueStatus, string>> = {
  pending:   'bg-gray-100 text-gray-600',
  running:   'bg-blue-100 text-blue-700',
  paused:    'bg-yellow-100 text-yellow-700',
  completed: 'bg-green-100 text-green-700',
  failed:    'bg-red-100 text-red-700',
  cancelled: 'bg-gray-100 text-gray-400',
};

export function AIIssueCard({ agent, task, aiProgress, onOpenPanel }: Props) {
  if (!agent) return null;

  const progress = aiProgress ?? task?.progress ?? 0;
  const status = task?.status;
  const isActive = status === 'running' || status === 'pending';
  const tokensUsed = 0; // calculé depuis les logs si besoin

  return (
    <div className="mt-2 space-y-1.5">
      {/* Barre de progression */}
      {(isActive || (progress > 0)) && (
        <AgentProgressBar progress={progress} status={status} height="sm" />
      )}

      {/* Badge agent + statut */}
      <div className="flex items-center justify-between">
        <button
          onClick={e => { e.stopPropagation(); onOpenPanel?.(); }}
          className="flex items-center gap-1.5 group hover:opacity-80 transition-opacity"
          title={`${agent.name} — Cliquer pour voir les détails`}
        >
          <span className="text-sm">{agent.avatarEmoji}</span>
          <span className="text-xs text-gray-500 group-hover:text-gray-700 truncate max-w-[100px]">
            {agent.name.replace('Agent ', '')}
          </span>
          {status && (
            <span className={`px-1.5 py-0.5 text-xs rounded font-medium ${STATUS_BADGE_STYLES[status] ?? ''}`}>
              {STATUS_LABELS[status] ?? status}
            </span>
          )}
        </button>

        {isActive && (
          <span className="flex items-center gap-1 text-xs text-gray-400">
            <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />
            {Math.round(progress)}%
          </span>
        )}
      </div>
    </div>
  );
}
