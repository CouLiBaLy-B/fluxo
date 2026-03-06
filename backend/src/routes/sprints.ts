import { Router, Request, Response, NextFunction } from 'express';
import { body, param, query } from 'express-validator';
import { pool } from '../db/pool';
import { AppError } from '../middleware/errorHandler';
import { requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import logger from '../logger';

const router = Router();

router.use(requireAuth);

// ── Types ──────────────────────────────────────────────────────────────────────

interface SprintRow {
  id: string;
  project_id: string;
  name: string;
  goal: string;
  start_date: Date | null;
  end_date: Date | null;
  active: boolean;
  issue_count: number;
  done_count: number;
  created_at: Date;
}

function formatSprint(row: SprintRow) {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    goal: row.goal,
    startDate: row.start_date instanceof Date ? row.start_date.toISOString().slice(0, 10) : (row.start_date ? String(row.start_date).slice(0, 10) : null),
    endDate: row.end_date instanceof Date ? row.end_date.toISOString().slice(0, 10) : (row.end_date ? String(row.end_date).slice(0, 10) : null),
    active: row.active,
    issueCount: row.issue_count ?? 0,
    doneCount: row.done_count ?? 0,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
  };
}

// ── GET /api/sprints ───────────────────────────────────────────────────────────
router.get(
  '/',
  [query('projectId').optional().isString()],
  validate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { projectId } = req.query;
      const conditions: string[] = [];
      const params: unknown[] = [];

      if (projectId) {
        conditions.push(`s.project_id = $${params.length + 1}`);
        params.push(projectId);
      }

      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

      const { rows } = await pool.query<SprintRow>(
        `SELECT s.*,
                COUNT(i.id)::int AS issue_count,
                COUNT(i.id) FILTER (WHERE i.status = 'done')::int AS done_count
         FROM sprints s
         LEFT JOIN issues i ON i.sprint_id = s.id AND i.deleted_at IS NULL
         ${where}
         GROUP BY s.id
         ORDER BY s.created_at DESC`,
        params
      );

      res.json(rows.map(formatSprint));
    } catch (err) {
      return next(err);
    }
  }
);

// ── GET /api/sprints/:id ───────────────────────────────────────────────────────
router.get(
  '/:id',
  [param('id').notEmpty()],
  validate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { rows } = await pool.query<SprintRow>(
        `SELECT s.*,
                COUNT(i.id)::int AS issue_count,
                COUNT(i.id) FILTER (WHERE i.status = 'done')::int AS done_count
         FROM sprints s
         LEFT JOIN issues i ON i.sprint_id = s.id AND i.deleted_at IS NULL
         WHERE s.id = $1
         GROUP BY s.id`,
        [req.params.id]
      );
      if (!rows[0]) throw new AppError(404, 'Sprint introuvable');
      res.json(formatSprint(rows[0]));
    } catch (err) {
      return next(err);
    }
  }
);

// ── POST /api/sprints ──────────────────────────────────────────────────────────
router.post(
  '/',
  [
    body('projectId').notEmpty().withMessage('Le projet est obligatoire'),
    body('name').trim().notEmpty().withMessage('Le nom du sprint est obligatoire')
      .isLength({ max: 100 }),
    body('goal').optional().trim().isLength({ max: 500 }),
    body('startDate').optional().isDate().withMessage('La date de début est invalide (YYYY-MM-DD)'),
    body('endDate').optional().isDate().withMessage('La date de fin est invalide (YYYY-MM-DD)')
      .custom((endDate: string, { req: r }) => {
        const startDate = r.body?.startDate;
        if (startDate && endDate && new Date(endDate) < new Date(startDate)) {
          throw new Error('La date de fin doit être après la date de début');
        }
        return true;
      }),
  ],
  validate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { projectId, name, goal = '', startDate, endDate } = req.body as {
        projectId: string; name: string; goal?: string; startDate?: string; endDate?: string;
      };

      const { rows } = await pool.query<SprintRow>(
        `INSERT INTO sprints (project_id, name, goal, start_date, end_date, active)
         VALUES ($1, $2, $3, $4, $5, FALSE)
         RETURNING *,
                   0::int AS issue_count,
                   0::int AS done_count`,
        [projectId, name, goal, startDate ?? null, endDate ?? null]
      );

      logger.info('Sprint créé', { sprintId: rows[0].id, projectId });
      res.status(201).json(formatSprint(rows[0]));
    } catch (err) {
      return next(err);
    }
  }
);

