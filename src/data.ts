import { JiraIssue, JiraUser, Sprint, JiraProject, ConfluenceSpace } from './types';

export const USERS: JiraUser[] = [
  { id: 'u1', name: 'Alice Martin', avatar: 'AM', color: '#6554C0', email: 'alice@example.com' },
  { id: 'u2', name: 'Bob Kaplan',   avatar: 'BK', color: '#0052CC', email: 'bob@example.com'   },
  { id: 'u3', name: 'Carol Singh',  avatar: 'CS', color: '#00875A', email: 'carol@example.com' },
];

export const COLUMNS = [
  { id: 'backlog'     as const, label: 'Backlog',     color: '#8993A4', wip: 0 },
  { id: 'todo'        as const, label: 'To Do',       color: '#97A0AF', wip: 0 },
  { id: 'in-progress' as const, label: 'In Progress', color: '#0052CC', wip: 4 },
  { id: 'in-review'   as const, label: 'In Review',   color: '#FF8B00', wip: 3 },
  { id: 'done'        as const, label: 'Done',        color: '#00875A', wip: 0 },
];

export const INITIAL_PROJECTS: JiraProject[] = [
  {
    id: 'proj-1',
    key: 'PROJ',
    name: 'My Project',
    lead: 'Alice Martin',
    leadId: 'u1',
    type: 'software',
    color: '#0052CC',
    emoji: '🚀',
    description: 'The main software project.',
    createdAt: new Date().toISOString().slice(0, 10),
  },
];

export const INITIAL_SPRINT: Sprint = {
  id: 'spr-1',
  name: 'Sprint 1',
  startDate: new Date().toISOString().slice(0, 10),
  endDate: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
  goal: 'Ship the first working version',
  active: true,
};

export const INITIAL_ISSUES: JiraIssue[] = [
  {
    id: 'i1', key: 'PROJ-1', projectId: 'proj-1', type: 'story',
    title: 'Setup project repository',
    description: 'Initialize Git, configure CI, and set up the dev environment.',
    priority: 'high', assigneeId: 'u1', reporterId: 'u1',
    storyPoints: 3, status: 'done', labels: ['setup'],
    createdAt: new Date().toISOString().slice(0, 10),
    updatedAt: new Date().toISOString().slice(0, 10),
    comments: [], linkedIssues: [],
  },
  {
    id: 'i2', key: 'PROJ-2', projectId: 'proj-1', type: 'task',
    title: 'Design database schema',
    description: 'Define tables, relationships, and indexes for core domain models.',
    priority: 'medium', assigneeId: 'u2', reporterId: 'u1',
    storyPoints: 5, status: 'in-progress', labels: ['backend'],
    createdAt: new Date().toISOString().slice(0, 10),
    updatedAt: new Date().toISOString().slice(0, 10),
    comments: [], linkedIssues: [],
  },
  {
    id: 'i3', key: 'PROJ-3', projectId: 'proj-1', type: 'bug',
    title: 'Fix login page layout on mobile',
    description: 'The form overflows on screens smaller than 375px.',
    priority: 'high', assigneeId: 'u3', reporterId: 'u2',
    storyPoints: 2, status: 'todo', labels: ['bug', 'mobile'],
    createdAt: new Date().toISOString().slice(0, 10),
    updatedAt: new Date().toISOString().slice(0, 10),
    comments: [], linkedIssues: [],
  },
];

export const INITIAL_SPACES: ConfluenceSpace[] = [
  {
    id: 'space-1', key: 'ENG', name: 'Engineering', emoji: '⚙️',
    color: '#0052CC',
    description: 'Technical docs, architecture decisions, and runbooks.',
    pages: [
      {
        id: 'p1', title: 'Getting Started', spaceKey: 'ENG',
        authorId: 'u1',
        createdAt: new Date().toISOString().slice(0, 10),
        updatedAt: new Date().toISOString().slice(0, 10),
        tags: ['guide', 'setup'], emoji: '🚀', likes: 0, views: 0,
        content: `# Getting Started\n\nWelcome to the Engineering space.\n\n## Prerequisites\n\n- Node.js 20+\n- Docker & Docker Compose\n- Git\n\n## Quick Start\n\n\`\`\`bash\ngit clone <your-repo>\ncd <your-repo>\ndocker compose up\n\`\`\`\n\n## Next Steps\n\n- Configure environment variables\n- Run the database migrations\n- Start the development server\n`,
      },
    ],
  },
  {
    id: 'space-2', key: 'PM', name: 'Product', emoji: '🧭',
    color: '#6554C0',
    description: 'Product strategy, roadmaps, specs, and user research.',
    pages: [
      {
        id: 'p2', title: 'Product Roadmap', spaceKey: 'PM',
        authorId: 'u2',
        createdAt: new Date().toISOString().slice(0, 10),
        updatedAt: new Date().toISOString().slice(0, 10),
        tags: ['roadmap', 'planning'], emoji: '🗺️', likes: 0, views: 0,
        content: `# Product Roadmap\n\nThis page tracks our product goals and milestones.\n\n## Q1 Goals\n\n- Launch MVP\n- Onboard first 10 users\n- Collect feedback\n\n## Q2 Goals\n\n- Feature iteration based on feedback\n- Performance improvements\n- Mobile support\n\n## Principles\n\n**Build fast, learn faster.** Ship often, measure everything, and iterate.\n`,
      },
    ],
  },
];
