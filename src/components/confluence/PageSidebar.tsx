import React, { useState, useMemo } from 'react';
import { FileText, ChevronRight, ChevronDown, Plus, Search, Home, Clock, Star } from 'lucide-react';
import type { ConfluencePage, ConfluenceSpace } from '../../types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PageSidebarProps {
  spaces: ConfluenceSpace[];
  activeSpaceId: string | null;
  activePageId: string | null;
  onSelectSpace: (spaceId: string) => void;
  onSelectPage: (pageId: string, spaceId: string) => void;
  onNewPage: (spaceId: string, parentId?: string) => void;
  onSpaceHome: (spaceId: string) => void;
}

// ─── Icône espace ─────────────────────────────────────────────────────────────

function SpaceIcon({ space, size = 20 }: { space: ConfluenceSpace; size?: number }) {
  return (
    <div
      className="rounded flex items-center justify-center text-white flex-shrink-0 font-bold"
      style={{ width: size, height: size, background: space.color, fontSize: size * 0.5 }}
      aria-hidden="true"
    >
      {space.emoji}
    </div>
  );
}

// ─── Item de page récursif ────────────────────────────────────────────────────

interface PageItemProps {
  page: ConfluencePage;
  allPages: ConfluencePage[];
  depth: number;
  activePageId: string | null;
  onSelect: (pageId: string, spaceId: string) => void;
  onNewChild: (parentId: string) => void;
}

