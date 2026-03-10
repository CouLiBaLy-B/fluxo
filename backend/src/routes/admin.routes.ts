import { Router } from 'express';
import type { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';

import { llmService } from '../services/llm.service';
import { pool } from '../db/pool';
import type { LLMProvider } from '../types/agents.types';

const router = Router();

// ── Constantes synchronisées avec llm.service.ts ──────────────────────────────

const VALID_PROVIDERS: LLMProvider[] = [
  'mock',
  'openai',
  'anthropic',
  'ollama',
  'gemini',
  'mistral',
  'cohere',
  'groq',
  'azure-openai',
  'huggingface',
];

const DEFAULT_MODELS: Record<LLMProvider, string> = {
  mock:           'mock-v1',
  openai:         'gpt-4o',
  anthropic:      'claude-sonnet-4-6',
  ollama:         'llama3.2',
  gemini:         'gemini-2.0-flash',
  mistral:        'mistral-large-latest',
  cohere:         'command-r-plus',
  groq:           'llama-3.3-70b-versatile',
  'azure-openai': 'gpt-4o',
  huggingface:    'mistralai/Mistral-7B-Instruct-v0.3',
};

/** Modèles suggérés par provider (affichés dans l'UI pour guider l'utilisateur) */
const SUGGESTED_MODELS: Record<LLMProvider, string[]> = {
  mock:      ['mock-v1'],
  openai:    ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'o1', 'o3-mini'],
  anthropic: [
    'claude-opus-4-5',
    'claude-sonnet-4-6',
    'claude-haiku-4-5',
  ],
  ollama: [
    'llama3.2',
    'llama3.1:70b',
    'mistral',
    'qwen2.5-coder',
    'phi3.5',
    'gemma2',
    'deepseek-r1',
  ],
  gemini: [
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite',
    'gemini-1.5-pro',
    'gemini-1.5-flash',
  ],
  mistral: [
    'mistral-large-latest',
    'mistral-small-latest',
    'codestral-latest',
    'mistral-embed',
  ],
  cohere: [
    'command-r-plus',
    'command-r',
    'command-light',
  ],
  groq: [
    'llama-3.3-70b-versatile',
    'llama-3.1-8b-instant',
    'mixtral-8x7b-32768',
    'gemma2-9b-it',
  ],
  'azure-openai': ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'],
  huggingface: [
    'mistralai/Mistral-7B-Instruct-v0.3',
    'meta-llama/Llama-3.3-70B-Instruct',
    'Qwen/Qwen2.5-Coder-7B-Instruct',
    'microsoft/Phi-3.5-mini-instruct',
    'CohereForAI/aya-expanse-8b',
  ],
};

