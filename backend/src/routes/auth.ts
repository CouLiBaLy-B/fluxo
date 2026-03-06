import { Router, Request, Response, NextFunction } from 'express';
import { body } from 'express-validator';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../db/pool';
import { config } from '../config';
import { AppError } from '../middleware/errorHandler';
import { validate } from '../middleware/validate';
import { requireAuth } from '../middleware/auth';
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

// ── POST /api/auth/register ────────────────────────────────────────────────────
/**
 * Création d'un nouveau compte utilisateur.
 * Le premier utilisateur créé reçoit le rôle 'admin'.
 */
router.post(
  '/register',
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
    body('password')
      .notEmpty().withMessage('Le mot de passe est obligatoire')
      .isLength({ min: 8 }).withMessage('Le mot de passe doit faire au moins 8 caractères'),
  ],
  validate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, email, password } = req.body as {
        name: string;
        email: string;
        password: string;
      };

      // Vérifier si l'email existe déjà
      const existing = await pool.query<{ id: string }>(
        'SELECT id FROM users WHERE email = $1',
        [email]
      );
      if (existing.rowCount && existing.rowCount > 0) {
        throw new AppError(409, 'Un compte avec cet email existe déjà');
      }

      // Déterminer le rôle : premier utilisateur = admin
      const countResult = await pool.query<{ count: string }>('SELECT COUNT(*) FROM users');
      const isFirstUser = parseInt(countResult.rows[0].count, 10) === 0;
      const role = isFirstUser ? 'admin' : 'member';

      // Hasher le mot de passe
      const passwordHash = await bcrypt.hash(password, config.bcryptRounds);

      // Générer les initiales de l'avatar
      const avatar = name
        .split(' ')
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? '')
        .join('');

      // Insérer l'utilisateur
      const result = await pool.query<UserRow>(
        `INSERT INTO users (name, avatar, color, email, password_hash, role)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, name, avatar, color, email, password_hash, role`,
        [name, avatar, '#6554C0', email, passwordHash, role]
      );

      const user = result.rows[0];
      const token = signToken(user);

      logger.info('Nouvel utilisateur créé', { userId: user.id, email: user.email });

      res.status(201).json({
        token,
        user: formatUser(user),
      });
    } catch (err) {
      return next(err);
    }
  }
);

// ── POST /api/auth/login ───────────────────────────────────────────────────────
/**
 * Authentification avec email + mot de passe.
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

      // Chercher l'utilisateur
      const result = await pool.query<UserRow>(
        'SELECT id, name, avatar, color, email, password_hash, role FROM users WHERE email = $1',
        [email]
      );

      const user = result.rows[0];

      // Même message si l'email n'existe pas OU si le mot de passe est incorrect
      // (évite l'énumération des comptes)
      if (!user || !(await bcrypt.compare(password, user.password_hash))) {
        throw new AppError(401, 'Email ou mot de passe incorrect');
      }

      const token = signToken(user);

      logger.info('Connexion réussie', { userId: user.id, email: user.email });

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
        'SELECT id, name, avatar, color, email, password_hash, role FROM users WHERE id = $1',
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

export default router;
