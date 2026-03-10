// ═══════════════════════════════════════════════════════════════════════════════
// Orchestrateur — Chef d'orchestre principal des agents AI
// Écoute les events issues, sélectionne l'agent, gère l'exécution et les retry
// ═══════════════════════════════════════════════════════════════════════════════

import { pool } from '../db/pool';
import logger from '../logger';
import { queueService } from '../services/queue.service';
import { wsService } from '../services/websocket.service';
import { confluenceAutoService } from '../services/confluence-auto.service';
import { DeveloperAgent } from './developer-agent';
import { QAAgent } from './qa-agent';
import { WriterAgent } from './writer-agent';
import { ResearcherAgent } from './researcher-agent';
import { ArchitectAgent } from './architect-agent';
import type {
  AIAgent,
  AITaskQueue,
  AgentType,
  OrchestratorConfig,
} from '../types/agents.types';
import type { BaseAgent } from './base-agent';

// ── Map des agents disponibles ────────────────────────────────────────────────

const AGENT_INSTANCES: Record<AgentType, BaseAgent> = {
  developer: new DeveloperAgent(),
  qa: new QAAgent(),
  writer: new WriterAgent(),
  researcher: new ResearcherAgent(),
  architect: new ArchitectAgent(),
};

// Map type d'issue → type d'agent par défaut
const ISSUE_TYPE_TO_AGENT: Record<string, AgentType> = {
  story: 'developer',
  bug: 'developer',
  task: 'developer',
  epic: 'architect',
  subtask: 'developer',
};

// ── Classe principale ─────────────────────────────────────────────────────────

export class Orchestrator {
  private readonly config: OrchestratorConfig;

  constructor(config?: Partial<OrchestratorConfig>) {
    this.config = {
      maxConcurrentTasks: parseInt(process.env['AI_MAX_CONCURRENT_TASKS'] ?? '10', 10),
      taskTimeoutMs: parseInt(process.env['AI_TASK_TIMEOUT_MS'] ?? '300000', 10),
      retryDelayMs: parseInt(process.env['AI_RETRY_DELAY_MS'] ?? '5000', 10),
      autoSelectAgent: process.env['AI_AUTO_SELECT_AGENT'] === 'true',
      ...config,
    };
  }

  // ── Démarrage de l'orchestrateur ──────────────────────────────────────────

  start(): void {
    // Enregistrer l'exécuteur dans la queue
    queueService.start(task => this.executeTask(task));
    wsService.startHeartbeat();
    logger.info('Orchestrateur démarré', { config: this.config });
  }

  stop(): void {
    queueService.stop();
    logger.info('Orchestrateur arrêté');
  }

  // ── Dispatch : appelé quand une issue est créée/modifiée ──────────────────

  async dispatch(issueId: string, instructions?: string): Promise<AITaskQueue | null> {
    // Récupérer les données de l'issue avec l'agent assigné
    const issueResult = await pool.query<{
      id: string;
      type: string;
      assigned_agent_id: string | null;
      ai_instructions: string | null;
      priority: string;
    }>(
      `SELECT id, type, assigned_agent_id, ai_instructions, priority
         FROM issues WHERE id = $1 AND deleted_at IS NULL`,
      [issueId]
    );

    const issue = issueResult.rows[0];
    if (!issue) {
      logger.warn('Dispatch: issue introuvable', { issueId });
      return null;
    }

    // Déterminer l'agent à utiliser
    let agentId = issue.assigned_agent_id;
    if (!agentId) {
      agentId = await this.selectAgentForIssue(issue.type);
    }
    if (!agentId) {
      logger.warn('Dispatch: aucun agent disponible pour l\'issue', { issueId, type: issue.type });
      return null;
    }

    const effectiveInstructions = instructions ?? issue.ai_instructions ?? '';
    const priority = this.priorityToPriority(issue.priority);

    // Créer la tâche dans la queue
    const task = await queueService.enqueue(issueId, agentId, effectiveInstructions, priority);

    // Notifier le frontend
    const agentData = await this.getAgentById(agentId);
    if (agentData) {
      wsService.broadcast({
        type: 'agent:started',
        issueId,
        agentId,
        agentName: agentData.name,
        taskQueueId: task.id,
      });
    }

    logger.info('Tâche dispatchée', { issueId, agentId, taskId: task.id, priority });
    return task;
  }

  // ── Exécution d'une tâche (appelé par QueueService) ───────────────────────

