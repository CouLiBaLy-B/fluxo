import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search, X, FileText, CheckSquare, Zap, BookOpen, Bug, Layout, ArrowRight } from 'lucide-react';
import { JiraIssue, ConfluenceSpace, JiraProject } from '../types';

const COLUMNS: { id: string; label: string; color: string }[] = [
  { id: 'backlog',     label: 'Backlog',     color: '#8993A4' },
  { id: 'todo',        label: 'To Do',       color: '#97A0AF' },
  { id: 'in-progress', label: 'In Progress', color: '#0052CC' },
  { id: 'in-review',   label: 'In Review',   color: '#FF8B00' },
  { id: 'done',        label: 'Done',        color: '#00875A' },
];

interface Props {
  issues: JiraIssue[];
  spaces: ConfluenceSpace[];
  projects: JiraProject[];
  onSelectIssue: (issue: JiraIssue) => void;
  onSelectPage: (pageId: string, spaceId: string) => void;
  onSelectProject: (project: JiraProject) => void;
  onClose: () => void;
}

const ISSUE_ICONS: Record<string, React.ReactNode> = {
  epic:    <Zap      size={13} className="text-[#6554C0]" />,
  story:   <BookOpen size={13} className="text-[#00875A]" />,
  task:    <CheckSquare size={13} className="text-[#0052CC]" />,
  bug:     <Bug      size={13} className="text-[#DE350B]" />,
  subtask: <CheckSquare size={13} className="text-[#42526E]" />,
};

type ResultItem =
  | { kind: 'issue'; item: JiraIssue; projectName: string }
  | { kind: 'page'; item: { id: string; title: string; emoji?: string; spaceId: string; spaceName: string; spaceColor: string; updatedAt: string } }
  | { kind: 'project'; item: JiraProject };

