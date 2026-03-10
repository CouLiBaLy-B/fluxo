import { Router } from 'express';
import type { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';

import { llmService } from '../services/llm.service';
import { pool } from '../db/pool';
import type { LLMProvider } from '../types/agents.types';

const router = Router();

const VALID_PROVIDERS: LLMProvider[] = ['mock', 'openai', 'anthropic', 'ollama'];

const DEFAULT_MODELS: Record<LLMProvider, string> = {
  mock:      'mock',
  openai:    'gpt-4o-mini',
  anthropic: 'claude-sonnet-4-6',
  ollama:    'llama3.2',
};

// ── GET /api/admin/llm-config ─────────────────────────────────────────────────

router.get('/llm-config', (_req: Request, res: Response) => {
  const config = llmService.getConfig();
  res.json({
    provider:           config.provider,
    model:              config.model,
    availableProviders: VALID_PROVIDERS,
    defaultModels:      DEFAULT_MODELS,
    hasOpenAIKey:       !!process.env['OPENAI_API_KEY'],
    hasAnthropicKey:    !!process.env['ANTHROPIC_API_KEY'],
  });
});

// ── PUT /api/admin/llm-config ─────────────────────────────────────────────────

router.put('/llm-config',
  body('provider').isIn(VALID_PROVIDERS),
  body('model').isString().notEmpty().isLength({ max: 100 }),
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ error: 'VALIDATION_ERROR', details: errors.array() });
      return;
    }

    const { provider, model } = req.body as { provider: LLMProvider; model: string };

    // Mise à jour en mémoire (effet immédiat)
    llmService.setProvider(provider, model);

    // Persistance en DB (survit aux redémarrages)
    await pool.query(
      `INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2, NOW()), ($3, $4, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      ['llm_provider', provider, 'llm_model', model]
    );

    res.json({ success: true, provider, model });
  }
);

export default router;