// ── PUT /api/sprints/:id ───────────────────────────────────────────────────────
router.put(
  '/:id',
  [
    param('id').notEmpty(),
    body('name').trim().notEmpty().withMessage('Le nom du sprint est obligatoire'),
    body('startDate').optional().isDate(),
    body('endDate').optional().isDate()
      .custom((endDate: string, { req: r }) => {
        const startDate = r.body?.startDate;
        if (startDate && endDate && new Date(endDate) < new Date(startDate)) {
          throw new Error('La date de fin doit être après la date de début');
        }
        return true;
      }),
  ],
  validate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, goal, startDate, endDate } = req.body as {
        name: string; goal?: string; startDate?: string; endDate?: string;
      };

      const { rows } = await pool.query<SprintRow>(
        `UPDATE sprints SET name=$1, goal=$2, start_date=$3, end_date=$4
         WHERE id=$5
         RETURNING *,
                   0::int AS issue_count,
                   0::int AS done_count`,
        [name, goal ?? '', startDate ?? null, endDate ?? null, req.params.id]
      );

      if (!rows[0]) throw new AppError(404, 'Sprint introuvable');
      res.json(formatSprint(rows[0]));
    } catch (err) {
      return next(err);
    }
  }
);

// ── POST /api/sprints/:id/start ────────────────────────────────────────────────
/** Active un sprint et désactive tous les autres sprints du même projet. */
router.post(
  '/:id/start',
  [param('id').notEmpty()],
  validate,
  async (req: Request, res: Response, next: NextFunction) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { rows } = await client.query<SprintRow>(
        'SELECT * FROM sprints WHERE id = $1',
        [req.params.id]
      );
      if (!rows[0]) throw new AppError(404, 'Sprint introuvable');

      // Désactiver tous les sprints du projet
      await client.query(
        'UPDATE sprints SET active = FALSE WHERE project_id = $1',
        [rows[0].project_id]
      );

      // Activer ce sprint avec des dates si elles manquent
      const { rows: updated } = await client.query<SprintRow>(
        `UPDATE sprints
         SET active = TRUE,
             start_date = COALESCE(start_date, CURRENT_DATE),
             end_date   = COALESCE(end_date, CURRENT_DATE + 14)
         WHERE id = $1
         RETURNING *,
                   0::int AS issue_count,
                   0::int AS done_count`,
        [req.params.id]
      );

      await client.query('COMMIT');

      logger.info('Sprint démarré', { sprintId: req.params.id });
      res.json(formatSprint(updated[0]));
    } catch (err) {
      await client.query('ROLLBACK');
      return next(err);
    } finally {
      client.release();
    }
  }
);

// ── POST /api/sprints/:id/close ────────────────────────────────────────────────
/** Ferme un sprint et remet les issues non terminées dans le backlog. */
router.post(
  '/:id/close',
  [param('id').notEmpty()],
  validate,
  async (req: Request, res: Response, next: NextFunction) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Compter les issues non terminées pour le log
      const { rows: incomplete } = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM issues
         WHERE sprint_id = $1 AND status != 'done' AND deleted_at IS NULL`,
        [req.params.id]
      );

      // Remettre les issues non terminées dans le backlog
      await client.query(
        `UPDATE issues SET status = 'backlog', sprint_id = NULL
         WHERE sprint_id = $1 AND status != 'done' AND deleted_at IS NULL`,
        [req.params.id]
      );

      const { rows } = await client.query<SprintRow>(
        `UPDATE sprints SET active = FALSE WHERE id = $1
         RETURNING *,
                   0::int AS issue_count,
                   0::int AS done_count`,
        [req.params.id]
      );

      if (!rows[0]) throw new AppError(404, 'Sprint introuvable');

      await client.query('COMMIT');

      logger.info('Sprint clôturé', {
        sprintId: req.params.id,
        issuesMoved: incomplete[0]?.count ?? '0',
      });

      res.json(formatSprint(rows[0]));
    } catch (err) {
      await client.query('ROLLBACK');
      return next(err);
    } finally {
      client.release();
    }
  }
);

// ── DELETE /api/sprints/:id ────────────────────────────────────────────────────
router.delete(
  '/:id',
  [param('id').notEmpty()],
  validate,
  async (req: Request, res: Response, next: NextFunction) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Remettre les issues du sprint dans le backlog
      await client.query(
        `UPDATE issues SET sprint_id = NULL, status = 'backlog'
         WHERE sprint_id = $1 AND deleted_at IS NULL`,
        [req.params.id]
      );

      const { rowCount } = await client.query(
        'DELETE FROM sprints WHERE id = $1',
        [req.params.id]
      );

      if (!rowCount) throw new AppError(404, 'Sprint introuvable');

      await client.query('COMMIT');

      logger.info('Sprint supprimé', { sprintId: req.params.id });
      res.status(204).send();
    } catch (err) {
      await client.query('ROLLBACK');
      return next(err);
    } finally {
      client.release();
    }
  }
);

export default router;
