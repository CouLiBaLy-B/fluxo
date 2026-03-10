/**
 * Utilités de routage pour synchroniser l'état avec les URLs
 * Format des URLs :
 * - / → Dashboard
 * - /jira/projects → Liste des projets
 * - /jira/project/{projectId}/board → Tableau du projet
 * - /confluence/spaces → Liste des espaces
 * - /confluence/space/{spaceKey}/page/{pageId} → Page spécifique
 * - /members → Membres
 * - /agents → Agents AI
 * - /settings → Paramètres
 */

import { useEffect } from 'react';

export type TopView = 'dashboard' | 'jira' | 'confluence' | 'members' | 'agents' | 'settings';
export type JiraSubView = 'projects' | 'board';

export interface RouteState {
  view: TopView;
  jiraSubView?: JiraSubView;
  projectId?: string;
  spaceKey?: string;
  pageId?: string;
}

/**
 * Construit une URL basée sur l'état de navigation
 */
export function buildUrl(state: RouteState): string {
  switch (state.view) {
    case 'jira':
      if (state.jiraSubView === 'board' && state.projectId) {
        return `/jira/project/${encodeURIComponent(state.projectId)}/board`;
      }
      return '/jira/projects';
    case 'confluence':
      if (state.pageId && state.spaceKey) {
        return `/confluence/space/${encodeURIComponent(state.spaceKey)}/page/${encodeURIComponent(state.pageId)}`;
      }
      return '/confluence/spaces';
    case 'members':
      return '/members';
    case 'agents':
      return '/agents';
    case 'settings':
      return '/settings';
    case 'dashboard':
    default:
      return '/';
  }
}

/**
 * Parse une URL et retourne l'état de navigation
 */
export function parseUrl(pathname: string): RouteState {
  // Confluence page
  const confPageMatch = pathname.match(/^\/confluence\/space\/([^/]+)\/page\/([^/]+)/);
  if (confPageMatch) {
    return { 
      view: 'confluence', 
      spaceKey: decodeURIComponent(confPageMatch[1]), 
      pageId: decodeURIComponent(confPageMatch[2]) 
    };
  }

  // Confluence spaces list
  if (pathname.startsWith('/confluence')) {
    return { view: 'confluence' };
  }

  // Jira board
  const jiraBoardMatch = pathname.match(/^\/jira\/project\/([^/]+)\/board/);
  if (jiraBoardMatch) {
    return { 
      view: 'jira', 
      jiraSubView: 'board', 
      projectId: decodeURIComponent(jiraBoardMatch[1]) 
    };
  }

  // Jira projects
  if (pathname.startsWith('/jira')) {
    return { view: 'jira', jiraSubView: 'projects' };
  }

  // Autres vues
  if (pathname.startsWith('/members')) return { view: 'members' };
  if (pathname.startsWith('/agents')) return { view: 'agents' };
  if (pathname.startsWith('/settings')) return { view: 'settings' };

  // Par défaut : dashboard
  return { view: 'dashboard' };
}

/**
 * Hook pour synchroniser l'état avec l'URL (bidirectionnel)
 */
export function useUrlSync(
  state: RouteState,
  onStateChange: (state: RouteState) => void
) {
  // Synchroniser l'état vers l'URL
  useEffect(() => {
    const url = buildUrl(state);
    window.history.pushState(state, '', url);
  }, [state]);

  // Écouter les changements d'URL (bouton back/forward)
  useEffect(() => {
    const handler = () => {
      const newState = parseUrl(window.location.pathname);
      onStateChange(newState);
    };
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, [onStateChange]);
}
