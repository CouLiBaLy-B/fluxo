import { Request, Response, NextFunction } from 'express';
import logger from '../logger';
import { config } from '../config';

/**
 * Erreur applicative avec code HTTP.
 * Utilisée dans les routes pour retourner des erreurs contrôlées.
 */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'AppError';
    // Assure que instanceof AppError fonctionne avec TypeScript
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

/**
 * Middleware 404 — route introuvable.
 * À monter après toutes les routes.
 */
export function notFound(req: Request, res: Response): void {
  res.status(404).json({
    error: 'NOT_FOUND',
    message: `Route ${req.method} ${req.path} introuvable`,
  });
}

/**
 * Middleware de gestion globale des erreurs.
 * IMPORTANT : doit avoir 4 paramètres pour être reconnu par Express.
 *
 * Sanitise les messages d'erreur SQL/internes pour ne jamais exposer
 * les détails techniques en production.
 */
export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Erreurs applicatives contrôlées — on les retourne telles quelles
  if (err instanceof AppError) {
    logger.warn('Erreur applicative', {
      statusCode: err.statusCode,
      message: err.message,
    });
    res.status(err.statusCode).json({
      error: err.name,
      message: err.message,
      ...(err.details !== undefined ? { details: err.details } : {}),
    });
    return;
  }

  // Erreurs de validation Express (ValidationError de express-validator)
  if (err.name === 'ValidationError') {
    res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: err.message,
    });
    return;
  }

  // Erreur JWT expirée
  if (err.name === 'TokenExpiredError') {
    res.status(401).json({
      error: 'TOKEN_EXPIRED',
      message: 'Votre session a expiré, veuillez vous reconnecter',
    });
    return;
  }

  // Erreur JWT invalide
  if (err.name === 'JsonWebTokenError') {
    res.status(401).json({
      error: 'INVALID_TOKEN',
      message: 'Token d\'authentification invalide',
    });
    return;
  }

  // Erreurs inattendues — on logue avec le stack, mais on n'expose RIEN en production
  logger.error('Erreur non gérée', { error: err.message, stack: err.stack });

  // En développement : on peut exposer plus de détails pour déboguer
  const isDev = config.nodeEnv === 'development';
  res.status(500).json({
    error: 'INTERNAL_SERVER_ERROR',
    message: 'Une erreur interne est survenue',
    ...(isDev ? { debug: err.message } : {}),
  });
}