/** Clés d'environnement requises par provider (pour le statut de configuration) */
const REQUIRED_ENV_KEYS: Partial<Record<LLMProvider, string[]>> = {
  openai:         ['OPENAI_API_KEY'],
  anthropic:      ['ANTHROPIC_API_KEY'],
  ollama:         [], // local, pas de clé requise
  gemini:         ['GEMINI_API_KEY'],
  mistral:        ['MISTRAL_API_KEY'],
  cohere:         ['COHERE_API_KEY'],
  groq:           ['GROQ_API_KEY'],
  'azure-openai': ['AZURE_OPENAI_API_KEY', 'AZURE_OPENAI_ENDPOINT'],
  huggingface:    ['HF_API_KEY'],
  mock:           [], // toujours disponible
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Vérifie si toutes les clés requises sont présentes (DB ou process.env). */
function isProviderConfigured(provider: LLMProvider): boolean {
  const required = REQUIRED_ENV_KEYS[provider] ?? [];
  return required.every(key => llmService.hasKey(key));
}

/** Retourne le statut détaillé des clés pour un provider (DB ou process.env). */
function getProviderEnvStatus(provider: LLMProvider): Record<string, boolean> {
  const required = REQUIRED_ENV_KEYS[provider] ?? [];
  return Object.fromEntries(
    required.map(key => [key, llmService.hasKey(key)])
  );
}

/** Masque une valeur de clé API pour l'affichage (premiers 6 + ••• + derniers 4). */
function maskKey(value: string): string {
  if (value.length <= 10) return '••••••••••';
  return value.slice(0, 6) + '••••••••••••' + value.slice(-4);
}

/** Récupère la valeur d'une clé (cache DB prioritaire sur process.env). */
function getKeyValue(envName: string): string {
  return process.env[envName] ?? '';
}

// ── GET /api/admin/llm-config ─────────────────────────────────────────────────
// Retourne la config active + les métadonnées de tous les providers.

router.get('/llm-config', (_req: Request, res: Response) => {
  const config = llmService.getConfig();

  // Statut détaillé de chaque provider
  const providers = VALID_PROVIDERS.map(provider => ({
    id:              provider,
    configured:      isProviderConfigured(provider),
    envStatus:       getProviderEnvStatus(provider),
    defaultModel:    DEFAULT_MODELS[provider],
    suggestedModels: SUGGESTED_MODELS[provider],
  }));

  res.json({
    // Config active
    provider: config.provider,
    model:    config.model,

    // Métadonnées
    availableProviders: VALID_PROVIDERS,
    defaultModels:      DEFAULT_MODELS,
    suggestedModels:    SUGGESTED_MODELS,
    providers,

    // Raccourcis pour l'UI (rétro-compatibilité)
    hasOpenAIKey:       Boolean(process.env['OPENAI_API_KEY']),
    hasAnthropicKey:    Boolean(process.env['ANTHROPIC_API_KEY']),
    hasGeminiKey:       Boolean(process.env['GEMINI_API_KEY']),
    hasMistralKey:      Boolean(process.env['MISTRAL_API_KEY']),
    hasCohereKey:       Boolean(process.env['COHERE_API_KEY']),
    hasGroqKey:         Boolean(process.env['GROQ_API_KEY']),
    hasAzureOpenAIKey:  Boolean(process.env['AZURE_OPENAI_API_KEY']),
    hasHuggingFaceKey:  Boolean(process.env['HF_API_KEY']),
  });
});

// ── PUT /api/admin/llm-config ─────────────────────────────────────────────────
// Met à jour le provider et le modèle actifs (en mémoire + DB).

router.put(
  '/llm-config',
  body('provider')
    .isIn(VALID_PROVIDERS)
    .withMessage(`Provider invalide. Valeurs acceptées : ${VALID_PROVIDERS.join(', ')}`),
  body('model')
    .isString()
    .notEmpty()
    .isLength({ max: 200 }) // HF model ids peuvent être longs (org/model-name)
    .withMessage('Modèle invalide (chaîne non vide, max 200 caractères)'),

  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ error: 'VALIDATION_ERROR', details: errors.array() });
      return;
    }

    const { provider, model } = req.body as { provider: LLMProvider; model: string };

    // Avertissement si le provider n'est pas configuré (clés manquantes)
    // On autorise quand même la sauvegarde pour permettre de préparer la config
    const configured = isProviderConfigured(provider);
    const warnings: string[] = [];

    if (!configured && provider !== 'mock') {
      const missing = (REQUIRED_ENV_KEYS[provider] ?? [])
        .filter(key => !process.env[key]);
      warnings.push(
        `Provider "${provider}" partiellement configuré. ` +
        `Variables manquantes : ${missing.join(', ')}`
      );
    }

    // Mise à jour en mémoire (effet immédiat, sans redémarrage)
    llmService.setProvider(provider, model);

    // Persistance en DB (survit aux redémarrages)
    await pool.query(
      `INSERT INTO app_settings (key, value, updated_at)
       VALUES ($1, $2, NOW()), ($3, $4, NOW())
       ON CONFLICT (key)
       DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      ['llm_provider', provider, 'llm_model', model]
    );

    res.json({
      success:  true,
      provider,
      model,
      configured,
      ...(warnings.length > 0 && { warnings }),
    });
  }
);

// ── GET /api/admin/llm-config/test ────────────────────────────────────────────
// Teste le provider actif avec un message minimal pour vérifier la connectivité.

router.get('/llm-config/test', async (_req: Request, res: Response) => {
  const config    = llmService.getConfig();
  const startedAt = Date.now();

  try {
    const response = await llmService.complete(
      [{ role: 'user', content: 'Réponds uniquement "OK" sans rien ajouter.' }],
      'default'
    );

    res.json({
      success:    true,
      provider:   config.provider,
      model:      response.model,
      durationMs: Date.now() - startedAt,
      tokensUsed: response.tokensUsed,
      response:   response.content.slice(0, 200), // tronqué pour la sécurité
    });
  } catch (err) {
    const error = err as Error;
    res.status(502).json({
      success:    false,
      provider:   config.provider,
      model:      config.model,
      durationMs: Date.now() - startedAt,
      error:      error.message,
    });
  }
});

// ── GET /api/admin/llm-config/providers ───────────────────────────────────────
// Liste tous les providers avec leur statut de configuration détaillé.

router.get('/llm-config/providers', (_req: Request, res: Response) => {
  const current = llmService.getProvider();

  const providers = VALID_PROVIDERS.map(provider => ({
    id:              provider,
    active:          provider === current,
    configured:      isProviderConfigured(provider),
    envStatus:       getProviderEnvStatus(provider),
    defaultModel:    DEFAULT_MODELS[provider],
    suggestedModels: SUGGESTED_MODELS[provider],
  }));

  res.json({ providers, current });
});

// ── GET /api/admin/llm-config/keys ────────────────────────────────────────────
// Retourne le statut et la valeur masquée de toutes les clés API connues.

router.get('/llm-config/keys', (_req: Request, res: Response) => {
  const result: Record<string, { set: boolean; masked: string }> = {};

  // Collecter toutes les clés connues (dédupliquées)
  const allKeys = new Set<string>();
  for (const keys of Object.values(REQUIRED_ENV_KEYS)) {
    for (const k of keys ?? []) allKeys.add(k);
  }

  for (const envName of allKeys) {
    const isSet = llmService.hasKey(envName);
    result[envName] = {
      set:    isSet,
      masked: isSet ? maskKey(getKeyValue(envName)) : '',
    };
  }

  res.json(result);
});

// ── PUT /api/admin/llm-config/keys ────────────────────────────────────────────
// Sauvegarde les clés API en DB et les active immédiatement en mémoire.

router.put(
  '/llm-config/keys',
  body('keys').isObject().withMessage('keys doit être un objet'),

  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ error: 'VALIDATION_ERROR', details: errors.array() });
      return;
    }

    const { keys } = req.body as { keys: Record<string, string> };

    // Valider que les noms de clés sont connus
    const allKnownKeys = new Set(
      Object.values(REQUIRED_ENV_KEYS).flat().filter(Boolean) as string[]
    );
    const invalid = Object.keys(keys).filter(k => !allKnownKeys.has(k));
    if (invalid.length) {
      res.status(400).json({ error: 'UNKNOWN_KEYS', keys: invalid });
      return;
    }

    const updated: string[] = [];

    for (const [envName, value] of Object.entries(keys)) {
      if (!value.trim()) continue;

      // Persistance en DB
      await pool.query(
        `INSERT INTO app_settings (key, value, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [`api_key_${envName}`, value.trim()]
      );

      // Activation immédiate en mémoire (sans redémarrage)
      llmService.setApiKey(envName, value.trim());
      updated.push(envName);
    }

    res.json({ success: true, updated });
  }
);

export default router;