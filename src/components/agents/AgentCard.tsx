// ── AgentCard — Carte de présentation d'un agent AI avec stats ────────────────

import type { AIAgent } from '../../types';
import { AgentProgressBar } from './AgentProgressBar';

interface Props {
  agent: AIAgent;
  onClick?: () => void;
}

const TYPE_LABELS: Record<string, string> = {
  developer:  'Développeur',
  qa:         'QA Tester',
  writer:     'Rédacteur',
  researcher: 'Chercheur',
  architect:  'Architecte',
};

function formatDuration(ms: number): string {
  if (!ms) return '—';
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  return `${Math.round(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}

function formatTokens(n: number): string {
  if (!n) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export function AgentCard({ agent, onClick }: Props) {
  const currentTasks = agent.currentTasks ?? 0;
  const concurrencyProgress = (currentTasks / agent.maxConcurrentTasks) * 100;
  const isActive = currentTasks > 0;

  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-lg border p-4 transition-all
        ${onClick ? 'cursor-pointer hover:shadow-md hover:border-blue-300' : ''}
        ${!agent.isActive ? 'opacity-50' : ''}`}
    >
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-xl shrink-0"
          style={{ backgroundColor: agent.avatarColor + '20', border: `2px solid ${agent.avatarColor}` }}
        >
          {agent.avatarEmoji}
        </div>

        {/* Info principale */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm text-gray-900 truncate">{agent.name}</span>
            {/* Indicateur statut */}
            <span className={`w-2 h-2 rounded-full shrink-0 ${isActive ? 'bg-green-500 animate-pulse' : 'bg-gray-300'}`} />
          </div>
          <p className="text-xs text-gray-500">{TYPE_LABELS[agent.type] ?? agent.type}</p>
          {agent.description && (
            <p className="text-xs text-gray-400 mt-1 line-clamp-2">{agent.description}</p>
          )}
        </div>
      </div>

      {/* Barre de concurrence */}
      <div className="mt-3 space-y-1">
        <div className="flex justify-between text-xs text-gray-500">
          <span>Tâches actives</span>
          <span>{currentTasks}/{agent.maxConcurrentTasks}</span>
        </div>
        <AgentProgressBar
          progress={concurrencyProgress}
          status={isActive ? 'running' : 'pending'}
          height="sm"
        />
      </div>

      {/* Stats */}
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-xs font-medium text-gray-900">{agent.completedToday ?? 0}</p>
          <p className="text-xs text-gray-400">Auj.</p>
        </div>
        <div>
          <p className="text-xs font-medium text-gray-900">{formatTokens(agent.totalTokensUsed ?? 0)}</p>
          <p className="text-xs text-gray-400">Tokens</p>
        </div>
        <div>
          <p className="text-xs font-medium text-gray-900">{formatDuration(agent.avgDurationMs ?? 0)}</p>
          <p className="text-xs text-gray-400">Moy.</p>
        </div>
      </div>

      {/* Capacités */}
      {agent.capabilities.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {agent.capabilities.slice(0, 3).map(cap => (
            <span key={cap} className="px-1.5 py-0.5 text-xs bg-gray-100 text-gray-600 rounded">
              {cap}
            </span>
          ))}
          {agent.capabilities.length > 3 && (
            <span className="px-1.5 py-0.5 text-xs bg-gray-100 text-gray-400 rounded">
              +{agent.capabilities.length - 3}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
