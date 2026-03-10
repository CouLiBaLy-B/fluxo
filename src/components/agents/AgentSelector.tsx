// ── AgentSelector — Dropdown de sélection d'agent lors de la création d'issue ─

import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import type { AIAgent } from '../../types';

interface Props {
  value: string | null;
  onChange: (agentId: string | null) => void;
  disabled?: boolean;
}

export function AgentSelector({ value, onChange, disabled }: Props) {
  const { data: agents, isLoading } = useQuery({
    queryKey: ['agents'],
    queryFn: () => api.agents.list(),
    staleTime: 60_000,
  });

  const activeAgents = agents?.filter(a => a.isActive) ?? [];
  const selectedAgent = activeAgents.find(a => a.id === value);

  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-gray-700">
        Assigner à un agent AI
        <span className="ml-1 text-xs font-normal text-gray-400">(optionnel)</span>
      </label>
      <div className="relative">
        <select
          value={value ?? ''}
          onChange={e => onChange(e.target.value || null)}
          disabled={disabled || isLoading}
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg appearance-none
                     bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                     disabled:bg-gray-50 disabled:text-gray-400 pr-8"
        >
          <option value="">— Aucun agent —</option>
          {activeAgents.map(agent => (
            <option key={agent.id} value={agent.id}>
              {agent.avatarEmoji} {agent.name}
              {(agent.currentTasks ?? 0) > 0 ? ` (${agent.currentTasks} en cours)` : ''}
            </option>
          ))}
        </select>
        <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center">
          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>
      {selectedAgent && (
        <p className="text-xs text-gray-500">
          {selectedAgent.avatarEmoji} {selectedAgent.description}
        </p>
      )}
    </div>
  );
}
