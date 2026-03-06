import dotenv from 'dotenv';
dotenv.config();

/**
 * Lit une variable d'environnement obligatoire.
 * Lance une erreur au démarrage si elle est absente.
 */
function required(key: string): string {
  const val = process.env[key];
  if (!val || val.trim() === '') {
    throw new Error(`Variable d'environnement manquante : ${key}`);
  }
  return val.trim();
}

/**
 * Lit une variable d'environnement optionnelle avec valeur par défaut.
 */
function optional(key: string, defaultValue: string): string {
  return (process.env[key] ?? defaultValue).trim();
}

export const config = {
  port: parseInt(optional('PORT', '4000'), 10),
  nodeEnv: optional('NODE_ENV', 'development'),

  // Connexion PostgreSQL via URL complète (fournie par docker-compose)
  databaseUrl: required('DATABASE_URL'),
  db: {
    max: 20,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  },

  // JWT — secret obligatoire, pas de valeur par défaut en production
  jwt: {
    secret: required('JWT_SECRET'),
    expiresIn: optional('JWT_EXPIRES_IN', '24h'),
  },

  // Bcrypt
  bcryptRounds: parseInt(optional('BCRYPT_ROUNDS', '12'), 10),

  // CORS — origines autorisées (séparées par virgule)
  cors: {
    origins: optional('CORS_ORIGINS', 'http://localhost,http://localhost:80')
      .split(',')
      .map((o) => o.trim())
      .filter((o) => o.length > 0),
  },

  // Rate limiting
  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 200,                  // 200 requêtes par fenêtre
  },
};
