import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

import { config } from './config';
import logger from './logger';
import { checkDbConnection, closePool } from './db/pool';
import { notFound, errorHandler } from './middleware/errorHandler';
import apiRouter from './routes/index';

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
  });
});

// ── Routes API ────────────────────────────────────────────────────────────────
// Appliquer le rate limiter auth sur les routes d'authentification
app.use('/api/auth', authLimiter);
app.use('/api', apiRouter);

// ── Gestion des erreurs ───────────────────────────────────────────────────────
// Doit être montée APRÈS toutes les routes
app.use(notFound);
app.use(errorHandler);

// ── Démarrage du serveur ──────────────────────────────────────────────────────
async function start(): Promise<void> {
  try {
    // Vérifier la connexion à la base de données avant de démarrer
    await checkDbConnection();

    const server = app.listen(config.port, '0.0.0.0', () => {
      logger.info(`Serveur API démarré sur le port ${config.port}`, {
        env: config.nodeEnv,
        port: config.port,
      });
    });

    // ── Graceful shutdown ─────────────────────────────────────────────────────
    // Attend que les requêtes en cours se terminent avant de s'arrêter
    async function shutdown(signal: string): Promise<void> {
      logger.info(`Signal ${signal} reçu — arrêt gracieux en cours`);

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
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  logger.error('Exception non capturée', { error: err.message, stack: err.stack });
  process.exit(1);
});

start();

export default app;
