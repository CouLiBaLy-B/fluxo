import { Router, Request, Response, NextFunction } from 'express';
import { body } from 'express-validator';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../db/pool';
import { config } from '../config';
import { AppError } from '../middleware/errorHandler';
import { validate } from '../middleware/validate';
import { requireAuth, requireRole } from '../middleware/auth';
import logger from '../logger';

const router = Router();

// ── Types ──────────────────────────────────────────────────────────────────────

interface UserRow {
  id: string;
  name: string;
  avatar: string;
  color: string;
  email: string;
  password_hash: string;
  role: string;
  failed_login_attempts: number;
  locked_until: string | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Formate un utilisateur pour la réponse (sans le hash du mot de passe) */
function formatUser(row: UserRow) {
  return {
    id: row.id,
    name: row.name,
    avatar: row.avatar,
    color: row.color,
    email: row.email,
    role: row.role,
  };
}

/** Génère un JWT signé pour un utilisateur */
function signToken(user: UserRow): string {
  return jwt.sign(
    { userId: user.id, email: user.email, role: user.role },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn }
  );
}

// Validation réutilisable pour le mot de passe
const passwordValidation = body('password')
  .notEmpty().withMessage('Le mot de passe est obligatoire')
  .isLength({ min: 8, max: 128 }).withMessage('Le mot de passe doit faire entre 8 et 128 caractères');

// ── POST /api/auth/register ────────────────────────────────────────────────────
/**
 * Création d'un nouveau compte utilisateur — réservé aux admins.
 * L'admin crée le compte, l'utilisateur se connecte ensuite via /login.
 */
router.post(
  '/register',
  requireAuth,
  requireRole('admin'),
  [
    body('name')
      .trim()
      .notEmpty().withMessage('Le nom est obligatoire')
      .isLength({ max: 100 }).withMessage('Le nom ne peut pas dépasser 100 caractères'),
    body('email')
      .trim()
      .notEmpty().withMessage('L\'email est obligatoire')
      .isEmail().withMessage('L\'email n\'est pas valide')
      .normalizeEmail(),
    passwordValidation,
  ],
  validate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, email, password } = req.body as {
        name: string;
        email: string;
        password: string;
      };

      const passwordHash = await bcrypt.hash(password, config.bcryptRounds);

      const avatar = name
        .split(' ')
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? '')
        .join('');

      const { rows } = await pool.query<UserRow>(
        `INSERT INTO users (name, avatar, color, email, password_hash, role)
         VALUES ($1, $2, $3, $4, $5, 'member')
         ON CONFLICT (email) DO NOTHING
         RETURNING id, name, avatar, color, email, password_hash, role`,
        [name.trim(), avatar, '#0052CC', email, passwordHash]
      );

      if (!rows[0]) {
        return next(new AppError(409, 'Un compte avec cet email existe déjà'));
      }

      logger.info('Nouvel utilisateur créé par admin', { userId: rows[0].id, createdBy: req.user!.userId });

      res.status(201).json({ user: formatUser(rows[0]) });
    } catch (err) {
      return next(err);
    }
  }
);

// ── POST /api/auth/login ───────────────────────────────────────────────────────
/**
 * Authentification avec email + mot de passe.
 * Verrouille le compte après 10 échecs consécutifs (15 minutes).
 * Retourne un JWT en cas de succès.
 */
router.post(
  '/login',
  [
    body('email')
      .trim()
      .notEmpty().withMessage('L\'email est obligatoire')
      .isEmail().withMessage('L\'email n\'est pas valide')
      .normalizeEmail(),
    body('password')
      .notEmpty().withMessage('Le mot de passe est obligatoire'),
  ],
  validate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, password } = req.body as { email: string; password: string };

      // Chercher l'utilisateur (inclut les champs de verrouillage)
      const result = await pool.query<UserRow>(
        `SELECT id, name, avatar, color, email, password_hash, role,
                failed_login_attempts, locked_until
         FROM users WHERE email = $1`,
        [email]
      );

      const user = result.rows[0];

      // Vérifier le verrouillage AVANT bcrypt (évite de révéler si l'email existe)
      if (user && user.locked_until && new Date(user.locked_until) > new Date()) {
        throw new AppError(429, 'Compte temporairement verrouillé. Réessayez plus tard.');
      }

      const isMatch = user ? await bcrypt.compare(password, user.password_hash) : false;

      if (!isMatch) {
        // Incrémenter les tentatives échouées si l'utilisateur existe
        if (user) {
          const newAttempts = (user.failed_login_attempts ?? 0) + 1;
          const lockUntil = newAttempts >= 10
            ? new Date(Date.now() + 15 * 60 * 1000).toISOString()
            : null;
          await pool.query(
            'UPDATE users SET failed_login_attempts = $1, locked_until = $2 WHERE id = $3',
            [newAttempts, lockUntil, user.id]
          );
        }
        // Même message si l'email n'existe pas OU si le mot de passe est incorrect
        throw new AppError(401, 'Email ou mot de passe incorrect');
      }

      // Succès : réinitialiser les tentatives échouées
      await pool.query(
        'UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = $1',
        [user.id]
      );

      const token = signToken(user);

      logger.info('Connexion réussie', { userId: user.id });

      res.json({
        token,
        user: formatUser(user),
      });
    } catch (err) {
      return next(err);
    }
  }
);

// ── GET /api/auth/me ───────────────────────────────────────────────────────────
/**
 * Retourne le profil de l'utilisateur actuellement authentifié.
 */
router.get(
  '/me',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await pool.query<UserRow>(
        `SELECT id, name, avatar, color, email, password_hash, role
         FROM users WHERE id = $1`,
        [req.user!.userId]
      );

      const user = result.rows[0];
      if (!user) {
        throw new AppError(404, 'Utilisateur introuvable');
      }

      res.json({ user: formatUser(user) });
    } catch (err) {
      return next(err);
    }
  }
);

// ── POST /api/auth/change-password ─────────────────────────────────────────────
/**
 * Permet à l'utilisateur connecté de changer son mot de passe.
 * Vérifie l'ancien mot de passe avant d'appliquer le nouveau.
 */
router.post(
  '/change-password',
  requireAuth,
  [
    body('currentPassword')
      .notEmpty().withMessage('Le mot de passe actuel est obligatoire'),
    body('newPassword')
      .notEmpty().withMessage('Le nouveau mot de passe est obligatoire')
      .isLength({ min: 8, max: 128 }).withMessage('Le nouveau mot de passe doit faire entre 8 et 128 caractères'),
  ],
  validate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { currentPassword, newPassword } = req.body as {
        currentPassword: string;
        newPassword: string;
      };

      // Récupérer le hash actuel
      const result = await pool.query<{ id: string; password_hash: string }>(
        'SELECT id, password_hash FROM users WHERE id = $1',
        [req.user!.userId]
      );
      const user = result.rows[0];
      if (!user) {
        throw new AppError(404, 'Utilisateur introuvable');
      }

      // Vérifier l'ancien mot de passe
      const isMatch = await bcrypt.compare(currentPassword, user.password_hash);
      if (!isMatch) {
        throw new AppError(401, 'Mot de passe actuel incorrect');
      }

      // Hasher et sauvegarder le nouveau mot de passe
      const newHash = await bcrypt.hash(newPassword, config.bcryptRounds);
      await pool.query(
        'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
        [newHash, user.id]
      );

      logger.info('Mot de passe modifié', { userId: user.id });

      res.status(204).send();
    } catch (err) {
      return next(err);
    }
  }
);

export default router;
