import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';

// ── Types ─────────────────────────────────────────────────────────────────────

type LLMProvider = 'mock' | 'openai' | 'anthropic' | 'ollama';

const PROVIDER_LABELS: Record<LLMProvider, string> = {
  mock:      'Mock (développement, sans clé API)',
  openai:    'OpenAI (GPT-4o, GPT-4o-mini…)',
  anthropic: 'Anthropic (Claude Sonnet, Haiku…)',
  ollama:    'Ollama (modèle local, sans coût)',
};

const PROVIDER_ICONS: Record<LLMProvider, string> = {
  mock:      '🎭',
  openai:    '🟢',
  anthropic: '🟣',
  ollama:    '🦙',
};

// ── Composant principal ───────────────────────────────────────────────────────

export function LLMProviderSettings() {
  const queryClient = useQueryClient();

  const { data: config, isLoading } = useQuery({
    queryKey: ['admin', 'llm-config'],
    queryFn: () => api.admin.getLLMConfig(),
  });

  const [provider, setProvider] = useState<LLMProvider>('mock');
  const [model, setModel]       = useState('mock');
  const [toast, setToast]       = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  // Synchroniser les champs quand la config est chargée
  useEffect(() => {
    if (config) {
      setProvider(config.provider as LLMProvider);
      setModel(config.model);
    }
  }, [config]);

  // Pré-remplir le modèle par défaut quand le provider change
  const handleProviderChange = (p: LLMProvider) => {
    setProvider(p);
    setModel(config?.defaultModels[p] ?? p);
  };

  const mutation = useMutation({
    mutationFn: () => api.admin.updateLLMConfig({ provider, model }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'llm-config'] });
      setToast({ type: 'success', msg: `Provider mis à jour : ${data.provider} / ${data.model}` });
      setTimeout(() => setToast(null), 3000);
    },
    onError: (err) => {
      setToast({ type: 'error', msg: (err as Error).message });
      setTimeout(() => setToast(null), 4000);
    },
  });

  const needsKey = (provider === 'openai' && !config?.hasOpenAIKey)
                || (provider === 'anthropic' && !config?.hasAnthropicKey);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32 text-[#42526E] text-sm">
        Chargement…
      </div>
    );
  }

  return (
    <div className="max-w-xl">
      <h2 className="text-[18px] font-bold text-[#172B4D] mb-1">Provider LLM</h2>
      <p className="text-[13px] text-[#42526E] mb-6">
        Choisissez le fournisseur de modèle de langage utilisé par les agents AI.
        Les clés API se configurent dans le fichier <code className="bg-[#F4F5F7] px-1 rounded">.env</code>.
      </p>

      {/* Provider selector */}
      <div className="mb-4">
        <label className="block text-[12px] font-semibold text-[#172B4D] uppercase tracking-wide mb-2">
          Fournisseur
        </label>
        <div className="grid gap-2">
          {(['mock', 'openai', 'anthropic', 'ollama'] as LLMProvider[]).map(p => (
            <button
              key={p}
              onClick={() => handleProviderChange(p)}
              className={[
                'flex items-center gap-3 px-4 py-3 rounded-lg border-2 text-left transition-all',
                provider === p
                  ? 'border-[#0052CC] bg-[#E6EFFF]'
                  : 'border-[#DFE1E6] bg-white hover:border-[#0052CC]/40',
              ].join(' ')}
            >
              <span className="text-[18px]">{PROVIDER_ICONS[p]}</span>
              <div className="flex-1">
                <div className="text-[13px] font-semibold text-[#172B4D]">{p.toUpperCase()}</div>
                <div className="text-[12px] text-[#42526E]">{PROVIDER_LABELS[p]}</div>
              </div>
              {provider === p && (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0052CC" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Model field */}
      <div className="mb-4">
        <label className="block text-[12px] font-semibold text-[#172B4D] uppercase tracking-wide mb-1.5">
          Modèle
        </label>
        <input
          type="text"
          value={model}
          onChange={e => setModel(e.target.value)}
          placeholder="ex: gpt-4o-mini"
          className="w-full px-3 py-2 border border-[#DFE1E6] rounded-lg text-[13px] text-[#172B4D] focus:outline-none focus:border-[#0052CC] focus:ring-2 focus:ring-[#0052CC]/20"
        />
        <p className="mt-1 text-[11px] text-[#6B778C]">
          Doit correspondre au nom exact du modèle chez le provider.
        </p>
      </div>

      {/* Missing API key warning */}
      {needsKey && (
        <div className="flex items-start gap-2 px-3 py-2.5 bg-[#FFFAE6] border border-[#F5C518] rounded-lg mb-4 text-[12px] text-[#7A5B00]">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 flex-shrink-0">
            <triangle points="10.29 3.86 1.82 18 22.18 18"/>
            <path d="M12 9v4M12 17h.01"/>
          </svg>
          <span>
            Clé API manquante pour <strong>{provider}</strong>.
            Ajoutez <code className="bg-[#FFF0B3] px-1 rounded">{provider === 'openai' ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY'}</code> dans votre fichier <code className="bg-[#FFF0B3] px-1 rounded">.env</code> et redémarrez le conteneur.
          </span>
        </div>
      )}

      {/* Save button */}
      <button
        onClick={() => mutation.mutate()}
        disabled={mutation.isPending}
        className="flex items-center gap-2 px-5 py-2.5 bg-[#0052CC] hover:bg-[#0065FF] disabled:opacity-60 text-white text-[13px] font-semibold rounded-lg transition-colors"
      >
        {mutation.isPending ? (
          <>
            <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="32" strokeDashoffset="12"/>
            </svg>
            Enregistrement…
          </>
        ) : 'Enregistrer'}
      </button>

      {/* Toast */}
      {toast && (
        <div className={[
          'mt-4 flex items-center gap-2 px-3 py-2.5 rounded-lg text-[13px] font-medium',
          toast.type === 'success'
            ? 'bg-[#E3FCEF] text-[#006644]'
            : 'bg-[#FFEBE6] text-[#BF2600]',
        ].join(' ')}>
          {toast.type === 'success' ? '✓' : '✗'} {toast.msg}
        </div>
      )}

      {/* Current active config */}
      {config && (
        <div className="mt-6 pt-4 border-t border-[#DFE1E6]">
          <p className="text-[11px] text-[#6B778C]">
            Config active : <strong>{config.provider}</strong> / <strong>{config.model}</strong>
            {config.provider === 'mock' && (
              <span className="ml-2 px-1.5 py-0.5 bg-[#DFE1E6] text-[#42526E] rounded text-[10px] font-semibold">MODE MOCK</span>
            )}
          </p>
        </div>
      )}
    </div>
  );
}
