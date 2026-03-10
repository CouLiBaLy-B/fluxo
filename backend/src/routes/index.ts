import { Router } from 'express';
import authRouter       from './auth';
import usersRouter      from './users';
import projectsRouter   from './projects';
import issuesRouter     from './issues';
import sprintsRouter    from './sprints';
import confluenceRouter from './confluence';
import agentsRouter     from './agents.routes';
import adminRouter      from './admin.routes';

const router = Router();

// ── Authentification (pas de middleware auth global ici) ──────────────────────
router.use('/auth',       authRouter);

// ── Ressources protégées ───────────────────────────────────────────────────────
router.use('/users',      usersRouter);
router.use('/projects',   projectsRouter);
router.use('/issues',     issuesRouter);
router.use('/sprints',    sprintsRouter);
router.use('/confluence', confluenceRouter);

// ── Agents AI ─────────────────────────────────────────────────────────────────
router.use('/agents',     agentsRouter);

// ── Admin / Configuration ─────────────────────────────────────────────────────
router.use('/admin',      adminRouter);

export default router;
