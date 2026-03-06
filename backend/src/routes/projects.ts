import { Router, Request, Response, NextFunction } from 'express';
import { body, param } from 'express-validator';
import { pool } from '../db/pool';
import { AppError } from '../middleware/errorHandler';
import { requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import logger from '../logger';

const router = Router();

// Toutes les routes projets nécessitent une authentification
router.use(requireAuth);

// ── Types ──────────────────────────────────────────────────────────────────────

interface ProjectRow {
  id: string;
  key: string;
  name: string;
  description: string;
  lead_id: string | null;
  lead_name: string | null;
  type: string;
  color: string;
  emoji: string;
  issue_count: number;
  sprint_count: number;
  created_at: string;
}

function formatProject(row: ProjectRow) {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    description: row.description,
    leadId: row.lead_id,
    leadName: row.lead_name,
    type: row.type,
    color: row.color,
    emoji: row.emoji,
    issueCount: row.issue_count ?? 0,
    sprintCount: row.sprint_count ?? 0,
    createdAt: row.created_at,
  };
}

// Règles de validation pour la création/modification d'un projet
const projectValidation = [
  body('name')
    .trim()
    .notEmpty().withMessage('Le nom du projet est obligatoire')
    .isLength({ max: 100 }).withMessage('Le nom ne peut pas dépasser 100 caractères'),
  body('key')
    .optional()
    .trim()
    .toUpperCase()
    .matches(/^[A-Z][A-Z0-9]{1,9}$/).withMessage('La clé doit être 2-10 caractères alphanumériques (ex: PROJ)'),
  body('type')
    .optional()
    .isIn(['software', 'business', 'service']).withMessage('Type invalide'),
  body('color')
    .optional()
    .matches(/^#[0-9A-Fa-f]{6}$/).withMessage('Couleur invalide (format: #RRGGBB)'),
];

// ── GET /api/projects ──────────────────────────────────────────────────────────
/** Liste tous les projets avec compteurs d'issues et sprints. */
router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const { rows } = await pool.query<ProjectRow>(`
      SELECT
        p.id, p.key, p.name, p.description, p.lead_id, p.type, p.color, p.emoji, p.created_at,
        u.name  AS lead_name,
        COUNT(DISTINCT i.id)::int AS issue_count,
        COUNT(DISTINCT s.id)::int AS sprint_count
      FROM projects p
      LEFT JOIN users   u ON u.id = p.lead_id
      LEFT JOIN issues  i ON i.project_id = p.id  AND i.deleted_at IS NULL
      LEFT JOIN sprints s ON s.project_id = p.id
      GROUP BY p.id, u.name
      ORDER BY p.created_at DESC
    `);
    res.json(rows.map(formatProject));
  } catch (err) {
    return next(err);
  }
});

// ── GET /api/projects/:id ──────────────────────────────────────────────────────
router.get(
  '/:id',
  [param('id').notEmpty()],
  validate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { rows } = await pool.query<ProjectRow>(
        `SELECT
           p.id, p.key, p.name, p.description, p.lead_id, p.type, p.color, p.emoji, p.created_at,
           u.name AS lead_name,
           0::int AS issue_count,
           0::int AS sprint_count
         FROM projects p
         LEFT JOIN users u ON u.id = p.lead_id
         WHERE p.id = $1`,
        [req.params.id]
      );
      if (!rows[0]) throw new AppError(404, 'Projet introuvable');
      res.json(formatProject(rows[0]));
    } catch (err) {
      return next(err);
    }
  }
);

// ── POST /api/projects ─────────────────────────────────────────────────────────
/**
 * Crée un nouveau projet et son premier sprint.
 * Opération dans une transaction pour garantir la cohérence.
 */
router.post(
  '/',
  [
    body('key')
      .trim()
      .notEmpty().withMessage('La clé du projet est obligatoire')
      .toUpperCase()
      .matches(/^[A-Z][A-Z0-9]{1,9}$/).withMessage('La clé doit être 2-10 caractères alphanumériques'),
    ...projectValidation,
  ],
  validate,
  async (req: Request, res: Response, next: NextFunction) => {
    const client = await pool.connect();
    try {
      const {
        key,
        name,
        description = '',
        lead_id,
        type = 'software',
        color = '#0052CC',
        emoji = '🚀',
      } = req.body as {
        key: string;
        name: string;
        description?: string;
        lead_id?: string;
        type?: string;
        color?: string;
        emoji?: string;
      };

      await client.query('BEGIN');

      // Vérifier l'unicité de la clé
      const exists = await client.query<{ id: string }>(
        'SELECT id FROM projects WHERE key = $1',
        [key]
      );
      if (exists.rowCount && exists.rowCount > 0) {
        throw new AppError(409, `La clé de projet "${key}" est déjà utilisée`);
      }

      // Créer le projet
      const { rows } = await client.query<{ id: string; key: string; name: string; description: string; lead_id: string | null; type: string; color: string; emoji: string; created_at: string }>(
        `INSERT INTO projects (key, name, description, lead_id, type, color, emoji)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, key, name, description, lead_id, type, color, emoji, created_at`,
        [key, name, description, lead_id ?? null, type, color, emoji]
      );

      const project = rows[0];

      // Ajouter le créateur comme membre lead du projet
      await client.query(
        `INSERT INTO project_members (project_id, user_id, role)
         VALUES ($1, $2, 'lead')
         ON CONFLICT (project_id, user_id) DO NOTHING`,
        [project.id, req.user!.userId]
      );

      // Créer automatiquement le premier sprint
      await client.query(
        `INSERT INTO sprints (project_id, name, goal, start_date, end_date, active)
         VALUES ($1, 'Sprint 1', 'Livrer la première version fonctionnelle', CURRENT_DATE, CURRENT_DATE + 14, TRUE)`,
        [project.id]
      );

      await client.query('COMMIT');

      logger.info('Projet créé', { projectId: project.id, key: project.key, createdBy: req.user!.userId });

      res.status(201).json({
        ...project,
        leadId: project.lead_id,
        leadName: null,
        issueCount: 0,
        sprintCount: 1,
      });
    } catch (err) {
      await client.query('ROLLBACK');
      return next(err);
    } finally {
      client.release();
    }
  }
);

