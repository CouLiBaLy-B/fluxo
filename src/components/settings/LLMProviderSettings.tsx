import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';

// ── Types ─────────────────────────────────────────────────────────────────────

type LLMProvider =
  | 'mock'
  | 'openai'
  | 'anthropic'
  | 'ollama'
  | 'gemini'
  | 'mistral'
  | 'cohere'
  | 'groq'
  | 'azure-openai'
  | 'huggingface';

interface ProviderInfo {
  label:    string;
  icon:     string;
  envKeys:  string[];
  docsUrl:  string;
}

interface LLMConfig {
  provider:           LLMProvider;
  model:              string;
  availableProviders: LLMProvider[];
  defaultModels:      Record<LLMProvider, string>;
  suggestedModels:    Record<LLMProvider, string[]>;
  providers: Array<{
    id:              LLMProvider;
    active:          boolean;
    configured:      boolean;
    envStatus:       Record<string, boolean>;
    defaultModel:    string;
    suggestedModels: string[];
  }>;
  // Raccourcis rétro-compatibles
  hasOpenAIKey:      boolean;
  hasAnthropicKey:   boolean;
  hasGeminiKey:      boolean;
  hasMistralKey:     boolean;
  hasCohereKey:      boolean;
  hasGroqKey:        boolean;
  hasAzureOpenAIKey: boolean;
  hasHuggingFaceKey: boolean;
}

interface TestResult {
  success:    boolean;
  provider:   string;
  model:      string;
  durationMs: number;
  tokensUsed?: number;
  response?:   string;
  error?:      string;
}

// ── Métadonnées des providers ─────────────────────────────────────────────────

const PROVIDER_INFO: Record<LLMProvider, ProviderInfo> = {
  mock: {
    label:   'Mock — développement sans clé API',
    icon:    '🎭',
    envKeys: [],
    docsUrl: '',
  },
  openai: {
    label:   'OpenAI — GPT-4o, GPT-4o-mini, o3…',
    icon:    '🟢',
    envKeys: ['OPENAI_API_KEY'],
    docsUrl: 'https://platform.openai.com/api-keys',
  },
  anthropic: {
    label:   'Anthropic — Claude Opus, Sonnet, Haiku…',
    icon:    '🟣',
    envKeys: ['ANTHROPIC_API_KEY'],
    docsUrl: 'https://console.anthropic.com/settings/keys',
  },
  ollama: {
    label:   'Ollama — modèles locaux, zéro coût',
    icon:    '🦙',
    envKeys: [],
    docsUrl: 'https://ollama.com',
  },
  gemini: {
    label:   'Google Gemini — Flash, Pro…',
    icon:    '♊',
    envKeys: ['GEMINI_API_KEY'],
    docsUrl: 'https://aistudio.google.com/app/apikey',
  },
  mistral: {
    label:   'Mistral AI — Large, Small, Codestral…',
    icon:    '🌬️',
    envKeys: ['MISTRAL_API_KEY'],
    docsUrl: 'https://console.mistral.ai/api-keys',
  },
  cohere: {
    label:   'Cohere — Command R, Command R+…',
    icon:    '🔵',
    envKeys: ['COHERE_API_KEY'],
    docsUrl: 'https://dashboard.cohere.com/api-keys',
  },
  groq: {
    label:   'Groq — Llama 3, Mixtral (ultra-rapide)',
    icon:    '⚡',
    envKeys: ['GROQ_API_KEY'],
    docsUrl: 'https://console.groq.com/keys',
  },
  'azure-openai': {
    label:   'Azure OpenAI — GPT-4o sur Azure',
    icon:    '☁️',
    envKeys: ['AZURE_OPENAI_API_KEY', 'AZURE_OPENAI_ENDPOINT'],
    docsUrl: 'https://portal.azure.com',
  },
  huggingface: {
    label:   'Hugging Face — Inference API & Endpoints',
    icon:    '🤗',
    envKeys: ['HF_API_KEY'],
    docsUrl: 'https://huggingface.co/settings/tokens',
  },
};

// ── Sous-composants ───────────────────────────────────────────────────────────

