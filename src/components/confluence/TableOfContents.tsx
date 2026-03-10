import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronDown, ChevronRight, List } from 'lucide-react';
import type { Editor } from '@tiptap/react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TocEntry {
  id: string;
  level: number;
  text: string;
  element?: Element;
}

interface TableOfContentsProps {
  editor: Editor | null;
  /** Contenu HTML brut à parser quand l'éditeur n'est pas disponible */
  contentHtml?: string;
  className?: string;
}

// ─── Extraction des titres depuis le DOM de l'éditeur ─────────────────────────

function extractHeadings(editorElement: HTMLElement | null, html?: string): TocEntry[] {
  const entries: TocEntry[] = [];

  // Parsing depuis le DOM de l'éditeur en priorité
  const container = editorElement ?? (() => {
    if (!html) return null;
    const div = document.createElement('div');
    div.innerHTML = html;
    return div;
  })();

  if (!container) return [];

  const headings = container.querySelectorAll('h1, h2, h3');
  headings.forEach((el, i) => {
    const tag = el.tagName.toLowerCase();
    const level = parseInt(tag[1], 10);
    const text = el.textContent?.trim() ?? '';
    if (!text) return;

    // Crée un id stable pour l'ancrage
    const id = `toc-heading-${i}-${text.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}`;
    el.id = id;

    entries.push({ id, level, text, element: el });
  });

  return entries;
}

// ─── Composant TableOfContents ────────────────────────────────────────────────

export function TableOfContents({ editor, contentHtml, className = '' }: TableOfContentsProps) {
  const [entries, setEntries] = useState<TocEntry[]>([]);
  const [activeId, setActiveId] = useState<string>('');
  const [collapsed, setCollapsed] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);

  // Mise à jour des entrées quand le contenu change
  const updateEntries = useCallback(() => {
    const editorEl = document.querySelector('.ProseMirror') as HTMLElement | null;
    const newEntries = extractHeadings(editorEl, contentHtml);
    setEntries(newEntries);
  }, [contentHtml]);

  // Écoute les changements dans l'éditeur TipTap
  useEffect(() => {
    if (!editor) {
      updateEntries();
      return;
    }
    updateEntries();
    editor.on('update', updateEntries);
    return () => { editor.off('update', updateEntries); };
  }, [editor, updateEntries]);

  // IntersectionObserver pour mettre en surbrillance le titre visible
  useEffect(() => {
    if (observerRef.current) observerRef.current.disconnect();

    observerRef.current = new IntersectionObserver(
      (observedEntries) => {
        // Trouve le premier titre visible
        const visible = observedEntries
          .filter(e => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) setActiveId(visible[0].target.id);
      },
      { rootMargin: '-80px 0px -60% 0px', threshold: 0.1 }
    );

    entries.forEach(e => {
      const el = document.getElementById(e.id);
      if (el) observerRef.current!.observe(el);
    });

    return () => observerRef.current?.disconnect();
  }, [entries]);

  // Défilement fluide vers le titre cliqué
  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setActiveId(id);
    }
  };

  if (entries.length === 0) return null;

  return (
    <div className={`confluence-toc ${className}`}>
      {/* En-tête avec toggle */}
      <button
        type="button"
        onClick={() => setCollapsed(prev => !prev)}
        className="confluence-toc__title flex items-center gap-1 w-full text-left hover:text-[#172B4D] transition-colors"
        aria-expanded={!collapsed}
      >
        <List size={12} />
        <span>CONTENU</span>
        {collapsed
          ? <ChevronRight size={10} className="ml-auto" />
          : <ChevronDown size={10} className="ml-auto" />}
      </button>

      {/* Liste des titres */}
      {!collapsed && (
        <nav aria-label="Table des matières">
          {entries.map(entry => (
            <a
              key={entry.id}
              href={`#${entry.id}`}
              onClick={e => { e.preventDefault(); scrollTo(entry.id); }}
              className={[
                'confluence-toc__item',
                entry.level === 2 ? 'confluence-toc__item--h2' : '',
                entry.level === 3 ? 'confluence-toc__item--h3' : '',
                activeId === entry.id ? 'confluence-toc__item--active' : '',
              ].join(' ')}
              aria-current={activeId === entry.id ? 'true' : undefined}
            >
              {entry.text}
            </a>
          ))}
        </nav>
      )}
    </div>
  );
}
