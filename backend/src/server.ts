import 'dotenv/config';
import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import http from 'http';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';

import { config } from './config';
import logger from './logger';
import { pool, checkDbConnection, closePool } from './db/pool';
import { notFound, errorHandler } from './middleware/errorHandler';
import apiRouter from './routes/index';
import { wsService } from './services/websocket.service';
import { orchestrator } from './agents/orchestrator';
import { registerIssueEventListeners } from './events/issue.events';
import { llmService } from './services/llm.service';

const app = express();

// Derrière Nginx (reverse proxy), on fait confiance au premier proxy
app.set('trust proxy', 1);

// ── Middleware de sécurité ────────────────────────────────────────────────────

// Helmet avec CSP adapté à l'API (pas de rendu HTML)
app.use(helmet({
  contentSecurityPolicy: false, // L'API ne sert pas de HTML
  crossOriginEmbedderPolicy: false,
}));

// Compression des réponses
app.use(compression());

// CORS — origines configurées via variable d'environnement
app.use(cors({
  origin: config.cors.origins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Rate limiting global — protection contre les attaques par force brute
const globalLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  standardHeaders: true,  // Retourne les headers RateLimit-*
  legacyHeaders: false,
  message: {
    error: 'TOO_MANY_REQUESTS',
    message: 'Trop de requêtes, veuillez réessayer plus tard',
  },
});
app.use(globalLimiter);

// Rate limiting plus strict sur les endpoints d'authentification
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,                   // 20 tentatives max par IP
  message: {
    error: 'TOO_MANY_AUTH_ATTEMPTS',
    message: 'Trop de tentatives d\'authentification, veuillez réessayer dans 15 minutes',
  },
});

// Parsing des corps de requête
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Logging HTTP
app.use(morgan(config.nodeEnv === 'production' ? 'combined' : 'dev'));

// ── Health check ──────────────────────────────────────────────────────────────
/**
 * Endpoint de vérification de santé.
 * Utilisé par Docker pour les healthchecks.
 */
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    env: config.nodeEnv,
    uptime: Math.floor(process.uptime()),
    ws: { connected: wsService.getConnectedCount() },
  });
});

// ── Routes API ────────────────────────────────────────────────────────────────
// Appliquer une limite de corps stricte sur les routes d'authentification (évite le DoS bcrypt)
app.use('/api/auth', express.json({ limit: '4kb' }));
// Appliquer le rate limiter auth sur les routes d'authentification
app.use('/api/auth', authLimiter);
app.use('/api', apiRouter);

// ── Gestion des erreurs ───────────────────────────────────────────────────────
// Doit être montée APRÈS toutes les routes
app.use(notFound);
app.use(errorHandler);

// ── Bootstrap admin ───────────────────────────────────────────────────────────
/**
 * Crée l'utilisateur admin depuis les variables d'environnement si la base est vide.
 * Idempotent : sans effet si des utilisateurs existent déjà.
 */
async function bootstrapAdmin(): Promise<void> {
  const { rows } = await pool.query<{ count: string }>('SELECT COUNT(*) FROM users');
  if (parseInt(rows[0].count, 10) > 0) return;

  const adminEmail    = process.env['ADMIN_EMAIL']    ?? 'admin@example.com';
  const adminUsername = process.env['ADMIN_USERNAME'] ?? 'Admin';
  const adminPassword = process.env['ADMIN_PASSWORD'] ?? 'admin123456';
  const adminAvatar   = adminUsername.trim().split(' ')
    .map((n: string) => n[0]?.toUpperCase() ?? '').join('').slice(0, 2);
  const adminHash = await bcrypt.hash(adminPassword, config.bcryptRounds);

  await pool.query(
    `INSERT INTO users (id, name, avatar, color, email, password_hash, role)
     VALUES ($1,$2,$3,$4,$5,$6,'admin') ON CONFLICT (email) DO NOTHING`,
    [randomUUID(), adminUsername.trim(), adminAvatar, '#0052CC', adminEmail, adminHash]
  );
  logger.info('Admin bootstrapped depuis les variables d\'environnement');
}

// ── Démarrage du serveur ──────────────────────────────────────────────────────
async function start(): Promise<void> {
  try {
    // Vérifier la connexion à la base de données avant de démarrer
    await checkDbConnection();

    // Créer l'admin si la base est vide (premier démarrage)
    await bootstrapAdmin();

    // Charger la config LLM depuis la DB (prioritaire sur env vars)
    await llmService.loadFromDB();

    // Créer le serveur HTTP (nécessaire pour partager le port avec WebSocket)
    const server = http.createServer(app);

    // Attacher le serveur WebSocket sur le même port (/ws)
    wsService.attach(server);

    // Enregistrer les listeners d'événements issues (auto-dispatch agents)
    registerIssueEventListeners();

    // Démarrer l'orchestrateur (polling queue + heartbeat WS)
    orchestrator.start();

    server.listen(config.port, '0.0.0.0', () => {
      logger.info(`Serveur API + WebSocket démarré sur le port ${config.port}`, {
        env: config.nodeEnv,
        port: config.port,
        ws: 'ws://0.0.0.0:' + config.port + '/ws',
        llmProvider: process.env['LLM_PROVIDER'] ?? 'mock',
      });
    });

    // ── Graceful shutdown ─────────────────────────────────────────────────────
    // Attend que les requêtes en cours se terminent avant de s'arrêter
    async function shutdown(signal: string): Promise<void> {
      logger.info(`Signal ${signal} reçu — arrêt gracieux en cours`);

      orchestrator.stop();
      wsService.close();

      server.close(async () => {
        logger.info('Serveur HTTP fermé');
        await closePool();
        logger.info('Arrêt complet');
        process.exit(0);
      });

      // Forcer l'arrêt après 10 secondes si le shutdown prend trop de temps
      setTimeout(() => {
        logger.error('Arrêt forcé après timeout');
        process.exit(1);
      }, 10_000);
    }

    process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
    process.on('SIGINT',  () => { void shutdown('SIGINT'); });
  } catch (err) {
    logger.error('Impossible de démarrer le serveur', {
      error: err instanceof Error ? err.message : String(err),
    });
    process.exit(1);
  }
}

// Capturer les erreurs non gérées pour éviter les crashes silencieux
process.on('unhandledRejection', (reason) => {
  logger.error('Promesse rejetée non gérée', { reason: String(reason) });
});

process.on('uncaughtException', (err) => {
  logger.error('Exception non capturée', { error: err.message, stack: err.stack });
  process.exit(1);
});

start();

export default app;
