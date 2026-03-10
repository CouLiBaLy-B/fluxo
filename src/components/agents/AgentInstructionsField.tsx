// ── AgentInstructionsField — Champ de saisie des instructions pour l'agent ────

interface Props {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function AgentInstructionsField({ value, onChange, disabled, placeholder }: Props) {
  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-gray-700">
        Instructions pour l'agent
        <span className="ml-1 text-xs font-normal text-gray-400">(optionnel)</span>
      </label>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder ?? "Décris précisément ce que l'agent doit faire. Plus c'est détaillé, meilleur sera le résultat..."}
        rows={4}
        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg resize-none
                   focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                   placeholder-gray-400 disabled:bg-gray-50 disabled:text-gray-400"
      />
      <p className="text-xs text-gray-400">
        Exemple : "Génère un composant React avec TypeScript strict, tests unitaires Vitest, et README"
      </p>
    </div>
  );
}
