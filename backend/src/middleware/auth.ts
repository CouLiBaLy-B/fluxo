import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { AppError } from './errorHandler';
import { pool } from '../db/pool';

/**
 * Payload stocké dans le JWT.
 */
export interface JwtPayload {
  userId: string;
  email: string;
  role: string;
}

/**
 * Étend l'interface Request d'Express pour ajouter l'utilisateur authentifié.
 */
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

/**
 * Extrait le token Bearer depuis l'en-tête Authorization.
 */
function extractToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.slice(7).trim();
}

/**
 * Middleware d'authentification obligatoire.
 * Vérifie le token JWT et injecte req.user.
 * Retourne 401 si le token est absent ou invalide.
 */
export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const token = extractToken(req);

  if (!token) {
    return next(new AppError(401, 'Authentification requise — token manquant'));
  }

  try {
    const payload = jwt.verify(token, config.jwt.secret) as JwtPayload;

    // Vérifie que l'utilisateur existe toujours en base (détecte les JWT périmés après reset DB)
    const { rowCount } = await pool.query(
      'SELECT 1 FROM users WHERE id = $1',
      [payload.userId]
    );
    if (!rowCount) {
      return next(new AppError(401, 'Session expirée — veuillez vous reconnecter'));
    }

    req.user = payload;
    next();
  } catch (err) {
    // On laisse le errorHandler gérer TokenExpiredError et JsonWebTokenError
    return next(err);
  }
}

/**
 * Middleware d'authentification optionnel.
 * Injecte req.user si un token valide est présent, mais ne bloque pas sinon.
 */
export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const token = extractToken(req);

  if (!token) {
    return next();
  }

  try {
    const payload = jwt.verify(token, config.jwt.secret) as JwtPayload;
    req.user = payload;
  } catch {
    // Token invalide → on ignore silencieusement pour les routes optionnelles
  }

  next();
}

/**
 * Middleware de restriction par rôle.
 * À utiliser après requireAuth.
 * @example router.delete('/:id', requireAuth, requireRole('admin'), handler)
 */
export function requireRole(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new AppError(401, 'Authentification requise'));
    }
    if (!roles.includes(req.user.role)) {
      return next(new AppError(403, 'Permissions insuffisantes pour cette action'));
    }
    next();
  };
}
