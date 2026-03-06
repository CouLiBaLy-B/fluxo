import { Router, Request, Response, NextFunction } from 'express';
import { body, param } from 'express-validator';
import { pool } from '../db/pool';
import { AppError } from '../middleware/errorHandler';
import { requireAuth, requireRole } from '../middleware/auth';
import { validate } from '../middleware/validate';
import logger from '../logger';

const router = Router();

// Toutes les routes users nécessitent une authentification
router.use(requireAuth);

// ── Types ──────────────────────────────────────────────────────────────────────

interface UserRow {
  id: string;
  name: string;
  avatar: string;
  color: string;
  email: string;
  role: string;
  created_at: string;
}

function formatUser(row: UserRow) {
  return {
    id: row.id,
    name: row.name,
    avatar: row.avatar,
    color: row.color,
    email: row.email,
    role: row.role,
    createdAt: row.created_at,
  };
}

// ── GET /api/users ─────────────────────────────────────────────────────────────
/** Liste tous les utilisateurs (sans les mots de passe). */
router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const { rows } = await pool.query<UserRow>(
      'SELECT id, name, avatar, color, email, role, created_at FROM users ORDER BY name ASC'
    );
    res.json(rows.map(formatUser));
  } catch (err) {
    return next(err);
  }
});

// ── GET /api/users/:id ─────────────────────────────────────────────────────────
/** Récupère un utilisateur par son ID. */
router.get(
  '/:id',
  [param('id').notEmpty().withMessage('ID invalide')],
  validate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { rows } = await pool.query<UserRow>(
        'SELECT id, name, avatar, color, email, role, created_at FROM users WHERE id = $1',
        [req.params.id]
      );
      if (!rows[0]) {
        throw new AppError(404, 'Utilisateur introuvable');
      }
      res.json(formatUser(rows[0]));
    } catch (err) {
      return next(err);
    }
  }
);

// ── PUT /api/users/:id ─────────────────────────────────────────────────────────
/**
 * Met à jour un utilisateur.
 * Un utilisateur ne peut modifier que son propre profil, sauf les admins.
 */
router.put(
  '/:id',
  [
    param('id').notEmpty(),
    body('name')
      .optional()
      .trim()
      .notEmpty().withMessage('Le nom ne peut pas être vide')
      .isLength({ max: 100 }),
    body('color')
      .optional()
      .matches(/^#[0-9A-Fa-f]{6}$/).withMessage('La couleur doit être au format #RRGGBB'),
  ],
  validate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      // Seul l'utilisateur lui-même ou un admin peut modifier
      if (req.user!.userId !== id && req.user!.role !== 'admin') {
        throw new AppError(403, 'Vous ne pouvez modifier que votre propre profil');
      }

      // Construire la mise à jour dynamiquement
      const updates: string[] = [];
      const values: unknown[] = [];
      let idx = 1;

      if (req.body.name !== undefined) {
        updates.push(`name = $${idx++}`);
        values.push(req.body.name);
        // Régénérer les initiales de l'avatar
        const avatar = (req.body.name as string)
          .split(' ')
          .slice(0, 2)
          .map((p: string) => p[0]?.toUpperCase() ?? '')
          .join('');
        updates.push(`avatar = $${idx++}`);
        values.push(avatar);
      }

      if (req.body.color !== undefined) {
        updates.push(`color = $${idx++}`);
        values.push(req.body.color);
      }

      if (updates.length === 0) {
        throw new AppError(400, 'Aucune donnée à mettre à jour');
      }

      values.push(id);
      const { rows } = await pool.query<UserRow>(
        `UPDATE users SET ${updates.join(', ')} WHERE id = $${idx}
         RETURNING id, name, avatar, color, email, role, created_at`,
        values
      );

      if (!rows[0]) {
        throw new AppError(404, 'Utilisateur introuvable');
      }

      logger.info('Utilisateur mis à jour', { userId: id });
      res.json(formatUser(rows[0]));
    } catch (err) {
      return next(err);
    }
  }
);

// ── DELETE /api/users/:id ──────────────────────────────────────────────────────
/** Supprime un utilisateur (admin uniquement). */
router.delete(
  '/:id',
  requireRole('admin'),
  [param('id').notEmpty()],
  validate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { rowCount } = await pool.query(
        'DELETE FROM users WHERE id = $1',
        [req.params.id]
      );
      if (!rowCount) {
        throw new AppError(404, 'Utilisateur introuvable');
      }
      logger.info('Utilisateur supprimé', { userId: req.params.id });
      res.status(204).send();
    } catch (err) {
      return next(err);
    }
  }
);

export default router;
