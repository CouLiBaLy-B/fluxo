// ═══════════════════════════════════════════════════════════════════════════════
// Service WebSocket — Streaming temps réel des événements agents vers le frontend
// Utilise la librairie 'ws' attachée au serveur HTTP Express (même port 4000)
// ═══════════════════════════════════════════════════════════════════════════════

import { WebSocketServer, WebSocket, type RawData } from 'ws';
import type { IncomingMessage } from 'http';
import type { Server } from 'http';
import type { AgentWSEvent } from '../types/agents.types';
import logger from '../logger';

// ── Structure d'un client connecté ───────────────────────────────────────────

interface WSClient {
  ws: WebSocket;
  issueId: string | null;  // null = abonné à tous les événements
  connectedAt: Date;
}

// ── Classe principale ─────────────────────────────────────────────────────────

export class WebSocketService {
  private wss: WebSocketServer | null = null;
  private readonly clients = new Map<WebSocket, WSClient>();
  // Buffer des derniers events par issueId (pour les reconnexions)
  private readonly eventBuffer = new Map<string, AgentWSEvent[]>();
  private static readonly BUFFER_SIZE = 50;

  // ── Initialisation sur un serveur HTTP existant ───────────────────────────

  attach(server: Server): void {
    this.wss = new WebSocketServer({
      server,
      path: '/ws',
      // Vérification d'origine basique (si CORS_ORIGINS est défini)
      verifyClient: ({ origin }: { origin: string }) => {
        const allowedOrigins = (process.env['CORS_ORIGINS'] ?? '').split(',').map(s => s.trim()).filter(Boolean);
        if (allowedOrigins.length === 0 || process.env['NODE_ENV'] !== 'production') return true;
        return allowedOrigins.some(o => origin.startsWith(o));
      },
    });

    this.wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
      this.handleConnection(ws, req);
    });

    this.wss.on('error', (err: Error) => {
      logger.error('WebSocketServer erreur', { error: err.message });
    });

    logger.info('WebSocket server attaché sur /ws');
  }

  // ── Gestion d'une nouvelle connexion ─────────────────────────────────────

  private handleConnection(ws: WebSocket, req: IncomingMessage): void {
    // Extraire l'issueId du querystring : /ws?issueId=xxx
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const issueId = url.searchParams.get('issueId') ?? null;

    const client: WSClient = {
      ws,
      issueId,
      connectedAt: new Date(),
    };
    this.clients.set(ws, client);

    logger.debug('WebSocket connexion établie', {
      issueId,
      totalClients: this.clients.size,
    });

    // Envoyer le buffer d'events récents si le client se reconnecte sur une issue
    if (issueId) {
      const buffered = this.eventBuffer.get(issueId) ?? [];
      if (buffered.length > 0) {
        this.send(ws, { type: 'buffer', events: buffered } as unknown as AgentWSEvent);
      }
    }

    // Ping/pong pour détecter les connexions mortes
    (ws as WebSocket & { isAlive: boolean }).isAlive = true;
    ws.on('pong', () => {
      (ws as WebSocket & { isAlive: boolean }).isAlive = true;
    });

    ws.on('message', (data: RawData) => {
      void this.handleMessage(ws, data);
    });

    ws.on('close', () => {
      this.clients.delete(ws);
      logger.debug('WebSocket connexion fermée', { issueId, totalClients: this.clients.size });
    });

    ws.on('error', (err: Error) => {
      logger.warn('WebSocket client erreur', { issueId, error: err.message });
      this.clients.delete(ws);
    });
  }

  // ── Gestion des messages entrants (souscriptions) ─────────────────────────

  private async handleMessage(ws: WebSocket, data: RawData): Promise<void> {
    try {
      const message = JSON.parse(data.toString()) as { type?: string; issueId?: string };
      const client = this.clients.get(ws);
      if (!client) return;

      if (message.type === 'subscribe' && message.issueId) {
        client.issueId = message.issueId;
        logger.debug('Client abonné à issue', { issueId: message.issueId });
        // Envoyer le buffer d'events récents
        const buffered = this.eventBuffer.get(message.issueId) ?? [];
        if (buffered.length > 0) {
          this.send(ws, { type: 'buffer', events: buffered } as unknown as AgentWSEvent);
        }
      }

      if (message.type === 'unsubscribe') {
        client.issueId = null;
      }
    } catch {
      // Message non-JSON ignoré
    }
  }

  // ── Émission d'un événement vers tous les clients abonnés ─────────────────

  broadcast(event: AgentWSEvent): void {
    const issueId = 'issueId' in event ? event.issueId : null;
    const payload = JSON.stringify(event);

    // Mettre en buffer pour les reconnexions
    if (issueId) {
      const buffer = this.eventBuffer.get(issueId) ?? [];
      buffer.push(event);
      // Garder seulement les N derniers events
      if (buffer.length > WebSocketService.BUFFER_SIZE) {
        buffer.splice(0, buffer.length - WebSocketService.BUFFER_SIZE);
      }
      this.eventBuffer.set(issueId, buffer);
    }

    // Envoyer à tous les clients abonnés à cette issue ou à tous les events
    let sentCount = 0;
    for (const [ws, client] of this.clients.entries()) {
      if (ws.readyState !== WebSocket.OPEN) continue;
      // Client abonné à cette issue spécifique, ou abonné à tout (issueId null)
      if (client.issueId === null || client.issueId === issueId) {
        ws.send(payload, err => {
          if (err) {
            logger.warn('Erreur envoi WebSocket', { error: err.message });
            this.clients.delete(ws);
          }
        });
        sentCount++;
      }
    }

    if (sentCount > 0) {
      logger.debug('Event WebSocket broadcasté', { type: event.type, issueId, sentCount });
    }
  }

  // ── Envoi à un client spécifique ─────────────────────────────────────────

  private send(ws: WebSocket, event: AgentWSEvent): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(event));
    }
  }

  // ── Nettoyage du buffer d'une issue (après completion) ───────────────────

  clearBuffer(issueId: string): void {
    this.eventBuffer.delete(issueId);
  }

  // ── Heartbeat (ping toutes les 30s pour détecter les connexions mortes) ───

  startHeartbeat(): void {
    const interval = setInterval(() => {
      for (const [ws] of this.clients.entries()) {
        const extWs = ws as WebSocket & { isAlive: boolean };
        if (!extWs.isAlive) {
          this.clients.delete(ws);
          ws.terminate();
          continue;
        }
        extWs.isAlive = false;
        ws.ping();
      }
    }, 30_000);

    // Nettoyer le heartbeat si le serveur est détruit
    this.wss?.on('close', () => clearInterval(interval));
  }

  // ── Métriques ─────────────────────────────────────────────────────────────

  getConnectedCount(): number {
    return this.clients.size;
  }

  isReady(): boolean {
    return this.wss !== null;
  }

  // ── Arrêt propre ─────────────────────────────────────────────────────────

  close(): void {
    this.wss?.close(() => {
      logger.info('WebSocket server fermé');
    });
  }
}

// Singleton partagé
export const wsService = new WebSocketService();
