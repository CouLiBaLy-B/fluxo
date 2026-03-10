// ═══════════════════════════════════════════════════════════════════════════════
// Routes agents — Endpoints REST pour les agents AI et la gestion des tâches
// ═══════════════════════════════════════════════════════════════════════════════

import { Router, type Request, type Response } from 'express';
import { body, param, query as queryValidator } from 'express-validator';
import { pool } from '../db/pool';
import { requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { AppError } from '../middleware/errorHandler';
import { queueService } from '../services/queue.service';
import { orchestrator } from '../agents/orchestrator';
import type {
  AIAgent,
  AgentType,
  AITaskQueue,
  AgentLog,
  AgentArtifact,
} from '../types/agents.types';

const router = Router();

// Toutes les routes requièrent une authentification
router.use(requireAuth);

// ── Helpers de conversion DB → type ──────────────────────────────────────────

function rowToAgent(row: Record<string, unknown>): AIAgent {
  return {
    id: row['id'] as string,
    name: row['name'] as string,
    slug: row['slug'] as string,
    type: row['type'] as AgentType,
    description: row['description'] as string,
    avatarEmoji: row['avatar_emoji'] as string,
    avatarColor: row['avatar_color'] as string,
    model: row['model'] as string,
    systemPrompt: row['system_prompt'] as string,
    capabilities: (row['capabilities'] as string[]) ?? [],
    isActive: row['is_active'] as boolean,
    maxConcurrentTasks: row['max_concurrent_tasks'] as number,
    createdAt: (row['created_at'] as Date).toISOString(),
    currentTasks: (row['current_tasks'] as number | undefined) ?? 0,
    completedToday: (row['completed_today'] as number | undefined) ?? 0,
    totalTokensUsed: (row['total_tokens_used'] as number | undefined) ?? 0,
    avgDurationMs: (row['avg_duration_ms'] as number | undefined) ?? 0,
  };
}

// ── GET /api/queue — Vue globale de toutes les tâches ────────────────────────

router.get('/queue', async (req: Request, res: Response) => {
  const status = req.query['status'] as string | undefined;
  const whereClause = status ? `WHERE q.status = $1` : '';
  const params = status ? [status] : [];

  const result = await pool.query<Record<string, unknown>>(
    `SELECT q.*, a.name AS agent_name, a.avatar_emoji, a.type AS agent_type,
            i.key AS issue_key, i.title AS issue_title
       FROM ai_task_queue q
       JOIN ai_agents a ON a.id = q.agent_id
       JOIN issues i ON i.id = q.issue_id
       ${whereClause}
       ORDER BY q.priority ASC, q.created_at DESC
       LIMIT 50`,
    params
  );
  res.json(result.rows);
});

// ── GET /api/queue/stats — Métriques globales ────────────────────────────────

router.get('/queue/stats', async (_req: Request, res: Response) => {
  const stats = await queueService.getStats();
  res.json(stats);
});

// ── GET /api/agents — Liste tous les agents avec stats dynamiques ─────────────

router.get('/', async (_req: Request, res: Response) => {
  const result = await pool.query<Record<string, unknown>>(
    `SELECT
       a.*,
       COUNT(q.id) FILTER (WHERE q.status = 'running') AS current_tasks,
       COUNT(q.id) FILTER (WHERE q.status = 'completed' AND q.completed_at > NOW() - INTERVAL '1 day') AS completed_today,
       COALESCE(SUM(l.tokens_used), 0) AS total_tokens_used,
       COALESCE(
         AVG(EXTRACT(EPOCH FROM (q.completed_at - q.started_at)) * 1000)
           FILTER (WHERE q.completed_at IS NOT NULL), 0
       ) AS avg_duration_ms
     FROM ai_agents a
     LEFT JOIN ai_task_queue q ON q.agent_id = a.id
     LEFT JOIN ai_agent_logs l ON l.agent_id = a.id
     GROUP BY a.id
     ORDER BY a.type`
  );
  res.json(result.rows.map(rowToAgent));
});

// ── GET /api/agents/:id — Détail d'un agent ────────────────────────────────────

router.get('/:id',
  param('id').isString().notEmpty(),
  validate,
  async (req: Request, res: Response) => {
    const result = await pool.query<Record<string, unknown>>(
      `SELECT a.*,
         COUNT(q.id) FILTER (WHERE q.status = 'running') AS current_tasks,
         COUNT(q.id) FILTER (WHERE q.status = 'completed' AND q.completed_at > NOW() - INTERVAL '1 day') AS completed_today,
         COALESCE(SUM(l.tokens_used), 0) AS total_tokens_used,
         COALESCE(
           AVG(EXTRACT(EPOCH FROM (q.completed_at - q.started_at)) * 1000)
             FILTER (WHERE q.completed_at IS NOT NULL), 0
         ) AS avg_duration_ms
       FROM ai_agents a
       LEFT JOIN ai_task_queue q ON q.agent_id = a.id
       LEFT JOIN ai_agent_logs l ON l.agent_id = a.id
       WHERE a.id = $1
       GROUP BY a.id`,
      [req.params['id']]
    );
    if (!result.rows[0]) throw new AppError(404, 'Agent introuvable');
    res.json(rowToAgent(result.rows[0]));
  }
);

// ── POST /api/agents — Créer un agent ─────────────────────────────────────────

router.post('/',
  body('name').isString().notEmpty().isLength({ max: 100 }),
  body('slug').isString().notEmpty().isLength({ max: 50 }).matches(/^[a-z0-9-]+$/),
  body('type').isIn(['developer', 'qa', 'writer', 'researcher', 'architect']),
  body('description').optional().isString(),
  body('model').optional().isString(),
  body('systemPrompt').optional().isString(),
  body('capabilities').optional().isArray(),
  body('maxConcurrentTasks').optional().isInt({ min: 1, max: 20 }),
  validate,
  async (req: Request, res: Response) => {
    const { name, slug, type, description, avatarEmoji, avatarColor, model, systemPrompt, capabilities, maxConcurrentTasks } = req.body as Record<string, unknown>;

    const result = await pool.query<Record<string, unknown>>(
      `INSERT INTO ai_agents (name, slug, type, description, avatar_emoji, avatar_color, model, system_prompt, capabilities, max_concurrent_tasks)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        name, slug, type,
        description ?? '',
        avatarEmoji ?? '🤖',
        avatarColor ?? '#6554C0',
        model ?? 'gpt-4o',
        systemPrompt ?? '',
        JSON.stringify(capabilities ?? []),
        maxConcurrentTasks ?? 3,
      ]
    );
    res.status(201).json(rowToAgent(result.rows[0]!));
  }
);

// ── PUT /api/agents/:id — Modifier un agent ────────────────────────────────────

router.put('/:id',
  param('id').isString().notEmpty(),
  body('name').optional().isString().isLength({ max: 100 }),
  body('description').optional().isString(),
  body('model').optional().isString(),
  body('systemPrompt').optional().isString(),
  body('capabilities').optional().isArray(),
  body('isActive').optional().isBoolean(),
  body('maxConcurrentTasks').optional().isInt({ min: 1, max: 20 }),
  validate,
  async (req: Request, res: Response) => {
    const fields = req.body as Record<string, unknown>;
    const updates: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    const fieldMap: Record<string, string> = {
      name: 'name',
      description: 'description',
      avatarEmoji: 'avatar_emoji',
      avatarColor: 'avatar_color',
      model: 'model',
      systemPrompt: 'system_prompt',
      isActive: 'is_active',
      maxConcurrentTasks: 'max_concurrent_tasks',
    };

    for (const [key, col] of Object.entries(fieldMap)) {
      if (fields[key] !== undefined) {
        updates.push(`${col} = $${idx++}`);
        values.push(fields[key]);
      }
    }
    if (fields['capabilities'] !== undefined) {
      updates.push(`capabilities = $${idx++}`);
      values.push(JSON.stringify(fields['capabilities']));
    }

    if (updates.length === 0) {
      res.json({ message: 'Aucune modification' });
      return;
    }

    values.push(req.params['id']);
    const result = await pool.query<Record<string, unknown>>(
      `UPDATE ai_agents SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    if (!result.rows[0]) throw new AppError(404, 'Agent introuvable');
    res.json(rowToAgent(result.rows[0]));
  }
);

// ── DELETE /api/agents/:id — Désactiver un agent ──────────────────────────────

router.delete('/:id',
  param('id').isString().notEmpty(),
  validate,
  async (req: Request, res: Response) => {
    const result = await pool.query(
      `UPDATE ai_agents SET is_active = false WHERE id = $1 RETURNING id`,
      [req.params['id']]
    );
    if (result.rowCount === 0) throw new AppError(404, 'Agent introuvable');
    res.json({ message: 'Agent désactivé' });
  }
);

// ── GET /api/agents/:id/queue — Tâches de l'agent ────────────────────────────

router.get('/:id/queue',
  param('id').isString().notEmpty(),
  queryValidator('limit').optional().isInt({ min: 1, max: 100 }),
  validate,
  async (req: Request, res: Response) => {
    const limit = parseInt((req.query['limit'] as string | undefined) ?? '20', 10);
    const tasks = await queueService.getTasksByAgentId(req.params['id']!, limit);
    res.json(tasks);
  }
);

// ── GET /api/agents/:id/stats — Statistiques de l'agent ───────────────────────

router.get('/:id/stats',
  param('id').isString().notEmpty(),
  validate,
  async (req: Request, res: Response) => {
    const stats = await queueService.getStats();
    const agentStats = stats.agentStats.find(s => s.agentId === req.params['id']);
    if (!agentStats) {
      res.json({ agentId: req.params['id'], totalTasks: 0, completedTasks: 0, failedTasks: 0, pendingTasks: 0, runningTasks: 0, totalTokensUsed: 0, avgDurationMs: 0, successRate: 0, completedToday: 0 });
      return;
    }
    res.json(agentStats);
  }
);

// ── POST /api/issues/:id/assign-agent — Assigner un agent à une issue ────────

router.post('/issues/:id/assign-agent',
  param('id').isString().notEmpty(),
  body('agentId').isString().notEmpty(),
  body('instructions').optional().isString(),
  body('autoStart').optional().isBoolean(),
  body('autoConfluence').optional().isBoolean(),
  validate,
  async (req: Request, res: Response) => {
    const { agentId, instructions, autoStart } = req.body as {
      agentId: string;
      instructions?: string;
      autoStart?: boolean;
    };
    const issueId = req.params['id']!;

    // Vérifier que l'agent existe
    const agentResult = await pool.query(`SELECT id FROM ai_agents WHERE id = $1 AND is_active = true`, [agentId]);
    if (agentResult.rowCount === 0) throw new AppError(404, 'Agent introuvable ou inactif');

    // Mettre à jour l'issue
    const issueResult = await pool.query(
      `UPDATE issues
         SET assigned_agent_id = $1, ai_instructions = COALESCE($2, ai_instructions), updated_at = NOW()
       WHERE id = $3 AND deleted_at IS NULL
       RETURNING id`,
      [agentId, instructions ?? null, issueId]
    );
    if (issueResult.rowCount === 0) throw new AppError(404, 'Issue introuvable');

    let task: AITaskQueue | null = null;
    if (autoStart) {
      task = await orchestrator.dispatch(issueId, instructions);
    }

    res.json({ message: 'Agent assigné', issueId, agentId, task });
  }
);

// ── POST /api/issues/:id/start-agent — Démarrer l'exécution ──────────────────

router.post('/issues/:id/start-agent',
  param('id').isString().notEmpty(),
  body('instructions').optional().isString(),
  validate,
  async (req: Request, res: Response) => {
    const issueId = req.params['id']!;
    const { instructions } = req.body as { instructions?: string };
    const task = await orchestrator.dispatch(issueId, instructions);
    if (!task) throw new AppError(400, 'Impossible de démarrer l\'agent (aucun agent assigné ou issue introuvable)');
    res.json({ message: 'Agent démarré', task });
  }
);

// ── POST /api/issues/:id/pause-agent — Mettre en pause ───────────────────────

router.post('/issues/:id/pause-agent',
  param('id').isString().notEmpty(),
  validate,
  async (req: Request, res: Response) => {
    const task = await queueService.getTaskByIssueId(req.params['id']!);
    if (!task) throw new AppError(404, 'Aucune tâche active pour cette issue');
    await queueService.pause(task.id);
    res.json({ message: 'Agent mis en pause' });
  }
);

// ── POST /api/issues/:id/retry-agent — Relancer après échec ──────────────────

router.post('/issues/:id/retry-agent',
  param('id').isString().notEmpty(),
  validate,
  async (req: Request, res: Response) => {
    const task = await queueService.getTaskByIssueId(req.params['id']!);
    if (!task) throw new AppError(404, 'Aucune tâche pour cette issue');
    await queueService.resume(task.id);
    res.json({ message: 'Agent relancé' });
  }
);

// ── DELETE /api/issues/:id/cancel-agent — Annuler l'exécution ────────────────

router.delete('/issues/:id/cancel-agent',
  param('id').isString().notEmpty(),
  validate,
  async (req: Request, res: Response) => {
    const task = await queueService.getTaskByIssueId(req.params['id']!);
    if (!task) throw new AppError(404, 'Aucune tâche pour cette issue');
    await queueService.cancel(task.id);
    res.json({ message: 'Agent annulé' });
  }
);

// ── GET /api/issues/:id/agent-logs — Logs de l'agent ─────────────────────────

router.get('/issues/:id/agent-logs',
  param('id').isString().notEmpty(),
  queryValidator('limit').optional().isInt({ min: 1, max: 200 }),
  validate,
  async (req: Request, res: Response) => {
    const limit = parseInt((req.query['limit'] as string | undefined) ?? '100', 10);
    const result = await pool.query<Record<string, unknown>>(
      `SELECT l.* FROM ai_agent_logs l
         WHERE l.issue_id = $1
         ORDER BY l.created_at ASC
         LIMIT $2`,
      [req.params['id'], limit]
    );
    const logs: AgentLog[] = result.rows.map((row: Record<string, unknown>) => ({
      id: row['id'] as string,
      taskQueueId: row['task_queue_id'] as string,
      agentId: row['agent_id'] as string,
      issueId: row['issue_id'] as string,
      level: row['level'] as AgentLog['level'],
      step: row['step'] as string,
      message: row['message'] as string,
      progress: row['progress'] as number | undefined,
      artifacts: (row['artifacts'] as unknown[]) ?? [],
      tokensUsed: row['tokens_used'] as number,
      durationMs: row['duration_ms'] as number | undefined,
      createdAt: (row['created_at'] as Date).toISOString(),
    }));
    res.json(logs);
  }
);

// ── GET /api/issues/:id/artifacts — Artefacts produits ───────────────────────

router.get('/issues/:id/artifacts',
  param('id').isString().notEmpty(),
  validate,
  async (req: Request, res: Response) => {
    const result = await pool.query<Record<string, unknown>>(
      `SELECT * FROM ai_artifacts WHERE issue_id = $1 ORDER BY created_at ASC`,
      [req.params['id']]
    );
    const artifacts: AgentArtifact[] = result.rows.map((row: Record<string, unknown>) => ({
      id: row['id'] as string,
      taskQueueId: row['task_queue_id'] as string,
      issueId: row['issue_id'] as string,
      agentId: row['agent_id'] as string,
      type: row['type'] as AgentArtifact['type'],
      filename: row['filename'] as string,
      content: row['content'] as string,
      language: row['language'] as string | undefined,
      metadata: (row['metadata'] as Record<string, unknown>) ?? {},
      createdAt: (row['created_at'] as Date).toISOString(),
    }));
    res.json(artifacts);
  }
);

// ── GET /api/issues/:id/confluence-link — Lien Confluence ────────────────────

router.get('/issues/:id/confluence-link',
  param('id').isString().notEmpty(),
  validate,
  async (req: Request, res: Response) => {
    const result = await pool.query<Record<string, unknown>>(
      `SELECT icl.*, cp.title AS page_title, cp.space_key
         FROM issue_confluence_links icl
         JOIN confluence_pages cp ON cp.id = icl.page_id
        WHERE icl.issue_id = $1
        ORDER BY icl.created_at DESC
        LIMIT 1`,
      [req.params['id']]
    );
    if (!result.rows[0]) {
      res.json(null);
      return;
    }
    res.json(result.rows[0]);
  }
);

export default router;
