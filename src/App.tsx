import { useState, useEffect, useCallback } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { JiraBoard }          from './components/JiraBoard';
import { ConfluenceWiki }     from './components/ConfluenceWiki';
import { ProjectsPage }       from './components/ProjectsPage';
import { GlobalSearch }       from './components/GlobalSearch';
import { NotificationsPanel } from './components/NotificationsPanel';
import { MembersPage }        from './components/MembersPage';
import { Dashboard }          from './components/Dashboard';
import { LoginPage }          from './components/LoginPage';
import { useAuth }            from './contexts/AuthContext';
import { api }                from './api/client';

import type { JiraProject, ConfluenceSpace, AppView, Notification } from './types';

// ─── PrivateRoute ─────────────────────────────────────────────────────────────

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
}

// ─── Keyboard Shortcuts ───────────────────────────────────────────────────────

function useKeyboardShortcuts(callbacks: {
  openSearch: () => void;
  switchToJira: () => void;
  switchToConfluence: () => void;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        callbacks.openSearch();
        return;
      }

      if (isInput) return;
      if (e.key === 'j' || e.key === 'J') { callbacks.switchToJira(); }
      if (e.key === 'f' || e.key === 'F') { callbacks.switchToConfluence(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [callbacks]);
}

// ─── Shortcuts Modal ──────────────────────────────────────────────────────────

function ShortcutsModal({ onClose }: { onClose: () => void }) {
  const shortcuts = [
    { keys: ['⌘', 'K'], desc: 'Recherche globale' },
    { keys: ['J'],       desc: 'Aller sur Jira' },
    { keys: ['F'],       desc: 'Aller sur Confluence' },
    { keys: ['?'],       desc: 'Raccourcis clavier' },
    { keys: ['ESC'],     desc: 'Fermer' },
  ];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-sm mx-4 overflow-hidden" style={{ boxShadow: '0 24px 80px rgba(9,30,66,.40)' }} onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-[#DFE1E6]">
          <h3 className="text-[15px] font-bold text-[#172B4D]">Raccourcis clavier</h3>
        </div>
        <div className="px-5 py-4 flex flex-col gap-2.5">
          {shortcuts.map((s, i) => (
            <div key={i} className="flex items-center justify-between">
              <span className="text-[13px] text-[#42526E]">{s.desc}</span>
              <div className="flex items-center gap-1">
                {s.keys.map((k, j) => (
                  <kbd key={j} className="text-[11px] font-semibold text-[#42526E] bg-[#F4F5F7] border border-[#DFE1E6] rounded px-1.5 py-0.5">{k}</kbd>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="px-5 py-3 border-t border-[#DFE1E6] bg-[#FAFBFC]">
          <button onClick={onClose} className="w-full text-center text-[12px] font-semibold text-[#0052CC] hover:underline">Fermer</button>
        </div>
      </div>
    </div>
  );
}

// ─── Main App Layout ──────────────────────────────────────────────────────────

type JiraSubView = 'projects' | 'board';
type TopView = AppView | 'members' | 'dashboard';

function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [view, setView]               = useState<TopView>('dashboard');
  const [jiraSubView, setJiraSubView] = useState<JiraSubView>('projects');
  const [activeProject, setActiveProject] = useState<JiraProject | null>(null);

  const [notifications, setNotifications] = useState<Notification[]>([
    {
      id: 'n1',
      type: 'issue_assigned',
      title: 'Bienvenue !',
      body: 'Votre espace de travail est prêt. Commencez par créer un projet.',
      read: false,
      createdAt: new Date().toISOString(),
    },
  ]);
  const [notifOpen, setNotifOpen]     = useState(false);
  const [searchOpen, setSearchOpen]   = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [confPageTarget, setConfPageTarget] = useState<{ pageId: string; spaceId: string } | null>(null);

  // ── Chargement des données depuis l'API ────────────────────────────────────

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api.projects.list(),
  });

  const { data: spaces = [] } = useQuery({
    queryKey: ['confluence-spaces'],
    queryFn: () => api.confluence.spaces(),
  });

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.users.list(),
  });

  const { data: issues = [] } = useQuery({
    queryKey: ['issues', activeProject?.id],
    queryFn: () => activeProject
      ? api.projects.issues(activeProject.id)
      : api.issues.list(),
    enabled: view === 'jira' || view === 'dashboard',
  });

  // ── Notifications ──────────────────────────────────────────────────────────

  const addNotification = useCallback((partial: Omit<Notification, 'id' | 'read' | 'createdAt'>) => {
    const n: Notification = { ...partial, id: `n${Date.now()}`, read: false, createdAt: new Date().toISOString() };
    setNotifications(prev => [n, ...prev].slice(0, 30));
  }, []);

  const markRead    = (id: string) => setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  const markAllRead = ()           => setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  const unreadCount = notifications.filter(n => !n.read).length;

  // ── Handlers projets ───────────────────────────────────────────────────────

  const handleSelectProject = (p: JiraProject) => {
    setActiveProject(p);
    setJiraSubView('board');
  };

  const handleCreateProject = (p: JiraProject) => {
    addNotification({
      type: 'sprint_started',
      title: `Projet "${p.name}" créé`,
      body: `Le projet ${p.key} est prêt. Commencez à ajouter des issues !`,
    });
  };

  // ── Navigation globale ─────────────────────────────────────────────────────

  const handleSearchSelectIssue = (issue: { projectId: string }) => {
    const proj = projects.find(p => p.id === issue.projectId);
    if (proj) { setActiveProject(proj); setJiraSubView('board'); setView('jira'); }
  };

  const handleSearchSelectPage = (pageId: string, spaceId: string) => {
    setView('confluence');
    setConfPageTarget({ pageId, spaceId });
  };

  const handleSearchSelectProject = (project: JiraProject) => {
    handleSelectProject(project);
    setView('jira');
  };

  // ── Raccourcis clavier ─────────────────────────────────────────────────────

  useKeyboardShortcuts({
    openSearch:         () => setSearchOpen(true),
    switchToJira:       () => setView('jira'),
    switchToConfluence: () => setView('confluence'),
  });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
      if (!isInput && e.key === '?') setShortcutsOpen(true);
      if (e.key === 'Escape') { setSearchOpen(false); setNotifOpen(false); setShortcutsOpen(false); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // ── Métriques UI ───────────────────────────────────────────────────────────

  const doneCount  = activeProject
    ? issues.filter(i => i.projectId === activeProject.id && i.status === 'done').length
    : issues.filter(i => i.status === 'done').length;
  const totalCount = activeProject
    ? issues.filter(i => i.projectId === activeProject.id).length
    : issues.length;

  const totalPages = spaces.reduce((a, s: ConfluenceSpace) => a + s.pages.length, 0);

  const NAV_ITEMS: { id: TopView; label: string; icon: React.ReactNode }[] = [
    { id: 'dashboard', label: 'Accueil', icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg> },
    { id: 'jira', label: 'Jira', icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="8" height="8" rx="1.5" opacity="0.7"/><rect x="13" y="3" width="8" height="8" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5" opacity="0.7"/></svg> },
    { id: 'confluence', label: 'Confluence', icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M3.315 16.808c-.35.56-.739 1.202-.997 1.638a.965.965 0 0 0 .364 1.35l3.304 1.87a.983.983 0 0 0 1.36-.35c.225-.392.59-1.005.993-1.658 2.718-4.428 5.472-3.876 10.416-1.49l3.286 1.596a.983.983 0 0 0 1.31-.493l1.449-3.45a.965.965 0 0 0-.498-1.298c-1.13-.532-3.37-1.62-5.446-2.6C11.362 9.918 5.803 10.47 3.315 16.808zM20.685 7.192c.35-.56.738-1.202.997-1.638a.965.965 0 0 0-.364-1.35l-3.304-1.87a.983.983 0 0 0-1.36.35c-.225.392-.59 1.005-.993 1.658-2.718 4.428-5.472 3.876-10.416 1.49L1.959 5.236a.983.983 0 0 0-1.31.493L.2 9.179a.965.965 0 0 0 .498 1.298c1.13.532 3.37 1.62 5.446 2.6 7.195 3.515 12.754 2.963 15.541-3.885z"/></svg> },
    { id: 'members', label: 'Membres', icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg> },
  ];

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-[#F4F5F7]" style={{ fontFamily: 'Inter, -apple-system, sans-serif' }}>

      {/* ── Navigation principale ─────────────────────────────────────── */}
      <nav className="flex-shrink-0 flex items-center h-[56px] px-4 gap-2" style={{ background: '#0065FF' }}>
        <div className="flex items-center gap-2 mr-3 flex-shrink-0">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M11.12 1.095a.6.6 0 0 0-.9.52v8.695l-2.52-4.87a.6.6 0 0 0-1.053-.002L.893 16.75A.6.6 0 0 0 1.42 17.6h6.48l3.252-6.284V22.3a.6.6 0 0 0 1.2 0V11.316l3.252 6.284h6.48a.6.6 0 0 0 .527-.85L11.12 1.095z" fill="white" />
          </svg>
          <span className="text-white font-bold text-[15px] tracking-tight">Atlassian</span>
        </div>

        <div className="w-px h-5 bg-white/20 mx-1" />

        <div className="flex items-center gap-0.5">
          {NAV_ITEMS.map(item => (
            <button key={item.id} onClick={() => setView(item.id)}
              className={['relative flex items-center gap-2 px-3 py-1.5 rounded text-[14px] font-semibold transition-colors', view === item.id ? 'bg-white/20 text-white' : 'text-white/80 hover:bg-white/10 hover:text-white'].join(' ')}>
              {item.icon}{item.label}
              {view === item.id && <span className="absolute bottom-0 left-1 right-1 h-0.5 bg-white rounded-t" />}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        {/* Recherche globale */}
        <button onClick={() => setSearchOpen(true)}
          className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white/80 hover:text-white rounded-lg px-3 py-1.5 text-[13px] transition-colors mr-1" title="Recherche globale (⌘K)">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <span className="hidden md:block">Recherche</span>
          <kbd className="hidden md:block text-[10px] font-bold bg-white/20 rounded px-1">⌘K</kbd>
        </button>

        {/* Indicateur projet actif */}
        {view === 'jira' && jiraSubView === 'board' && activeProject && (
          <div className="hidden md:flex items-center gap-1.5 bg-white/10 rounded px-2.5 py-1 text-[12px] text-white/90 font-medium">
            <div className="w-4 h-4 rounded-sm flex items-center justify-center text-[10px]" style={{ background: activeProject.color }}>{activeProject.emoji}</div>
            {activeProject.name}
            <span className="opacity-60 font-mono ml-0.5">{activeProject.key}</span>
          </div>
        )}

        {/* Barre de progression sprint */}
        {view === 'jira' && jiraSubView === 'board' && (
          <div className="hidden md:flex items-center gap-2 bg-white/10 rounded px-2.5 py-1">
            <div className="w-16 h-1 bg-white/20 rounded-full overflow-hidden">
              <div className="h-full bg-white rounded-full transition-all" style={{ width: totalCount ? `${(doneCount / totalCount) * 100}%` : '0%' }} />
            </div>
            <span className="text-[11px] font-semibold text-white/80">{doneCount}/{totalCount}</span>
          </div>
        )}

        {/* Indicateur Confluence */}
        {view === 'confluence' && (
          <div className="hidden md:flex items-center gap-1.5 bg-white/10 rounded px-2.5 py-1 text-[11px] text-white/80 font-medium">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8" fill="none" stroke="currentColor" strokeWidth="2"/></svg>
            {totalPages} pages · {spaces.length} espaces
          </div>
        )}

        {/* Raccourcis */}
        <button onClick={() => setShortcutsOpen(true)} title="Raccourcis (?)"
          className="w-8 h-8 rounded flex items-center justify-center text-white/70 hover:bg-white/10 hover:text-white transition-colors">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="4" width="20" height="16" rx="2"/><path d="M6 8h.001M10 8h.001M14 8h.001M18 8h.001M8 12h.001M12 12h.001M16 12h.001M7 16h10"/>
          </svg>
        </button>

        {/* Cloche notifications */}
        <button onClick={() => setNotifOpen(!notifOpen)}
          className="relative w-8 h-8 rounded flex items-center justify-center text-white/80 hover:bg-white/10 hover:text-white transition-colors">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0"/>
          </svg>
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 bg-[#FF5630] rounded-full border border-[#0065FF] flex items-center justify-center text-[9px] font-bold text-white px-0.5">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>

        {/* Avatar utilisateur connecté + déconnexion */}
        <div className="relative group ml-1">
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white cursor-pointer flex-shrink-0 ring-2 ring-white/30"
            style={{ background: user?.color ?? '#6554C0' }} title={`${user?.name} (vous)`}>
            {user?.avatar ?? '?'}
          </div>
          {/* Menu déroulant au survol */}
          <div className="hidden group-hover:block absolute right-0 top-full mt-1 bg-white rounded-lg shadow-lg border border-gray-200 py-1 w-40 z-50">
            <div className="px-3 py-2 text-xs text-gray-500 border-b border-gray-100">{user?.email}</div>
            <button onClick={() => { logout(); navigate('/login'); }}
              className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors">
              Se déconnecter
            </button>
          </div>
        </div>
      </nav>

      {/* ── Fil d'ariane ──────────────────────────────────────────────── */}
      <div className="flex-shrink-0 flex items-center gap-1.5 px-6 h-[36px] bg-white border-b border-[#DFE1E6] text-[12px]">
        {view === 'jira' ? (
          <>
            <button onClick={() => { setJiraSubView('projects'); setActiveProject(null); }} className="text-[#42526E] font-medium hover:text-[#0052CC] hover:underline transition-colors">Projets</button>
            {jiraSubView === 'board' && activeProject && (
              <>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#8993A4" strokeWidth="2.5"><path d="m9 18 6-6-6-6"/></svg>
                <span className="text-[#42526E] font-medium">{activeProject.name}</span>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#8993A4" strokeWidth="2.5"><path d="m9 18 6-6-6-6"/></svg>
                <span className="font-semibold text-[#172B4D]">Tableau</span>
              </>
            )}
          </>
        ) : view === 'confluence' ? (
          <>
            <span className="text-[#42526E] font-medium">Confluence</span>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#8993A4" strokeWidth="2.5"><path d="m9 18 6-6-6-6"/></svg>
            <span className="font-semibold text-[#172B4D]">Espaces</span>
          </>
        ) : view === 'members' ? (
          <>
            <span className="text-[#42526E] font-medium">Organisation</span>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#8993A4" strokeWidth="2.5"><path d="m9 18 6-6-6-6"/></svg>
            <span className="font-semibold text-[#172B4D]">Membres</span>
          </>
        ) : (
          <span className="font-semibold text-[#172B4D]">Tableau de bord</span>
        )}

        <div className="flex-1" />

        {/* Avatars équipe */}
        <div className="flex items-center -space-x-1 mr-2">
          {users.slice(0, 4).map(u => (
            <div key={u.id} title={u.name}
              style={{ width: 22, height: 22, background: u.color, fontSize: 8 }}
              className="rounded-full border-2 border-white flex items-center justify-center text-white font-bold uppercase">
              {u.avatar}
            </div>
          ))}
          {users.length > 4 && (
            <div style={{ width: 22, height: 22, fontSize: 8 }}
              className="rounded-full border-2 border-white bg-[#DFE1E6] flex items-center justify-center text-[#42526E] font-bold">
              +{users.length - 4}
            </div>
          )}
        </div>

        <span className="text-[#8993A4]">
          {view === 'jira'
            ? jiraSubView === 'board' && activeProject
              ? `${issues.filter(i => i.projectId === activeProject.id).length} issues`
              : `${projects.length} projet${projects.length !== 1 ? 's' : ''}`
            : view === 'confluence'
            ? `${totalPages} pages · ${spaces.length} espaces`
            : view === 'members'
            ? `${users.length} membres`
            : ''
          }
        </span>
      </div>

      {/* ── Contenu principal ─────────────────────────────────────────── */}
      <main className="flex-1 overflow-hidden flex flex-col">
        {view === 'dashboard' ? (
          <Dashboard
            issues={issues}
            projects={projects}
            spaces={spaces}
            users={users}
            notifications={notifications}
            onSelectProject={p => { handleSelectProject(p); setView('jira'); }}
            onSelectPage={(pageId, spaceId) => { setView('confluence'); setConfPageTarget({ pageId, spaceId }); }}
          />
        ) : view === 'jira' ? (
          jiraSubView === 'projects' ? (
            <ProjectsPage
              projects={projects}
              issues={issues}
              onSelectProject={handleSelectProject}
              onCreateProject={handleCreateProject}
              onUpdateProject={() => undefined}
              onDeleteProject={() => undefined}
            />
          ) : activeProject ? (
            <JiraBoard
              project={activeProject}
              onBack={() => { setJiraSubView('projects'); setActiveProject(null); }}
              onUpdateProject={p => { setActiveProject(p); }}
            />
          ) : null
        ) : view === 'confluence' ? (
          <ConfluenceWiki
            spaces={spaces}
            setSpaces={() => undefined}
            initialPageTarget={confPageTarget}
            onPageTargetConsumed={() => setConfPageTarget(null)}
          />
        ) : (
          <MembersPage
            users={users}
            onAddUser={() => undefined}
            onUpdateUser={() => undefined}
          />
        )}
      </main>

      {/* ── Overlays ─────────────────────────────────────────────────── */}
      {searchOpen && (
        <GlobalSearch
          issues={issues}
          spaces={spaces}
          projects={projects}
          onSelectIssue={handleSearchSelectIssue}
          onSelectPage={handleSearchSelectPage}
          onSelectProject={handleSearchSelectProject}
          onClose={() => setSearchOpen(false)}
        />
      )}

      {notifOpen && (
        <NotificationsPanel
          notifications={notifications}
          onMarkRead={markRead}
          onMarkAllRead={markAllRead}
          onClose={() => setNotifOpen(false)}
        />
      )}

      {shortcutsOpen && (
        <ShortcutsModal onClose={() => setShortcutsOpen(false)} />
      )}
    </div>
  );
}

// ─── Routes principales ───────────────────────────────────────────────────────

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/*" element={
        <PrivateRoute>
          <AppLayout />
        </PrivateRoute>
      } />
    </Routes>
  );
}
