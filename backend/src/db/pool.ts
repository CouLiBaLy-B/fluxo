import { Pool } from 'pg';
import { config } from '../config';
import logger from '../logger';

// Pool de connexions PostgreSQL — singleton partagé dans toute l'application
export const pool = new Pool({
  connectionString: config.databaseUrl,
  max: config.db.max,
  idleTimeoutMillis: config.db.idleTimeoutMillis,
  connectionTimeoutMillis: config.db.connectionTimeoutMillis,
});

// Logguer les erreurs sur les clients inactifs (évite les silences dangereux)
pool.on('error', (err) => {
  logger.error('Erreur inattendue sur un client PostgreSQL inactif', { error: err.message });
});

/**
 * Vérifie la connexion à la base de données.
 * Appelé au démarrage du serveur.
 */
export async function checkDbConnection(): Promise<void> {
  const client = await pool.connect();
  try {
    const result = await client.query<{ version: string }>('SELECT version()');
    logger.info('Base de données connectée', { version: result.rows[0].version });
  } finally {
    client.release();
  }
}

/**
 * Ferme proprement le pool de connexions.
 * Appelé lors du graceful shutdown (SIGTERM).
 */
export async function closePool(): Promise<void> {
  await pool.end();
  logger.info('Pool PostgreSQL fermé proprement');
}
