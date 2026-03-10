// ═══════════════════════════════════════════════════════════════════════════════
// Events issues — Listeners sur les événements d'issues
// Déclenchement automatique des agents quand une issue est créée/modifiée
// ═══════════════════════════════════════════════════════════════════════════════

import { EventEmitter } from 'events';
import logger from '../logger';
import { orchestrator } from '../agents/orchestrator';
import { pool } from '../db/pool';

// ── EventEmitter global partagé ───────────────────────────────────────────────

export const issueEventBus = new EventEmitter();
// Augmenter la limite pour éviter les warnings en dev
issueEventBus.setMaxListeners(20);

// ── Types d'événements ────────────────────────────────────────────────────────

export interface IssueCreatedEvent {
  issueId: string;
  assignedAgentId?: string;
  aiInstructions?: string;
  autoStart?: boolean;
}

export interface IssueUpdatedEvent {
  issueId: string;
  changedFields: string[];
  assignedAgentId?: string;
  aiInstructions?: string;
}

// ── Enregistrement des listeners ─────────────────────────────────────────────

export function registerIssueEventListeners(): void {

  // ── Listener : issue créée ─────────────────────────────────────────────────
  issueEventBus.on('issue:created', async (event: IssueCreatedEvent) => {
    try {
      // Ne démarrer l'agent que si un agent est assigné ET autoStart est activé
      if (!event.assignedAgentId || !event.autoStart) return;

      logger.info('Event issue:created → dispatch agent', {
        issueId: event.issueId,
        agentId: event.assignedAgentId,
      });

      await orchestrator.dispatch(event.issueId, event.aiInstructions);
    } catch (err) {
      logger.error('Erreur listener issue:created', { error: (err as Error).message });
    }
  });

  // ── Listener : issue mise à jour (re-assignation d'agent) ─────────────────
  issueEventBus.on('issue:updated', async (event: IssueUpdatedEvent) => {
    try {
      // Réagir uniquement si l'agent assigné a changé
      const agentFieldChanged = event.changedFields.includes('assigned_agent_id');
      if (!agentFieldChanged || !event.assignedAgentId) return;

      // Vérifier qu'il n'y a pas déjà une tâche en cours sur cette issue
      const existingTask = await pool.query(
        `SELECT id, status FROM ai_task_queue
           WHERE issue_id = $1 AND status IN ('pending', 'running')
           LIMIT 1`,
        [event.issueId]
      );

      if ((existingTask.rowCount ?? 0) > 0) {
        logger.info('Tâche déjà en cours sur cette issue, dispatch ignoré', {
          issueId: event.issueId,
        });
        return;
      }

      logger.info('Event issue:updated (agent changé) → dispatch', {
        issueId: event.issueId,
        agentId: event.assignedAgentId,
      });

      await orchestrator.dispatch(event.issueId, event.aiInstructions);
    } catch (err) {
      logger.error('Erreur listener issue:updated', { error: (err as Error).message });
    }
  });

  logger.info('Listeners d\'événements issues enregistrés');
}

// ── Helpers pour émettre les événements depuis les routes ────────────────────

export function emitIssueCreated(event: IssueCreatedEvent): void {
  issueEventBus.emit('issue:created', event);
}

export function emitIssueUpdated(event: IssueUpdatedEvent): void {
  issueEventBus.emit('issue:updated', event);
}