/** Badge coloré selon le statut du provider */
function StatusBadge({ configured, active }: { configured: boolean; active: boolean }) {
  if (active) {
    return (
      <span className="px-1.5 py-0.5 bg-[#0052CC] text-white rounded text-[10px] font-bold">
        ACTIF
      </span>
    );
  }
  if (configured) {
    return (
      <span className="px-1.5 py-0.5 bg-[#E3FCEF] text-[#006644] rounded text-[10px] font-semibold">
        PRÊT
      </span>
    );
  }
  return (
    <span className="px-1.5 py-0.5 bg-[#DFE1E6] text-[#42526E] rounded text-[10px] font-semibold">
      NON CONFIGURÉ
    </span>
  );
}

/** Liste des variables d'environnement manquantes */
function MissingKeysWarning({
  provider,
  envStatus,
}: {
  provider:  LLMProvider;
  envStatus: Record<string, boolean>;
}) {
  const info    = PROVIDER_INFO[provider];
  const missing = info.envKeys.filter(k => !envStatus[k]);

  if (missing.length === 0 || provider === 'mock' || provider === 'ollama') {
    return null;
  }

  return (
    <div className="flex items-start gap-2 px-3 py-2.5 bg-[#FFFAE6] border border-[#F5C518] rounded-lg text-[12px] text-[#7A5B00]">
      {/* Icône warning */}
      <svg
        width="14" height="14" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        className="mt-0.5 flex-shrink-0"
      >
        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
        <line x1="12" y1="9" x2="12" y2="13"/>
        <line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
      <span>
        Variable{missing.length > 1 ? 's' : ''} manquante{missing.length > 1 ? 's' : ''} :{' '}
        {missing.map((k, i) => (
          <span key={k}>
            <code className="bg-[#FFF0B3] px-1 rounded">{k}</code>
            {i < missing.length - 1 && ', '}
          </span>
        ))}
        {info.docsUrl && (
          <>
            {' — '}
            <a
              href={info.docsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-[#5A4000]"
            >
              Obtenir une clé
            </a>
          </>
        )}
      </span>
    </div>
  );
}

/** Résultat du test de connectivité */
function TestResultBanner({ result }: { result: TestResult }) {
  if (result.success) {
    return (
      <div className="flex items-start gap-2 px-3 py-2.5 bg-[#E3FCEF] border border-[#79F2C0] rounded-lg text-[12px] text-[#006644]">
        <span className="font-bold mt-0.5">✓</span>
        <div>
          <div className="font-semibold">Connexion réussie</div>
          <div className="text-[11px] mt-0.5 text-[#006644]/80">
            Modèle : <strong>{result.model}</strong> ·{' '}
            {result.durationMs}ms · {result.tokensUsed} tokens
          </div>
          {result.response && (
            <div className="mt-1 font-mono text-[11px] bg-[#FFFFFF]/60 px-2 py-1 rounded">
              {result.response}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2 px-3 py-2.5 bg-[#FFEBE6] border border-[#FF8F73] rounded-lg text-[12px] text-[#BF2600]">
      <span className="font-bold mt-0.5">✗</span>
      <div>
        <div className="font-semibold">Échec de la connexion</div>
        <div className="text-[11px] mt-0.5 font-mono break-all">{result.error}</div>
      </div>
    </div>
  );
}

// ── Composant principal ───────────────────────────────────────────────────────

export function LLMProviderSettings() {
  const queryClient = useQueryClient();

  // ── State ──────────────────────────────────────────────────────────────────
  const [provider,    setProvider]    = useState<LLMProvider>('mock');
  const [model,       setModel]       = useState('mock-v1');
  const [toast,       setToast]       = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [testResult,  setTestResult]  = useState<TestResult | null>(null);
  const [isTesting,   setIsTesting]   = useState(false);
  const [showModels,  setShowModels]  = useState(false);

  // Clés API saisies dans les champs (valeurs en clair, non encore sauvegardées)
  const [apiKeys,     setApiKeys]     = useState<Record<string, string>>({});
  // Clés déjà configurées (valeurs masquées retournées par le backend)
  const [maskedKeys,  setMaskedKeys]  = useState<Record<string, { set: boolean; masked: string }>>({});
  // Visibilité de chaque champ clé (password vs text)
  const [showKey,     setShowKey]     = useState<Record<string, boolean>>({});

  // ── Data fetching ──────────────────────────────────────────────────────────
  const { data: config, isLoading } = useQuery<LLMConfig>({
    queryKey: ['admin', 'llm-config'],
    queryFn:  () => api.admin.getLLMConfig(),
  });

  useQuery({
    queryKey: ['admin', 'llm-keys'],
    queryFn:  async () => {
      const data = await api.admin.getLLMKeys();
      setMaskedKeys(data);
      return data;
    },
  });

  // Synchroniser les champs quand la config est chargée
  useEffect(() => {
    if (config) {
      setProvider(config.provider);
      setModel(config.model);
    }
  }, [config]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  /** Pré-remplit le modèle par défaut quand le provider change */
  const handleProviderChange = (p: LLMProvider) => {
    setProvider(p);
    setModel(config?.defaultModels[p] ?? 'mock-v1');
    setTestResult(null);
    setShowModels(false);
  };

  /** Sélectionne un modèle suggéré */
  const handleSelectSuggested = (m: string) => {
    setModel(m);
    setShowModels(false);
  };

  /** Test de connectivité du provider actif en DB */
  const handleTest = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const result = await api.admin.testLLMConfig() as TestResult;
      setTestResult(result);
    } catch (err) {
      setTestResult({
        success:    false,
        provider,
        model,
        durationMs: 0,
        error:      (err as Error).message,
      });
    } finally {
      setIsTesting(false);
    }
  };

  // ── Mutation de sauvegarde ─────────────────────────────────────────────────
  const mutation = useMutation({
    mutationFn: async () => {
      // Sauvegarder les clés API saisies (valeurs non-vides uniquement)
      const keysToSave = Object.fromEntries(
        Object.entries(apiKeys).filter(([, v]) => (v as string).trim())
      ) as Record<string, string>;
      if (Object.keys(keysToSave).length > 0) {
        await api.admin.saveLLMKeys(keysToSave);
      }
      return api.admin.updateLLMConfig({ provider, model });
    },
    onSuccess: (data: { provider: string; model: string; warnings?: string[] }) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'llm-config'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'llm-keys'] });
      setApiKeys({}); // vider les champs après sauvegarde réussie
      setTestResult(null);

      const msg = data.warnings?.length
        ? `Sauvegardé avec avertissements : ${data.warnings[0]}`
        : `Provider mis à jour : ${data.provider} / ${data.model}`;

      setToast({ type: data.warnings?.length ? 'error' : 'success', msg });
      setTimeout(() => setToast(null), 4000);
    },
    onError: (err) => {
      setToast({ type: 'error', msg: (err as Error).message });
      setTimeout(() => setToast(null), 4000);
    },
  });

  // ── Données dérivées ───────────────────────────────────────────────────────

  const currentProviderMeta = config?.providers?.find(p => p.id === provider);
  const suggestedModels     = config?.suggestedModels?.[provider] ?? [];
  const envStatus           = currentProviderMeta?.envStatus ?? {};
  const isConfigured        = currentProviderMeta?.configured ?? true;

  // ── Rendu conditionnel : chargement ───────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32 text-[#42526E] text-sm">
        <svg className="animate-spin w-5 h-5 mr-2" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"
            strokeDasharray="32" strokeDashoffset="12"/>
        </svg>
        Chargement…
      </div>
    );
  }

  // ── Rendu principal ────────────────────────────────────────────────────────

  return (
    <div className="max-w-xl space-y-6">

      {/* En-tête */}
      <div>
        <h2 className="text-[18px] font-bold text-[#172B4D] mb-1">Provider LLM</h2>
        <p className="text-[13px] text-[#42526E]">
          Choisissez le fournisseur de modèle utilisé par les agents AI.
          Les clés API peuvent être saisies ci-dessous et sont sauvegardées en base de données.
        </p>
      </div>

      {/* Sélecteur de provider */}
      <div>
        <label className="block text-[12px] font-semibold text-[#172B4D] uppercase tracking-wide mb-2">
          Fournisseur
        </label>
        <div className="grid gap-2">
          {(Object.keys(PROVIDER_INFO) as LLMProvider[]).map(p => {
            const meta       = config?.providers?.find(x => x.id === p);
            const isSelected = provider === p;
            const configured = meta?.configured ?? (p === 'mock' || p === 'ollama');

            return (
              <button
                key={p}
                onClick={() => handleProviderChange(p)}
                className={[
                  'flex items-center gap-3 px-4 py-3 rounded-lg border-2 text-left transition-all',
                  isSelected
                    ? 'border-[#0052CC] bg-[#E6EFFF]'
                    : 'border-[#DFE1E6] bg-white hover:border-[#0052CC]/40',
                ].join(' ')}
              >
                {/* Icône */}
                <span className="text-[20px] leading-none w-7 text-center flex-shrink-0">
                  {PROVIDER_INFO[p].icon}
                </span>

                {/* Infos */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-semibold text-[#172B4D]">
                      {p.toUpperCase()}
                    </span>
                    <StatusBadge
                      configured={configured}
                      active={config?.provider === p}
                    />
                  </div>
                  <div className="text-[12px] text-[#42526E] truncate">
                    {PROVIDER_INFO[p].label}
                  </div>
                </div>

                {/* Checkmark si sélectionné */}
                {isSelected && (
                  <svg
                    width="16" height="16" viewBox="0 0 24 24" fill="none"
                    stroke="#0052CC" strokeWidth="2.5"
                    strokeLinecap="round" strokeLinejoin="round"
                    className="flex-shrink-0"
                  >
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Champ modèle + suggestions */}
      <div>
        <label className="block text-[12px] font-semibold text-[#172B4D] uppercase tracking-wide mb-1.5">
          Modèle
        </label>

        <div className="relative">
          <input
            type="text"
            value={model}
            onChange={e => setModel(e.target.value)}
            onFocus={() => suggestedModels.length > 0 && setShowModels(true)}
            placeholder={`ex: ${config?.defaultModels[provider] ?? 'model-name'}`}
            className="w-full px-3 py-2 border border-[#DFE1E6] rounded-lg text-[13px] text-[#172B4D]
                       focus:outline-none focus:border-[#0052CC] focus:ring-2 focus:ring-[#0052CC]/20"
          />

          {/* Dropdown des modèles suggérés */}
          {showModels && suggestedModels.length > 0 && (
            <div className="absolute z-10 mt-1 w-full bg-white border border-[#DFE1E6] rounded-lg shadow-lg overflow-hidden">
              <div className="px-3 py-1.5 bg-[#F4F5F7] text-[11px] font-semibold text-[#42526E] uppercase tracking-wide">
                Modèles suggérés
              </div>
              {suggestedModels.map(m => (
                <button
                  key={m}
                  onClick={() => handleSelectSuggested(m)}
                  className={[
                    'w-full text-left px-3 py-2 text-[13px] hover:bg-[#F4F5F7] transition-colors',
                    m === model ? 'text-[#0052CC] font-semibold' : 'text-[#172B4D]',
                  ].join(' ')}
                >
                  {m}
                  {m === config?.defaultModels[provider] && (
                    <span className="ml-2 text-[10px] text-[#42526E]">(défaut)</span>
                  )}
                </button>
              ))}
              <button
                onClick={() => setShowModels(false)}
                className="w-full text-left px-3 py-2 text-[12px] text-[#42526E] hover:bg-[#F4F5F7] border-t border-[#DFE1E6]"
              >
                Fermer
              </button>
            </div>
          )}
        </div>

        <div className="mt-1 flex items-center justify-between">
          <p className="text-[11px] text-[#6B778C]">
            Doit correspondre au nom exact du modèle chez le provider.
          </p>
          {suggestedModels.length > 0 && (
            <button
              onClick={() => setShowModels(v => !v)}
              className="text-[11px] text-[#0052CC] hover:underline"
            >
              Voir les suggestions
            </button>
          )}
        </div>
      </div>

      {/* Champs de saisie des clés API */}
      {PROVIDER_INFO[provider].envKeys.length > 0 && (
        <div>
          <label className="block text-[12px] font-semibold text-[#172B4D] uppercase tracking-wide mb-2">
            Clés API
          </label>
          <div className="space-y-3">
            {PROVIDER_INFO[provider].envKeys.map((envName: string) => {
              const already = maskedKeys[envName];
              return (
                <div key={envName}>
                  <div className="flex items-center gap-2 mb-1">
                    <code className="text-[11px] text-[#42526E] bg-[#F4F5F7] px-1.5 py-0.5 rounded">
                      {envName}
                    </code>
                    {already?.set && (
                      <span className="px-1.5 py-0.5 bg-[#E3FCEF] text-[#006644] rounded text-[10px] font-semibold">
                        configurée
                      </span>
                    )}
                  </div>
                  <div className="relative">
                    <input
                      type={showKey[envName] ? 'text' : 'password'}
                      value={apiKeys[envName] ?? ''}
                      onChange={(e: { target: { value: string } }) =>
                        setApiKeys((prev: Record<string, string>) => ({ ...prev, [envName]: e.target.value }))
                      }
                      placeholder={
                        already?.set
                          ? already.masked
                          : `Entrez votre ${envName}`
                      }
                      className="w-full px-3 py-2 pr-10 border border-[#DFE1E6] rounded-lg
                                 text-[13px] text-[#172B4D] font-mono
                                 focus:outline-none focus:border-[#0052CC] focus:ring-2 focus:ring-[#0052CC]/20"
                    />
                    {/* Toggle visibilité */}
                    <button
                      type="button"
                      onClick={() =>
                        setShowKey((prev: Record<string, boolean>) => ({ ...prev, [envName]: !prev[envName] }))
                      }
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#6B778C] hover:text-[#172B4D]"
                      title={showKey[envName] ? 'Masquer' : 'Afficher'}
                    >
                      {showKey[envName] ? (
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/>
                          <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/>
                          <line x1="1" y1="1" x2="23" y2="23"/>
                        </svg>
                      ) : (
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                          <circle cx="12" cy="12" r="3"/>
                        </svg>
                      )}
                    </button>
                  </div>
                  {already?.set && !apiKeys[envName] && (
                    <p className="mt-1 text-[11px] text-[#6B778C]">
                      Laissez vide pour conserver la clé actuelle.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Avertissement clés manquantes */}
      {!isConfigured && (
        <MissingKeysWarning provider={provider} envStatus={envStatus} />
      )}

      {/* Résultat du test */}
      {testResult && <TestResultBanner result={testResult} />}

      {/* Actions */}
      <div className="flex items-center gap-3">
        {/* Bouton sauvegarder */}
        <button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
          className="flex items-center gap-2 px-5 py-2.5 bg-[#0052CC] hover:bg-[#0065FF]
                     disabled:opacity-60 text-white text-[13px] font-semibold
                     rounded-lg transition-colors"
        >
          {mutation.isPending ? (
            <>
              <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"
                  strokeDasharray="32" strokeDashoffset="12"/>
              </svg>
              Enregistrement…
            </>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/>
                <polyline points="17 21 17 13 7 13 7 21"/>
                <polyline points="7 3 7 8 15 8"/>
              </svg>
              Enregistrer
            </>
          )}
        </button>

        {/* Bouton tester la connexion */}
        <button
          onClick={handleTest}
          disabled={isTesting}
          className="flex items-center gap-2 px-4 py-2.5 border border-[#DFE1E6]
                     hover:border-[#0052CC] hover:text-[#0052CC] disabled:opacity-60
                     text-[#42526E] text-[13px] font-semibold rounded-lg transition-colors"
        >
          {isTesting ? (
            <>
              <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"
                  strokeDasharray="32" strokeDashoffset="12"/>
              </svg>
              Test en cours…
            </>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/>
                <polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
              Tester la connexion
            </>
          )}
        </button>
      </div>

      {/* Toast */}
      {toast && (
        <div className={[
          'flex items-center gap-2 px-3 py-2.5 rounded-lg text-[13px] font-medium',
          toast.type === 'success'
            ? 'bg-[#E3FCEF] text-[#006644]'
            : 'bg-[#FFFAE6] text-[#7A5B00]',
        ].join(' ')}>
          {toast.type === 'success' ? '✓' : '⚠'} {toast.msg}
        </div>
      )}

      {/* Config active en DB */}
      {config && (
        <div className="pt-4 border-t border-[#DFE1E6]">
          <p className="text-[11px] text-[#6B778C] flex items-center gap-2 flex-wrap">
            <span>
              Config active en DB :
              <strong className="text-[#172B4D] ml-1">{config.provider}</strong>
              {' / '}
              <strong className="text-[#172B4D]">{config.model}</strong>
            </span>
            {config.provider === 'mock' && (
              <span className="px-1.5 py-0.5 bg-[#DFE1E6] text-[#42526E] rounded text-[10px] font-semibold">
                MODE MOCK
              </span>
            )}
            {config.provider === 'ollama' && (
              <span className="px-1.5 py-0.5 bg-[#E3FCEF] text-[#006644] rounded text-[10px] font-semibold">
                LOCAL
              </span>
            )}
          </p>
        </div>
      )}
    </div>
  );
}