function PageItem({ page, allPages, depth, activePageId, onSelect, onNewChild }: PageItemProps) {
  const children = allPages.filter(p => p.parentId === page.id);
  const hasChildren = children.length > 0;
  const [expanded, setExpanded] = useState(() => {
    // Ouvre les nœuds ancêtres de la page active au chargement
    return children.some(c => c.id === activePageId);
  });
  const isActive = activePageId === page.id;

  const paddingLeft = 8 + depth * 16;

  return (
    <div>
      <div
        className={[
          'group flex items-center gap-1 rounded transition-colors cursor-pointer',
          'text-[13px] py-1 pr-2',
          isActive
            ? 'bg-[#DEEBFF] text-[#0052CC] font-medium'
            : 'text-[#172B4D] hover:bg-[#F4F5F7]',
        ].join(' ')}
        style={{ paddingLeft }}
        onClick={() => onSelect(page.id, page.spaceId)}
        role="treeitem"
        aria-selected={isActive}
        aria-expanded={hasChildren ? expanded : undefined}
      >
        {/* Bouton d'expansion si la page a des enfants */}
        {hasChildren ? (
          <button
            type="button"
            onClick={e => { e.stopPropagation(); setExpanded(prev => !prev); }}
            className="w-4 h-4 flex items-center justify-center flex-shrink-0 text-[#6B778C] hover:text-[#172B4D]"
            aria-label={expanded ? 'Réduire' : 'Développer'}
          >
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>
        ) : (
          <span className="w-4 flex-shrink-0" aria-hidden="true" />
        )}

        {/* Emoji de la page ou icône générique */}
        <span className="text-[13px] flex-shrink-0">{page.emoji || '📄'}</span>

        {/* Titre tronqué */}
        <span className="flex-1 truncate" title={page.title}>
          {page.title}
        </span>

        {/* Bouton "Nouvelle sous-page" au hover */}
        <button
          type="button"
          onClick={e => { e.stopPropagation(); onNewChild(page.id); }}
          className="opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center rounded text-[#6B778C] hover:bg-[#DFE1E6] hover:text-[#172B4D] transition-all flex-shrink-0"
          title="Nouvelle sous-page"
          aria-label={`Nouvelle sous-page de ${page.title}`}
        >
          <Plus size={10} />
        </button>
      </div>

      {/* Sous-pages */}
      {hasChildren && expanded && (
        <div role="group">
          {children.map(child => (
            <PageItem
              key={child.id}
              page={child}
              allPages={allPages}
              depth={depth + 1}
              activePageId={activePageId}
              onSelect={onSelect}
              onNewChild={onNewChild}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Section espace ───────────────────────────────────────────────────────────

interface SpaceSectionProps {
  space: ConfluenceSpace;
  isActive: boolean;
  activePageId: string | null;
  onSelectSpace: () => void;
  onSelectPage: (pageId: string, spaceId: string) => void;
  onNewPage: (parentId?: string) => void;
  onSpaceHome: () => void;
}

function SpaceSection({
  space, isActive, activePageId, onSelectSpace, onSelectPage, onNewPage, onSpaceHome,
}: SpaceSectionProps) {
  const [expanded, setExpanded] = useState(isActive);
  const [search, setSearch] = useState('');

  // Pages racines (sans parent) de cet espace
  const rootPages = useMemo(
    () => space.pages.filter(p => !p.parentId),
    [space.pages]
  );

  // Filtrage par recherche
  const filteredPages = useMemo(() => {
    if (!search.trim()) return rootPages;
    const q = search.toLowerCase();
    return space.pages.filter(p => p.title.toLowerCase().includes(q));
  }, [search, rootPages, space.pages]);

  return (
    <div className="mb-1">
      {/* En-tête de l'espace */}
      <div
        className={[
          'flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors group',
          isActive ? 'bg-[#F4F5F7]' : 'hover:bg-[#F4F5F7]',
        ].join(' ')}
        onClick={() => { onSpaceHome(); setExpanded(true); }}
        role="button"
        aria-expanded={expanded}
      >
        <button
          type="button"
          onClick={e => { e.stopPropagation(); setExpanded(prev => !prev); }}
          className="w-4 h-4 flex items-center justify-center text-[#6B778C] flex-shrink-0 hover:text-[#172B4D]"
        >
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>
        <SpaceIcon space={space} size={18} />
        <span className="flex-1 truncate text-[13px] font-semibold text-[#172B4D]">{space.name}</span>
        <button
          type="button"
          onClick={e => { e.stopPropagation(); onNewPage(); }}
          className="opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center rounded text-[#6B778C] hover:bg-[#DFE1E6] hover:text-[#172B4D] transition-all"
          title="Nouvelle page"
          aria-label={`Nouvelle page dans ${space.name}`}
        >
          <Plus size={11} />
        </button>
      </div>

      {/* Contenu de l'espace */}
      {expanded && (
        <div className="pl-2">
          {/* Lien "Accueil de l'espace" */}
          <button
            type="button"
            onClick={onSpaceHome}
            className="flex items-center gap-2 w-full px-2 py-1 text-[12px] text-[#6B778C] hover:text-[#172B4D] hover:bg-[#F4F5F7] rounded transition-colors"
          >
            <Home size={12} />
            Accueil de l'espace
          </button>

          {/* Recherche dans l'espace */}
          {space.pages.length > 5 && (
            <div className="relative px-1 py-1">
              <Search size={11} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8993A4]" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Chercher dans l'espace..."
                className="w-full pl-6 pr-2 py-1 text-[12px] bg-[#F4F5F7] border border-transparent rounded hover:border-[#DFE1E6] focus:border-[#0052CC] focus:bg-white outline-none transition-colors"
              />
            </div>
          )}

          {/* Liste des pages */}
          <div role="tree" aria-label={`Pages de ${space.name}`}>
            {filteredPages.length === 0 ? (
              <p className="px-2 py-2 text-[12px] text-[#8993A4] italic">Aucune page trouvée</p>
            ) : (
              filteredPages.map(page => (
                <PageItem
                  key={page.id}
                  page={page}
                  allPages={search ? [] : space.pages}
                  depth={0}
                  activePageId={activePageId}
                  onSelect={onSelectPage}
                  onNewChild={(parentId) => onNewPage(parentId)}
                />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Composant PageSidebar principal ─────────────────────────────────────────

export function PageSidebar({
  spaces,
  activeSpaceId,
  activePageId,
  onSelectSpace,
  onSelectPage,
  onNewPage,
  onSpaceHome,
}: PageSidebarProps) {

  // Pages récentes (triées par updatedAt, toutes espaces confondus)
  const recentPages = useMemo(() => {
    return spaces
      .flatMap(s => s.pages.map(p => ({ ...p, spaceName: s.name, spaceId: s.id })))
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 5);
  }, [spaces]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Liste des espaces */}
      <div className="flex-1 overflow-y-auto py-2 px-1">
        {spaces.map(space => (
          <SpaceSection
            key={space.id}
            space={space}
            isActive={space.id === activeSpaceId}
            activePageId={activePageId}
            onSelectSpace={() => onSelectSpace(space.id)}
            onSelectPage={onSelectPage}
            onNewPage={(parentId) => onNewPage(space.id, parentId)}
            onSpaceHome={() => onSpaceHome(space.id)}
          />
        ))}

        {spaces.length === 0 && (
          <div className="px-3 py-4 text-center">
            <p className="text-[12px] text-[#8993A4] italic">Aucun espace disponible</p>
          </div>
        )}
      </div>

      {/* Section "Pages récentes" */}
      {recentPages.length > 0 && (
        <div className="border-t border-[#DFE1E6] py-2 px-1 flex-shrink-0">
          <div className="flex items-center gap-1.5 px-2 py-1 mb-1">
            <Clock size={11} className="text-[#8993A4]" />
            <span className="text-[11px] font-semibold text-[#8993A4] uppercase tracking-wider">Récents</span>
          </div>
          {recentPages.map(page => (
            <button
              key={page.id}
              type="button"
              onClick={() => onSelectPage(page.id, page.spaceId)}
              className={[
                'w-full flex items-center gap-2 px-2 py-1 rounded text-left text-[12px] transition-colors',
                activePageId === page.id
                  ? 'bg-[#DEEBFF] text-[#0052CC]'
                  : 'text-[#42526E] hover:bg-[#F4F5F7] hover:text-[#172B4D]',
              ].join(' ')}
            >
              <span className="text-[11px]">{page.emoji || '📄'}</span>
              <span className="truncate flex-1">{page.title}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