  async executeTask(task: AITaskQueue): Promise<void> {
    const agentRecord = await this.getAgentById(task.agentId);
    if (!agentRecord) {
      await queueService.fail(task.id, `Agent ${task.agentId} introuvable`, false);
      return;
    }

    const agentInstance = AGENT_INSTANCES[agentRecord.type as AgentType];
    if (!agentInstance) {
      await queueService.fail(task.id, `Aucune implémentation pour l'agent type ${agentRecord.type}`, false);
      return;
    }

    // Timeout de sécurité
    const timeoutHandle = setTimeout(async () => {
      logger.error('Timeout de la tâche', { taskId: task.id });
      await this.handleFailure(task.id, new Error('Timeout dépassé'));
    }, this.config.taskTimeoutMs);

    try {
      logger.info(`Exécution de la tâche [${agentRecord.type}]`, {
        taskId: task.id,
        issueId: task.issueId,
      });

      const result = await agentInstance.execute(task);

      clearTimeout(timeoutHandle);

      if (result.success) {
        await queueService.complete(task.id);

        // Générer la page Confluence si configuré
        const autoConfluence = process.env['AI_AUTO_CREATE_CONFLUENCE'] !== 'false';
        if (autoConfluence) {
          await this.triggerConfluenceGeneration(task, result.summary);
        }

        wsService.broadcast({
          type: 'agent:completed',
          issueId: task.issueId,
          taskQueueId: task.id,
          summary: result.summary,
        });

        // Mise à jour de l'issue avec le résumé AI
        await pool.query(
          `UPDATE issues SET ai_summary = $1, ai_progress = 100, updated_at = NOW() WHERE id = $2`,
          [result.summary, task.issueId]
        );

      } else {
        throw new Error(result.error ?? 'Exécution échouée sans message d\'erreur');
      }
    } catch (err) {
      clearTimeout(timeoutHandle);
      await this.handleFailure(task.id, err as Error);
    }
  }

  // ── Gestion des échecs ────────────────────────────────────────────────────

  async handleFailure(taskId: string, error: Error): Promise<void> {
    const task = await queueService.getTaskById(taskId);
    if (!task) return;

    logger.error('Échec de la tâche agent', {
      taskId,
      error: error.message,
      retry: task.retryCount,
      maxRetries: task.maxRetries,
    });

    const canRetry = task.retryCount < task.maxRetries;
    await queueService.fail(taskId, error.message, canRetry);

    wsService.broadcast({
      type: 'agent:failed',
      issueId: task.issueId,
      taskQueueId: taskId,
      error: error.message,
      retryIn: canRetry ? this.config.retryDelayMs : undefined,
    });
  }

  // ── Sélection automatique de l'agent selon le type d'issue ───────────────

  private async selectAgentForIssue(issueType: string): Promise<string | null> {
    const agentType: AgentType = ISSUE_TYPE_TO_AGENT[issueType] ?? 'developer';

    const result = await pool.query<{ id: string }>(
      `SELECT id FROM ai_agents WHERE type = $1 AND is_active = true LIMIT 1`,
      [agentType]
    );
    return result.rows[0]?.id ?? null;
  }

  // ── Génération Confluence après completion ────────────────────────────────

  private async triggerConfluenceGeneration(task: AITaskQueue, summary: string): Promise<void> {
    try {
      const pageId = await confluenceAutoService.generatePage(task, summary);
      if (pageId) {
        wsService.broadcast({
          type: 'agent:completed',
          issueId: task.issueId,
          taskQueueId: task.id,
          summary,
          confluencePageId: pageId,
        });
        logger.info('Page Confluence générée', { pageId, issueId: task.issueId });
      }
    } catch (err) {
      // La génération Confluence ne fait pas échouer la tâche principale
      logger.warn('Génération Confluence échouée', { error: (err as Error).message });
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private async getAgentById(agentId: string): Promise<AIAgent | null> {
    const result = await pool.query<Record<string, unknown>>(
      `SELECT * FROM ai_agents WHERE id = $1`,
      [agentId]
    );
    if (!result.rows[0]) return null;
    return this.rowToAgent(result.rows[0]);
  }

  private priorityToPriority(issuePriority: string): number {
    const map: Record<string, number> = {
      highest: 1,
      high: 2,
      medium: 5,
      low: 7,
      lowest: 9,
    };
    return map[issuePriority] ?? 5;
  }

  private rowToAgent(row: Record<string, unknown>): AIAgent {
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
    };
  }
}

// Singleton partagé
export const orchestrator = new Orchestrator();