// ── PUT /api/projects/:id ──────────────────────────────────────────────────────
router.put(
  '/:id',
  [param('id').notEmpty(), ...projectValidation],
  validate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, description, lead_id, type, color, emoji } = req.body as {
        name: string;
        description?: string;
        lead_id?: string;
        type?: string;
        color?: string;
        emoji?: string;
      };

      const { rows } = await pool.query<ProjectRow>(
        `UPDATE projects
         SET name=$1, description=$2, lead_id=$3, type=$4, color=$5, emoji=$6
         WHERE id=$7
         RETURNING id, key, name, description, lead_id, type, color, emoji, created_at,
                   NULL::text AS lead_name, 0::int AS issue_count, 0::int AS sprint_count`,
        [name, description ?? '', lead_id ?? null, type ?? 'software', color ?? '#0052CC', emoji ?? '🚀', req.params.id]
      );

      if (!rows[0]) throw new AppError(404, 'Projet introuvable');

      logger.info('Projet mis à jour', { projectId: req.params.id });
      res.json(formatProject(rows[0]));
    } catch (err) {
      return next(err);
    }
  }
);

// ── DELETE /api/projects/:id ───────────────────────────────────────────────────
router.delete(
  '/:id',
  [param('id').notEmpty()],
  validate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { rowCount } = await pool.query(
        'DELETE FROM projects WHERE id = $1',
        [req.params.id]
      );
      if (!rowCount) throw new AppError(404, 'Projet introuvable');
      logger.info('Projet supprimé', { projectId: req.params.id });
      res.status(204).send();
    } catch (err) {
      return next(err);
    }
  }
);

// ── GET /api/projects/:id/sprints ──────────────────────────────────────────────
router.get(
  '/:id/sprints',
  [param('id').notEmpty()],
  validate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { rows } = await pool.query(
        `SELECT s.*,
                COUNT(i.id)::int AS issue_count,
                COUNT(i.id) FILTER (WHERE i.status = 'done')::int AS done_count
         FROM sprints s
         LEFT JOIN issues i ON i.sprint_id = s.id AND i.deleted_at IS NULL
         WHERE s.project_id = $1
         GROUP BY s.id
         ORDER BY s.created_at DESC`,
        [req.params.id]
      );
      res.json(rows.map((r) => ({
        id: r.id,
        projectId: r.project_id,
        name: r.name,
        goal: r.goal,
        startDate: r.start_date ? String(r.start_date).slice(0, 10) : null,
        endDate: r.end_date ? String(r.end_date).slice(0, 10) : null,
        active: r.active,
        issueCount: r.issue_count,
        doneCount: r.done_count,
        createdAt: r.created_at,
      })));
    } catch (err) {
      return next(err);
    }
  }
);

// ── GET /api/projects/:id/issues ───────────────────────────────────────────────
router.get(
  '/:id/issues',
  [param('id').notEmpty()],
  validate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { rows } = await pool.query(
        `SELECT
           i.id, i.key, i.project_id, i.sprint_id, i.type, i.title, i.description,
           i.priority, i.status, i.assignee_id, i.reporter_id, i.story_points,
           i.labels, i.epic_key, i.board_order, i.created_at, i.updated_at,
           ua.name AS assignee_name, ua.avatar AS assignee_avatar, ua.color AS assignee_color,
           ur.name AS reporter_name,
           COALESCE(
             json_agg(
               json_build_object(
                 'id', c.id,
                 'authorId', c.author_id,
                 'body', c.body,
                 'createdAt', to_char(c.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
               )
             ) FILTER (WHERE c.id IS NOT NULL),
             '[]'::json
           ) AS comments
         FROM issues i
         LEFT JOIN users ua    ON ua.id = i.assignee_id
         LEFT JOIN users ur    ON ur.id = i.reporter_id
         LEFT JOIN comments c  ON c.issue_id = i.id
         WHERE i.project_id = $1 AND i.deleted_at IS NULL
         GROUP BY i.id, ua.name, ua.avatar, ua.color, ur.name
         ORDER BY i.board_order ASC, i.created_at DESC`,
        [req.params.id]
      );
      res.json(rows.map((r) => ({
        id: r.id,
        key: r.key,
        projectId: r.project_id,
        sprintId: r.sprint_id,
        type: r.type,
        title: r.title,
        description: r.description,
        priority: r.priority,
        status: r.status,
        assigneeId: r.assignee_id,
        assigneeName: r.assignee_name,
        assigneeAvatar: r.assignee_avatar,
        assigneeColor: r.assignee_color,
        reporterId: r.reporter_id,
        reporterName: r.reporter_name,
        storyPoints: r.story_points,
        labels: r.labels,
        epicKey: r.epic_key,
        boardOrder: r.board_order,
        comments: r.comments,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })));
    } catch (err) {
      return next(err);
    }
  }
);

export default router;