export function GlobalSearch({ issues, spaces, projects, onSelectIssue, onSelectPage, onSelectProject, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const results = useMemo((): ResultItem[] => {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    const out: ResultItem[] = [];

    // Projects
    projects.forEach(p => {
      if (p.name.toLowerCase().includes(q) || p.key.toLowerCase().includes(q)) {
        out.push({ kind: 'project', item: p });
      }
    });

    // Issues
    issues.forEach(issue => {
      const proj = projects.find(p => p.id === issue.projectId);
      if (
        issue.title.toLowerCase().includes(q) ||
        issue.key.toLowerCase().includes(q) ||
        issue.description.toLowerCase().includes(q) ||
        issue.labels.some(l => l.toLowerCase().includes(q))
      ) {
        out.push({ kind: 'issue', item: issue, projectName: proj?.name ?? '' });
      }
    });

    // Pages
    spaces.forEach(space => {
      space.pages.forEach(page => {
        if (
          page.title.toLowerCase().includes(q) ||
          page.content.toLowerCase().includes(q) ||
          page.tags.some(t => t.toLowerCase().includes(q))
        ) {
          out.push({
            kind: 'page',
            item: { id: page.id, title: page.title, emoji: page.emoji, spaceId: space.id, spaceName: space.name, spaceColor: space.color, updatedAt: page.updatedAt },
          });
        }
      });
    });

    return out.slice(0, 12);
  }, [query, issues, spaces, projects]);

  useEffect(() => { setSelected(0); }, [results]);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(s => Math.min(s + 1, results.length - 1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)); }
    if (e.key === 'Escape')    { onClose(); }
    if (e.key === 'Enter' && results[selected]) { handleSelect(results[selected]); }
  };

  const handleSelect = (r: ResultItem) => {
    if (r.kind === 'issue')   { onSelectIssue(r.item); onClose(); }
    if (r.kind === 'page')    { onSelectPage(r.item.id, r.item.spaceId); onClose(); }
    if (r.kind === 'project') { onSelectProject(r.item); onClose(); }
  };

  const statusCol = (status: string) => COLUMNS.find(c => c.id === status);

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[12vh] bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-[640px] mx-4 bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        style={{ boxShadow: '0 24px 80px rgba(9,30,66,.40)', maxHeight: '70vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[#DFE1E6]">
          <Search size={18} className="text-[#8993A4] flex-shrink-0" />
          <input
            ref={inputRef}
            className="flex-1 text-[15px] text-[#172B4D] outline-none bg-transparent placeholder-[#8993A4]"
            placeholder="Search issues, pages, projects…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKey}
          />
          {query && (
            <button onClick={() => setQuery('')} className="w-6 h-6 rounded flex items-center justify-center text-[#8993A4] hover:bg-[#F4F5F7]">
              <X size={14} />
            </button>
          )}
          <kbd className="text-[11px] font-semibold text-[#8993A4] bg-[#F4F5F7] border border-[#DFE1E6] rounded px-1.5 py-0.5">ESC</kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="overflow-y-auto flex-1">
          {!query.trim() && (
            <div className="flex flex-col items-center justify-center py-16 text-[#8993A4]">
              <Search size={36} strokeWidth={1.5} className="mb-3" />
              <p className="text-[14px] font-semibold">Search across Jira & Confluence</p>
              <p className="text-[12px] mt-1">Type to search issues, pages, and projects</p>
              <div className="flex items-center gap-4 mt-4 text-[11px]">
                <span className="flex items-center gap-1"><kbd className="bg-[#F4F5F7] border border-[#DFE1E6] rounded px-1.5 py-0.5 font-semibold">↑↓</kbd> navigate</span>
                <span className="flex items-center gap-1"><kbd className="bg-[#F4F5F7] border border-[#DFE1E6] rounded px-1.5 py-0.5 font-semibold">↵</kbd> select</span>
                <span className="flex items-center gap-1"><kbd className="bg-[#F4F5F7] border border-[#DFE1E6] rounded px-1.5 py-0.5 font-semibold">ESC</kbd> close</span>
              </div>
            </div>
          )}

          {query.trim() && results.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-[#8993A4]">
              <p className="text-[14px] font-semibold">No results for "{query}"</p>
              <p className="text-[12px] mt-1">Try a different search term</p>
            </div>
          )}

          {results.length > 0 && (() => {
            const sections: { label: string; items: ResultItem[] }[] = [
              { label: 'Projects', items: results.filter(r => r.kind === 'project') },
              { label: 'Issues',   items: results.filter(r => r.kind === 'issue') },
              { label: 'Pages',    items: results.filter(r => r.kind === 'page') },
            ].filter(s => s.items.length > 0);

            let globalIdx = 0;
            return sections.map(section => (
              <div key={section.label}>
                <div className="px-4 py-2 text-[10px] font-bold text-[#8993A4] uppercase tracking-widest bg-[#FAFBFC] border-b border-[#DFE1E6]">
                  {section.label} · {section.items.length}
                </div>
                {section.items.map(r => {
                  const idx = globalIdx++;
                  const isSelected = idx === selected;

                  if (r.kind === 'project') {
                    return (
                      <button key={r.item.id} onClick={() => handleSelect(r)} onMouseEnter={() => setSelected(idx)}
                        className={['w-full flex items-center gap-3 px-4 py-3 text-left transition-colors', isSelected ? 'bg-[#DEEBFF]' : 'hover:bg-[#F4F5F7]'].join(' ')}>
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-lg flex-shrink-0" style={{ background: `${r.item.color}18` }}>
                          {r.item.emoji}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[13px] font-semibold text-[#172B4D] truncate">{r.item.name}</div>
                          <div className="text-[11px] text-[#8993A4]">{r.item.type} · {r.item.key}</div>
                        </div>
                        <ArrowRight size={13} className="text-[#8993A4] flex-shrink-0" />
                      </button>
                    );
                  }

                  if (r.kind === 'issue') {
                    const col = statusCol(r.item.status);
                    return (
                      <button key={r.item.id} onClick={() => handleSelect(r)} onMouseEnter={() => setSelected(idx)}
                        className={['w-full flex items-center gap-3 px-4 py-3 text-left transition-colors', isSelected ? 'bg-[#DEEBFF]' : 'hover:bg-[#F4F5F7]'].join(' ')}>
                        <div className="flex-shrink-0">{ISSUE_ICONS[r.item.type]}</div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[13px] font-semibold text-[#172B4D] truncate">{r.item.title}</div>
                          <div className="flex items-center gap-2 text-[11px] text-[#8993A4]">
                            <span className="font-mono">{r.item.key}</span>
                            <span>·</span>
                            <span>{r.projectName}</span>
                            {col && <span style={{ color: col.color }}>· {col.label}</span>}
                          </div>
                        </div>
                        <ArrowRight size={13} className="text-[#8993A4] flex-shrink-0" />
                      </button>
                    );
                  }

                  if (r.kind === 'page') {
                    return (
                      <button key={r.item.id} onClick={() => handleSelect(r)} onMouseEnter={() => setSelected(idx)}
                        className={['w-full flex items-center gap-3 px-4 py-3 text-left transition-colors', isSelected ? 'bg-[#DEEBFF]' : 'hover:bg-[#F4F5F7]'].join(' ')}>
                        <span className="text-lg flex-shrink-0">{r.item.emoji ?? '📄'}</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-[13px] font-semibold text-[#172B4D] truncate">{r.item.title}</div>
                          <div className="flex items-center gap-1.5 text-[11px] text-[#8993A4]">
                            <span className="font-semibold" style={{ color: r.item.spaceColor }}>{r.item.spaceName}</span>
                            <span>· Updated {r.item.updatedAt}</span>
                          </div>
                        </div>
                        <FileText size={13} className="text-[#8993A4] flex-shrink-0" />
                      </button>
                    );
                  }

                  return null;
                })}
              </div>
            ));
          })()}
        </div>

        {/* Footer hint */}
        {results.length > 0 && (
          <div className="flex items-center justify-between px-4 py-2 border-t border-[#DFE1E6] bg-[#FAFBFC]">
            <span className="text-[11px] text-[#8993A4]">{results.length} results</span>
            <div className="flex items-center gap-3 text-[11px] text-[#8993A4]">
              <span className="flex items-center gap-1"><Layout size={10} /> Jira</span>
              <span className="flex items-center gap-1"><FileText size={10} /> Confluence</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
