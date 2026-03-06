import React, { useState, useMemo, useRef } from 'react';
import DOMPurify from 'dompurify';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import type { ConfluencePage, ConfluenceSpace, JiraUser } from '../types';
import {
  FileText, ChevronRight, ChevronDown, Edit3, X, Plus, Search,
  Clock, Tag, ThumbsUp, Eye, Save, Home, ArrowLeft, Trash2,
  Bold, Italic, Code, Heading1, Heading2, List, Globe,
  MoreHorizontal, AlertTriangle, Layers,
} from 'lucide-react';

// ─── Markdown Renderer ───────────────────────────────────────────────────────

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function inlineMarkdown(s: string): string {
  return s
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/~~(.+?)~~/g, '<del>$1</del>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, href) => {
      const isExternal = /^https?:\/\//.test(href);
      return `<a href="${href}"${isExternal ? ' target="_blank" rel="noopener noreferrer"' : ''}>${text}</a>`;
    });
}

function parseMarkdown(md: string): string {
  const lines = md.split('\n');
  const out: string[] = [];
  let inCode = false;
  let inTable = false;
  let tableRows: string[] = [];

  const flushTable = () => {
    if (tableRows.length === 0) return;
    out.push('<table>');
    tableRows.forEach((row, idx) => {
      if (row.replace(/[\|\-\s]/g, '') === '') return;
      const cells = row.split('|').filter((_, i, arr) => i > 0 && i < arr.length - 1);
      const tag = idx === 0 ? 'th' : 'td';
      out.push('<tr>' + cells.map(c => `<${tag}>${c.trim()}</${tag}>`).join('') + '</tr>');
    });
    out.push('</table>');
    tableRows = [];
    inTable = false;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('```')) {
      if (inCode) { out.push('</code></pre>'); inCode = false; }
      else { if (inTable) flushTable(); out.push('<pre><code>'); inCode = true; }
      continue;
    }
    if (inCode) { out.push(escapeHtml(line)); continue; }
    if (line.trim().startsWith('|')) { inTable = true; tableRows.push(line); continue; }
    if (inTable) flushTable();
    // Headings must start at column 0
    if (line.startsWith('#### ')) { out.push(`<h4>${inlineMarkdown(line.slice(5))}</h4>`); continue; }
    if (line.startsWith('### '))  { out.push(`<h3>${inlineMarkdown(line.slice(4))}</h3>`); continue; }
    if (line.startsWith('## '))   { out.push(`<h2>${inlineMarkdown(line.slice(3))}</h2>`); continue; }
    if (line.startsWith('# '))    { out.push(`<h1>${inlineMarkdown(line.slice(2))}</h1>`); continue; }
    if (/^---+$/.test(line.trim())) { out.push('<hr>'); continue; }
    // List items — trim leading whitespace so indented items (  - ) are also matched
    const trimmed = line.trimStart();
    if (/^\d+\. /.test(trimmed)) { out.push(`<li class="ol">${inlineMarkdown(trimmed.replace(/^\d+\. /, ''))}</li>`); continue; }
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) { out.push(`<li>${inlineMarkdown(trimmed.slice(2))}</li>`); continue; }
    if (line.trim() === '') { out.push('<br>'); continue; }
    out.push(`<p>${inlineMarkdown(line)}</p>`);
  }
  if (inTable) flushTable();

  return out.join('\n')
    .replace(/(<li class="ol">[\s\S]*?<\/li>\n?)+/g, m => `<ol>${m.replace(/ class="ol"/g, '')}</ol>`)
    .replace(/(<li>[\s\S]*?<\/li>\n?)+/g, m => `<ul>${m}</ul>`)
    .replace(/<br>\n<br>/g, '<br>');
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function relativeDate(dateStr: string) {
  const d = new Date(dateStr);
  const diff = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 30) return `${diff} days ago`;
  return dateStr;
}

// Récupère l'auteur depuis la liste utilisateurs
function getAuthor(users: JiraUser[], authorId: string | null) {
  if (!authorId) return null;
  return users.find(u => u.id === authorId) ?? null;
}

// ─── Space Icon ───────────────────────────────────────────────────────────────

function SpaceIcon({ space, size = 32 }: { space: ConfluenceSpace; size?: number }) {
  return (
    <div
      className="rounded flex items-center justify-center font-bold text-white flex-shrink-0"
      style={{ background: space.color, width: size, height: size, fontSize: size * 0.38 }}
    >
      {space.emoji}
    </div>
  );
}

// ─── Editor Toolbar ───────────────────────────────────────────────────────────

function EditorToolbar({ textareaRef, value, onChange }: {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (v: string) => void;
}) {
  const wrap = (prefix: string, suffix: string, sample: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end   = ta.selectionEnd;
    const sel   = value.slice(start, end) || sample;
    const next  = value.slice(0, start) + prefix + sel + suffix + value.slice(end);
    onChange(next);
    setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(start + prefix.length, start + prefix.length + sel.length);
    }, 0);
  };

  const insertLine = (prefix: string, sample: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    const next = value.slice(0, lineStart) + prefix + value.slice(lineStart);
    onChange(next);
    setTimeout(() => { ta.focus(); ta.setSelectionRange(lineStart + prefix.length, lineStart + prefix.length + sample.length); }, 0);
  };

  const tools: { icon: React.ReactNode; title: string; action: () => void }[] = [
    { icon: <Bold size={13} />,     title: 'Bold (Cmd+B)',    action: () => wrap('**', '**', 'bold text') },
    { icon: <Italic size={13} />,   title: 'Italic (Cmd+I)',  action: () => wrap('*', '*', 'italic text') },
    { icon: <Code size={13} />,     title: 'Inline code',     action: () => wrap('`', '`', 'code') },
    { icon: <Heading1 size={13} />, title: 'Heading 1',       action: () => insertLine('# ', 'Heading') },
    { icon: <Heading2 size={13} />, title: 'Heading 2',       action: () => insertLine('## ', 'Heading') },
    { icon: <List size={13} />,     title: 'Bullet list',     action: () => insertLine('- ', 'List item') },
  ];

  return (
    <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-[#DFE1E6] bg-[#FAFBFC]">
      {tools.map((t, i) => (
        <button
          key={i}
          type="button"
          title={t.title}
          onClick={t.action}
          className="w-7 h-7 rounded flex items-center justify-center text-[#42526E] hover:bg-[#DFE1E6] hover:text-[#172B4D] transition-colors"
        >
          {t.icon}
        </button>
      ))}
      <div className="w-px h-4 bg-[#DFE1E6] mx-1" />
      <span className="text-[10px] text-[#8993A4] font-medium ml-1">Markdown supported</span>
    </div>
  );
}

// ─── Create Space Modal ───────────────────────────────────────────────────────

const SPACE_COLORS = ['#0052CC','#6554C0','#00875A','#DE350B','#FF8B00','#0747A6'];
const SPACE_EMOJIS = ['⚙️','🧭','📚','🎯','💡','🔬','🌐','🛠️','📊','🎨'];

function CreateSpaceModal({ onSave, onClose, existingKeys }: {
  onSave: (data: { key: string; name: string; description: string; emoji: string; color: string }) => void;
  onClose: () => void;
  existingKeys: string[];
}) {
  const [name, setName]   = useState('');
  const [key, setKey]     = useState('');
  const [desc, setDesc]   = useState('');
  const [emoji, setEmoji] = useState(SPACE_EMOJIS[0]);
  const [color, setColor] = useState(SPACE_COLORS[0]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [keyTouched, setKeyTouched] = useState(false);

  const autoKey = (n: string) => n.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5) || '';

  const handleNameChange = (n: string) => {
    setName(n);
    if (!keyTouched) setKey(autoKey(n));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = 'Name is required';
    if (!key.trim())  errs.key  = 'Key is required';
    if (existingKeys.includes(key)) errs.key = 'Key already in use';
    if (Object.keys(errs).length) { setErrors(errs); return; }
    onSave({ key: key.trim(), name: name.trim(), description: desc.trim(), emoji, color });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg mx-4 overflow-hidden" style={{ boxShadow: '0 24px 64px rgba(9,30,66,.32)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-5 border-b border-[#DFE1E6]">
          <h2 className="text-[18px] font-bold text-[#172B4D]">Create Space</h2>
          <button onClick={onClose} className="w-8 h-8 rounded flex items-center justify-center text-[#42526E] hover:bg-[#F4F5F7]"><X size={15} /></button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 flex flex-col gap-5">
          {/* Emoji + Color */}
          <div className="flex gap-5">
            <div className="flex-1">
              <label className="block text-[11px] font-semibold text-[#42526E] uppercase tracking-wider mb-2">Icon</label>
              <div className="flex flex-wrap gap-1.5">
                {SPACE_EMOJIS.map(e => (
                  <button key={e} type="button" onClick={() => setEmoji(e)}
                    className={['w-9 h-9 rounded-lg text-xl flex items-center justify-center border-2 transition-all',
                      emoji === e ? 'border-[#0052CC] bg-[#DEEBFF]' : 'border-transparent hover:border-[#DFE1E6]'].join(' ')}>
                    {e}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#42526E] uppercase tracking-wider mb-2">Color</label>
              <div className="flex flex-wrap gap-1.5">
                {SPACE_COLORS.map(c => (
                  <button key={c} type="button" onClick={() => setColor(c)}
                    style={{ background: c }}
                    className={['w-7 h-7 rounded-full border-2 transition-all', color === c ? 'border-[#172B4D] scale-110' : 'border-transparent hover:scale-105'].join(' ')} />
                ))}
              </div>
            </div>
          </div>

          {/* Preview */}
          <div className="flex items-center gap-3 p-3 bg-[#F4F5F7] rounded-lg">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center text-xl text-white" style={{ background: color }}>{emoji}</div>
            <div>
              <div className="text-[14px] font-bold text-[#172B4D]">{name || 'Space Name'}</div>
              <div className="text-[11px] font-bold text-[#8993A4] uppercase">{key || 'KEY'}</div>
            </div>
          </div>

          {/* Name + Key */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-[#42526E] uppercase tracking-wider mb-1.5">Space Name *</label>
              <input className={`atl-input text-[14px] ${errors.name ? 'border-[#DE350B]' : ''}`} value={name} onChange={e => handleNameChange(e.target.value)} placeholder="e.g. Engineering" autoFocus />
              {errors.name && <p className="text-[11px] text-[#DE350B] mt-1">{errors.name}</p>}
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#42526E] uppercase tracking-wider mb-1.5">Space Key *</label>
              <input className={`atl-input text-[14px] font-mono uppercase ${errors.key ? 'border-[#DE350B]' : ''}`}
                value={key}
                onChange={e => { setKey(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)); setKeyTouched(true); }}
                placeholder="ENG" />
              {errors.key && <p className="text-[11px] text-[#DE350B] mt-1">{errors.key}</p>}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-[11px] font-semibold text-[#42526E] uppercase tracking-wider mb-1.5">Description</label>
            <textarea className="atl-input resize-none text-[14px]" rows={2} value={desc} onChange={e => setDesc(e.target.value)} placeholder="What is this space about?" />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#DFE1E6]">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary">Create Space</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface Props {
  spaces?: ConfluenceSpace[];           // Peut venir de App.tsx (optionnel)
  setSpaces?: React.Dispatch<React.SetStateAction<ConfluenceSpace[]>>;
  initialPageTarget?: { pageId: string; spaceId: string } | null;
  onPageTargetConsumed?: () => void;
}

export function ConfluenceWiki({ initialPageTarget, onPageTargetConsumed }: Props) {
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();

  // ── Requêtes ──────────────────────────────────────────────────────────────

  const { data: spaces = [] } = useQuery({
    queryKey: ['confluence-spaces'],
    queryFn:  api.confluence.spaces,
  });

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn:  api.users.list,
  });

  const invalidateSpaces = () => queryClient.invalidateQueries({ queryKey: ['confluence-spaces'] });

  // ── Mutations ─────────────────────────────────────────────────────────────

  const createSpaceMutation = useMutation({
    mutationFn: (data: { key: string; name: string; description?: string; emoji?: string; color?: string }) =>
      api.confluence.createSpace(data),
    onSuccess:  (space) => { invalidateSpaces(); setSelectedSpaceId(space.id); },
  });

  const deleteSpaceMutation = useMutation({
    mutationFn: (id: string) => api.confluence.deleteSpace(id),
    onSuccess:  () => { invalidateSpaces(); setSelectedSpaceId(null); setSelectedPageId(null); },
  });

  const createPageMutation = useMutation({
    mutationFn: ({ spaceKey, data }: {
      spaceKey: string;
      data: { title: string; content?: string; tags?: string[]; emoji?: string };
    }) => api.confluence.createPage(spaceKey, data),
    onSuccess:  (page) => {
      invalidateSpaces();
      setSelectedPageId(page.id);
      setEditTitle(page.title);
      setEditContent(page.content);
      setEditing(true);
      setShowCreate(false);
      setNewPageTitle('');
    },
  });

  const updatePageMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<ConfluencePage> }) =>
      api.confluence.updatePage(id, data),
    onSuccess:  () => { invalidateSpaces(); setEditing(false); },
  });

  const deletePageMutation = useMutation({
    mutationFn: (id: string) => api.confluence.deletePage(id),
    onSuccess:  (_, id) => {
      invalidateSpaces();
      if (selectedPageId === id) { setSelectedPageId(null); setEditing(false); }
      setDeletePageConfirm(null);
    },
  });

  const likePageMutation = useMutation({
    mutationFn: (id: string) => api.confluence.likePage(id),
    onSuccess:  () => invalidateSpaces(),
  });

  // ── État local ────────────────────────────────────────────────────────────

  const [selectedSpaceId, setSelectedSpaceId] = useState<string | null>(initialPageTarget?.spaceId ?? null);
  const [selectedPageId, setSelectedPageId]   = useState<string | null>(initialPageTarget?.pageId ?? null);

  // Consommer la cible initiale une seule fois
  React.useEffect(() => {
    if (initialPageTarget) onPageTargetConsumed?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [expandedSpaces, setExpandedSpaces]   = useState<Set<string>>(new Set());
  const [editing, setEditing]                 = useState(false);
  const [editTitle, setEditTitle]             = useState('');
  const [editContent, setEditContent]         = useState('');
  const [search, setSearch]                   = useState('');
  const [showCreate, setShowCreate]           = useState(false);
  const [showCreateSpace, setShowCreateSpace] = useState(false);
  const [newPageTitle, setNewPageTitle]       = useState('');
  const [pageMenuOpen, setPageMenuOpen]       = useState<string | null>(null);
  const [spaceMenuOpen, setSpaceMenuOpen]     = useState<string | null>(null);
  const [deleteSpaceConfirm, setDeleteSpaceConfirm] = useState<string | null>(null);
  const [deletePageConfirm, setDeletePageConfirm]   = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const selectedSpace = spaces.find(s => s.id === selectedSpaceId) ?? null;
  const selectedPage  = spaces.flatMap(s => s.pages).find(p => p.id === selectedPageId) ?? null;

  const allPages = useMemo(() =>
    spaces.flatMap(s => s.pages.map(p => ({ ...p, spaceName: s.name, spaceColor: s.color, spaceEmoji: s.emoji, spaceId: s.id }))),
    [spaces]
  );

  const searchResults = useMemo(() => {
    if (!search.trim()) return null;
    const q = search.toLowerCase();
    return allPages.filter(p =>
      p.title.toLowerCase().includes(q) ||
      p.content.toLowerCase().includes(q) ||
      p.tags.some(t => t.toLowerCase().includes(q))
    );
  }, [search, allPages]);

  const toggleSpace = (id: string) => {
    setExpandedSpaces(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const openPage = (page: ConfluencePage & { spaceId?: string }) => {
    const sid = page.spaceId ?? spaces.find(s => s.key === page.spaceKey)?.id ?? null;
    setSelectedPageId(page.id);
    setSelectedSpaceId(sid);
    setEditing(false);
    setSearch('');
    // Incrémenter les vues (non-bloquant)
    api.confluence.getPage(page.id).catch(() => {});
  };

  const openSpace = (space: ConfluenceSpace) => {
    setSelectedSpaceId(space.id);
    setSelectedPageId(null);
    setEditing(false);
  };

  const saveEdit = () => {
    if (!selectedPage) return;
    updatePageMutation.mutate({ id: selectedPage.id, data: { title: editTitle, content: editContent } });
  };

  const createPage = () => {
    if (!newPageTitle.trim() || !selectedSpace) return;
    createPageMutation.mutate({
      spaceKey: selectedSpace.key,
      data: {
        title:   newPageTitle.trim(),
        content: `# ${newPageTitle.trim()}\n\nStart writing your content here...`,
        emoji:   '📄',
        tags:    [],
      },
    });
  };

  const currentSpacePages = selectedSpace?.pages ?? [];

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="h-full flex min-h-0">
      {/* ── Sidebar ──────────────────────────────────────────────────── */}
      <div className="w-[240px] flex-shrink-0 flex flex-col border-r border-[#DFE1E6] bg-[#FAFBFC] overflow-y-auto">
        {/* Recherche */}
        <div className="p-3 border-b border-[#DFE1E6]">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#8993A4]" />
            <input className="atl-input pl-8 text-[13px] h-8 w-full" placeholder="Search pages..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>

        {/* Résultats de recherche */}
        {searchResults ? (
          <div className="flex-1 overflow-y-auto">
            <div className="px-3 py-2 text-[10px] font-semibold text-[#8993A4] uppercase tracking-wider">{searchResults.length} results</div>
            {searchResults.length === 0 ? (
              <div className="px-3 py-6 text-center text-[13px] text-[#8993A4]">No pages found</div>
            ) : searchResults.map(p => (
              <button key={p.id} onClick={() => openPage(p)} className="w-full flex items-start gap-2 px-3 py-2.5 hover:bg-[#EBECF0] transition-colors text-left">
                <span className="text-base mt-0.5 flex-shrink-0">{p.emoji ?? '📄'}</span>
                <div>
                  <div className="text-[13px] font-medium text-[#172B4D] leading-snug line-clamp-1">{p.title}</div>
                  <div className="text-[11px] text-[#8993A4] mt-0.5">{p.spaceName}</div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <>
            {/* Accueil */}
            <button
              onClick={() => { setSelectedSpaceId(null); setSelectedPageId(null); setEditing(false); }}
              className="flex items-center gap-2.5 px-3 py-2 text-[13px] font-medium text-[#42526E] hover:bg-[#EBECF0] transition-colors w-full"
            >
              <Home size={15} className="flex-shrink-0" /> Home
            </button>

            <div className="flex items-center justify-between px-3 pt-3 pb-1">
              <span className="text-[10px] font-semibold text-[#8993A4] uppercase tracking-wider">Spaces</span>
              <button onClick={() => setShowCreateSpace(true)} title="Create Space" className="w-5 h-5 flex items-center justify-center text-[#8993A4] hover:text-[#0052CC] hover:bg-[#DEEBFF] rounded transition-colors">
                <Plus size={12} />
              </button>
            </div>

            {/* Arbre des espaces */}
            {spaces.map(space => {
              const isExpanded      = expandedSpaces.has(space.id);
              const isSelectedSpace = selectedSpaceId === space.id;
              return (
                <div key={space.id}>
                  <div className={`flex items-center gap-0.5 group ${isSelectedSpace && !selectedPageId ? 'bg-[#DEEBFF]' : ''}`}>
                    <button onClick={() => toggleSpace(space.id)} className="p-1.5 text-[#42526E] hover:bg-[#EBECF0] transition-colors flex-shrink-0 rounded">
                      {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    </button>
                    <button onClick={() => { openSpace(space); if (!isExpanded) toggleSpace(space.id); }}
                      className="flex-1 flex items-center gap-2 py-1.5 pr-1 text-left hover:bg-[#EBECF0] transition-colors rounded min-w-0">
                      <span className="text-sm flex-shrink-0">{space.emoji}</span>
                      <span className={`text-[13px] font-semibold truncate ${isSelectedSpace ? 'text-[#0052CC]' : 'text-[#172B4D]'}`}>{space.name}</span>
                    </button>
                    <div className="relative flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={(e) => { e.stopPropagation(); setSpaceMenuOpen(spaceMenuOpen === space.id ? null : space.id); }}
                        className="w-6 h-6 mr-1 flex items-center justify-center text-[#8993A4] hover:bg-[#EBECF0] rounded transition-colors">
                        <MoreHorizontal size={11} />
                      </button>
                      {spaceMenuOpen === space.id && (
                        <div className="absolute right-0 top-full mt-1 bg-white rounded-lg border border-[#DFE1E6] z-30 overflow-hidden" style={{ boxShadow: '0 4px 16px rgba(9,30,66,.16)', minWidth: 140 }}>
                          <button onClick={() => { setShowCreate(true); setSelectedSpaceId(space.id); setSpaceMenuOpen(null); }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-[#172B4D] hover:bg-[#F4F5F7] transition-colors">
                            <Plus size={12} /> New Page
                          </button>
                          <button onClick={() => { setDeleteSpaceConfirm(space.id); setSpaceMenuOpen(null); }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-[#DE350B] hover:bg-[#FFEBE6] transition-colors">
                            <Trash2 size={12} /> Delete Space
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="ml-7">
                      {space.pages.map(page => {
                        const isSelected = selectedPageId === page.id;
                        return (
                          <div key={page.id} className={`flex items-center group ${isSelected ? 'bg-[#DEEBFF]' : ''}`}>
                            <button onClick={() => openPage(page)}
                              className={['flex-1 flex items-center gap-2 px-2 py-1.5 text-left rounded transition-colors min-w-0',
                                isSelected ? 'text-[#0052CC]' : 'text-[#42526E] hover:bg-[#EBECF0]'].join(' ')}>
                              <span className="text-xs flex-shrink-0">{page.emoji ?? '📄'}</span>
                              <span className="text-[12px] font-medium truncate">{page.title}</span>
                            </button>
                            <div className="relative flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button onClick={(e) => { e.stopPropagation(); setPageMenuOpen(pageMenuOpen === page.id ? null : page.id); }}
                                className="w-5 h-5 mr-1 flex items-center justify-center text-[#8993A4] hover:bg-[#EBECF0] rounded transition-colors">
                                <MoreHorizontal size={10} />
                              </button>
                              {pageMenuOpen === page.id && (
                                <div className="absolute right-0 top-full mt-1 bg-white rounded-lg border border-[#DFE1E6] z-30 overflow-hidden" style={{ boxShadow: '0 4px 16px rgba(9,30,66,.16)', minWidth: 130 }}>
                                  <button onClick={() => { openPage(page); setEditTitle(page.title); setEditContent(page.content); setEditing(true); setPageMenuOpen(null); }}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-[#172B4D] hover:bg-[#F4F5F7] transition-colors">
                                    <Edit3 size={11} /> Edit
                                  </button>
                                  <button onClick={() => { setDeletePageConfirm(page.id); setPageMenuOpen(null); }}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-[#DE350B] hover:bg-[#FFEBE6] transition-colors">
                                    <Trash2 size={11} /> Delete
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                      {space.pages.length === 0 && (
                        <div className="px-2 py-2 text-[11px] text-[#8993A4]">No pages yet</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {spaces.length === 0 && (
              <div className="flex flex-col items-center justify-center py-8 text-[#8993A4] px-3">
                <Layers size={24} strokeWidth={1.5} className="mb-2" />
                <p className="text-[12px] text-center">No spaces yet.<br />Create your first space!</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Main Content ──────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden" onClick={() => { setPageMenuOpen(null); setSpaceMenuOpen(null); }}>

        {/* ── Vue accueil ── */}
        {!selectedSpaceId && !selectedPageId && (
          <div className="flex-1 overflow-y-auto p-8">
            <div className="flex items-center justify-between mb-2">
              <h1 className="text-[24px] font-bold text-[#172B4D]">Your Confluence</h1>
              <button onClick={() => setShowCreateSpace(true)} className="btn-primary gap-2">
                <Plus size={14} /> New Space
              </button>
            </div>
            <p className="text-[14px] text-[#42526E] mb-8">Browse spaces and pages across your organization.</p>

            {spaces.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <div className="w-20 h-20 rounded-2xl bg-[#DEEBFF] flex items-center justify-center mb-4">
                  <Globe size={36} className="text-[#0052CC]" />
                </div>
                <h3 className="text-[18px] font-bold text-[#172B4D] mb-2">No spaces yet</h3>
                <p className="text-[14px] text-[#42526E] mb-6 max-w-xs">Create your first space to start organizing knowledge.</p>
                <button onClick={() => setShowCreateSpace(true)} className="btn-primary gap-2"><Plus size={14} /> Create first space</button>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
                  {spaces.map(space => (
                    <button key={space.id} onClick={() => openSpace(space)}
                      className="bg-white rounded-lg border border-[#DFE1E6] p-5 text-left hover:border-[#0052CC] hover:shadow-md transition-all group"
                      style={{ boxShadow: '0 1px 2px rgba(9,30,66,.08)' }}>
                      <div className="flex items-center gap-3 mb-3">
                        <SpaceIcon space={space} size={40} />
                        <div>
                          <h3 className="text-[15px] font-bold text-[#172B4D] group-hover:text-[#0052CC] transition-colors">{space.name}</h3>
                          <span className="text-[11px] font-semibold text-[#8993A4] uppercase">{space.key}</span>
                        </div>
                      </div>
                      <p className="text-[13px] text-[#42526E] leading-relaxed mb-3 line-clamp-2">{space.description}</p>
                      <div className="flex items-center gap-3 text-[11px] text-[#8993A4]">
                        <span className="flex items-center gap-1"><FileText size={11} /> {space.pages.length} pages</span>
                        <span className="flex items-center gap-1"><Eye size={11} /> {space.pages.reduce((a, p) => a + p.views, 0)} views</span>
                      </div>
                    </button>
                  ))}

                  {/* Tuile créer espace */}
                  <button onClick={() => setShowCreateSpace(true)}
                    className="bg-white rounded-lg border-2 border-dashed border-[#DFE1E6] p-5 flex flex-col items-center justify-center gap-2 text-[#8993A4] hover:border-[#0052CC] hover:text-[#0052CC] hover:bg-[#F4F8FF] transition-all min-h-[140px]">
                    <div className="w-10 h-10 rounded-full border-2 border-current flex items-center justify-center">
                      <Plus size={18} />
                    </div>
                    <span className="text-[13px] font-semibold">New Space</span>
                  </button>
                </div>

                {/* Récemment mis à jour */}
                <div>
                  <h2 className="text-[16px] font-bold text-[#172B4D] mb-4">Recently Updated</h2>
                  <div className="bg-white rounded-lg border border-[#DFE1E6] divide-y divide-[#DFE1E6]" style={{ boxShadow: '0 1px 2px rgba(9,30,66,.08)' }}>
                    {allPages.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 8).map(page => {
                      const author = getAuthor(users, page.authorId);
                      return (
                        <button key={page.id} onClick={() => openPage(page)}
                          className="w-full flex items-center gap-4 px-5 py-3.5 hover:bg-[#F4F5F7] transition-colors text-left">
                          <span className="text-xl flex-shrink-0">{page.emoji ?? '📄'}</span>
                          <div className="flex-1 min-w-0">
                            <div className="text-[14px] font-semibold text-[#172B4D] leading-snug truncate">{page.title}</div>
                            <div className="flex items-center gap-2 mt-0.5">
                              {author && <span className="text-[11px] text-[#42526E]">{author.name}</span>}
                              <span className="text-[11px] text-[#8993A4]">·</span>
                              <span className="text-[11px] text-[#8993A4]">{relativeDate(page.updatedAt)}</span>
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: `${page.spaceColor}22`, color: page.spaceColor }}>
                                {page.spaceEmoji} {page.spaceName}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 text-[11px] text-[#8993A4] flex-shrink-0">
                            <span className="flex items-center gap-1"><ThumbsUp size={11} /> {page.likes}</span>
                            <span className="flex items-center gap-1"><Eye size={11} /> {page.views}</span>
                          </div>
                        </button>
                      );
                    })}
                    {allPages.length === 0 && (
                      <div className="py-10 text-center text-[#8993A4] text-[13px]">No pages yet. Create a page in a space to see it here.</div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Vue espace ── */}
        {selectedSpaceId && !selectedPageId && selectedSpace && (
          <div className="flex-1 overflow-y-auto">
            <div className="px-8 py-8 text-white" style={{ background: `linear-gradient(135deg, ${selectedSpace.color}, ${selectedSpace.color}cc)` }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-xl bg-white/20 flex items-center justify-center text-2xl">{selectedSpace.emoji}</div>
                  <div>
                    <h1 className="text-[24px] font-bold">{selectedSpace.name}</h1>
                    <p className="text-white/70 text-[13px] mt-0.5">{selectedSpace.key} · {selectedSpace.pages.length} pages</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setShowCreate(true)}
                    className="flex items-center gap-1.5 px-4 py-2 bg-white text-[13px] font-semibold rounded transition-colors" style={{ color: selectedSpace.color }}>
                    <Plus size={14} /> New Page
                  </button>
                  <button onClick={() => setDeleteSpaceConfirm(selectedSpace.id)}
                    className="flex items-center gap-1.5 px-3 py-2 bg-white/20 text-white text-[13px] font-semibold rounded hover:bg-white/30 transition-colors">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              <p className="mt-4 text-white/80 text-[14px]">{selectedSpace.description}</p>
            </div>

            <div className="p-6">
              <h2 className="text-[14px] font-bold text-[#172B4D] mb-4 uppercase tracking-wide">Pages</h2>
              {currentSpacePages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-[#8993A4]">
                  <FileText size={40} strokeWidth={1.5} className="mb-3" />
                  <p className="text-[15px] font-semibold mb-1">No pages yet</p>
                  <p className="text-[13px] mb-4">Create the first page in this space.</p>
                  <button onClick={() => setShowCreate(true)} className="btn-primary gap-1.5"><Plus size={14} /> Create Page</button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                  {currentSpacePages.map(page => {
                    const author = getAuthor(users, page.authorId);
                    return (
                      <div key={page.id} className="relative group">
                        <button onClick={() => openPage(page)}
                          className="w-full bg-white rounded-lg border border-[#DFE1E6] p-4 text-left hover:border-[#0052CC] hover:shadow-md transition-all"
                          style={{ boxShadow: '0 1px 2px rgba(9,30,66,.08)' }}>
                          <div className="flex items-start gap-3">
                            <span className="text-2xl flex-shrink-0 mt-0.5">{page.emoji ?? '📄'}</span>
                            <div className="flex-1 min-w-0">
                              <h3 className="text-[14px] font-semibold text-[#172B4D] group-hover:text-[#0052CC] transition-colors line-clamp-2 leading-snug pr-6">{page.title}</h3>
                              <div className="flex items-center gap-1.5 mt-2 text-[11px] text-[#8993A4]">
                                {author && (
                                  <>
                                    <div className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold text-white" style={{ background: author.color }}>{author.avatar}</div>
                                    <span>{author.name.split(' ')[0]}</span>
                                    <span>·</span>
                                  </>
                                )}
                                <Clock size={9} />
                                <span>{relativeDate(page.updatedAt)}</span>
                              </div>
                              {page.tags.length > 0 && (
                                <div className="flex gap-1 mt-2 flex-wrap">
                                  {page.tags.slice(0, 3).map(t => <span key={t} className="text-[10px] bg-[#F4F5F7] text-[#42526E] px-1.5 py-0.5 rounded">{t}</span>)}
                                </div>
                              )}
                            </div>
                          </div>
                        </button>
                        <button
                          onClick={() => setDeletePageConfirm(page.id)}
                          className="absolute top-2 right-2 w-6 h-6 rounded flex items-center justify-center text-[#DE350B] bg-[#FFEBE6] opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    );
                  })}
                  <button onClick={() => setShowCreate(true)}
                    className="bg-white rounded-lg border-2 border-dashed border-[#DFE1E6] p-4 flex items-center justify-center gap-2 text-[#8993A4] hover:border-[#0052CC] hover:text-[#0052CC] hover:bg-[#F4F8FF] transition-all">
                    <Plus size={16} />
                    <span className="text-[14px] font-semibold">New Page</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Vue page (lecture / édition) ── */}
        {selectedPageId && selectedPage && (
          <div className="flex-1 flex flex-col min-h-0">
            {/* Barre d'outils */}
            <div className="flex-shrink-0 flex items-center justify-between px-6 py-3 border-b border-[#DFE1E6] bg-white">
              <div className="flex items-center gap-1.5 text-[13px] text-[#42526E] min-w-0">
                <button onClick={() => setSelectedPageId(null)} className="hover:text-[#0052CC] font-medium transition-colors flex-shrink-0"><ArrowLeft size={14} /></button>
                {selectedSpace && (
                  <>
                    <button onClick={() => openSpace(selectedSpace)} className="hover:text-[#0052CC] font-medium transition-colors truncate flex items-center gap-1">
                      <span>{selectedSpace.emoji}</span><span>{selectedSpace.name}</span>
                    </button>
                    <ChevronRight size={12} className="flex-shrink-0 text-[#8993A4]" />
                  </>
                )}
                <span className="font-semibold text-[#172B4D] truncate">{selectedPage.title}</span>
              </div>

              <div className="flex items-center gap-1 flex-shrink-0 ml-4">
                {editing ? (
                  <>
                    <button onClick={() => setEditing(false)} className="btn-subtle text-[12px] py-1 px-2.5"><X size={13} /> Discard</button>
                    <button onClick={saveEdit} disabled={updatePageMutation.isPending} className="btn-primary text-[12px] py-1 px-2.5">
                      <Save size={13} /> {updatePageMutation.isPending ? 'Saving…' : 'Save'}
                    </button>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-3 mr-3 text-[12px] text-[#8993A4]">
                      <button onClick={() => likePageMutation.mutate(selectedPage.id)}
                        className="flex items-center gap-1 transition-colors hover:text-[#0052CC]">
                        <ThumbsUp size={12} />
                        {selectedPage.likes}
                      </button>
                      <span className="flex items-center gap-1"><Eye size={12} /> {selectedPage.views}</span>
                    </div>
                    <button onClick={() => { setEditTitle(selectedPage.title); setEditContent(selectedPage.content); setEditing(true); }} className="btn-secondary text-[12px] py-1 px-2.5"><Edit3 size={13} /> Edit</button>
                    <button onClick={() => setDeletePageConfirm(selectedPage.id)}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[12px] font-semibold text-[#DE350B] hover:bg-[#FFEBE6] transition-colors">
                      <Trash2 size={12} />
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {editing ? (
                <div className="max-w-[760px] mx-auto px-8 py-8 h-full flex flex-col">
                  <input
                    className="text-[28px] font-bold text-[#172B4D] outline-none border-none bg-transparent w-full mb-4 leading-tight"
                    value={editTitle}
                    onChange={e => setEditTitle(e.target.value)}
                    placeholder="Page title"
                  />
                  <div className="border border-[#DFE1E6] rounded-lg flex-1 flex flex-col overflow-hidden">
                    <EditorToolbar textareaRef={textareaRef} value={editContent} onChange={setEditContent} />
                    <textarea
                      ref={textareaRef}
                      className="flex-1 w-full font-mono text-[13px] text-[#172B4D] leading-relaxed outline-none border-none bg-transparent resize-none p-4"
                      value={editContent}
                      onChange={e => setEditContent(e.target.value)}
                      placeholder="Start writing in Markdown..."
                      onKeyDown={e => { if (e.key === 'Enter' && e.metaKey) saveEdit(); }}
                    />
                  </div>
                </div>
              ) : (
                <div className="max-w-[760px] mx-auto px-8 py-8">
                  <div className="flex items-center gap-3 mb-6">
                    {selectedSpace && (
                      <span className="text-[11px] font-semibold px-2 py-1 rounded" style={{ background: `${selectedSpace.color}22`, color: selectedSpace.color }}>
                        {selectedSpace.emoji} {selectedSpace.name}
                      </span>
                    )}
                    {selectedPage.tags.map(tag => (
                      <span key={tag} className="flex items-center gap-1 text-[11px] bg-[#F4F5F7] text-[#42526E] px-1.5 py-0.5 rounded">
                        <Tag size={9} /> {tag}
                      </span>
                    ))}
                  </div>

                  <div className="flex items-center gap-3 mb-8 pb-6 border-b border-[#DFE1E6]">
                    {(() => {
                      const author = getAuthor(users, selectedPage.authorId);
                      if (!author && !currentUser) return null;
                      const displayUser = author ?? currentUser;
                      return displayUser ? (
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white"
                            style={{ background: displayUser.color }}>{displayUser.avatar}</div>
                          <div>
                            <div className="text-[13px] font-semibold text-[#172B4D]">{displayUser.name}</div>
                            <div className="text-[11px] text-[#8993A4]">
                              Created {relativeDate(selectedPage.createdAt)} · Updated {relativeDate(selectedPage.updatedAt)}
                            </div>
                          </div>
                        </div>
                      ) : null;
                    })()}
                  </div>

                  {/* DOMPurify pour prévenir les XSS dans le contenu Markdown rendu */}
                  <div className="confluence-content"
                    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(parseMarkdown(selectedPage.content)) }}
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Modals ── */}

      {/* Créer une page */}
      {showCreate && selectedSpace && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-lg w-full max-w-md mx-4 overflow-hidden" style={{ boxShadow: '0 20px 60px rgba(9,30,66,.32)' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#DFE1E6]">
              <h2 className="text-[15px] font-bold text-[#172B4D]">Create Page</h2>
              <button onClick={() => setShowCreate(false)} className="w-8 h-8 rounded flex items-center justify-center text-[#42526E] hover:bg-[#F4F5F7]"><X size={14} /></button>
            </div>
            <div className="px-5 py-5">
              <div className="mb-4">
                <label className="block text-[11px] font-semibold text-[#42526E] uppercase tracking-wider mb-1.5">Space</label>
                <div className="flex items-center gap-2 text-[13px] text-[#172B4D]">
                  <span>{selectedSpace.emoji}</span><span className="font-semibold">{selectedSpace.name}</span>
                </div>
              </div>
              <div className="mb-5">
                <label className="block text-[11px] font-semibold text-[#42526E] uppercase tracking-wider mb-1.5">Page Title *</label>
                <input className="atl-input text-[14px]" placeholder="Give your page a title..." value={newPageTitle}
                  onChange={e => setNewPageTitle(e.target.value)} onKeyDown={e => e.key === 'Enter' && createPage()} autoFocus />
              </div>
              {createPageMutation.error && (
                <p className="text-[12px] text-[#DE350B] mb-3">{(createPageMutation.error as Error).message}</p>
              )}
              <div className="flex items-center justify-end gap-2">
                <button onClick={() => setShowCreate(false)} className="btn-secondary">Cancel</button>
                <button onClick={createPage} disabled={!newPageTitle.trim() || createPageMutation.isPending} className="btn-primary">
                  {createPageMutation.isPending ? 'Creating…' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Créer un espace */}
      {showCreateSpace && (
        <CreateSpaceModal
          existingKeys={spaces.map(s => s.key)}
          onSave={data => { createSpaceMutation.mutate(data); setShowCreateSpace(false); }}
          onClose={() => setShowCreateSpace(false)}
        />
      )}

      {/* Confirmation suppression espace */}
      {deleteSpaceConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl w-full max-w-sm mx-4 p-6 text-center" style={{ boxShadow: '0 20px 60px rgba(9,30,66,.32)' }}>
            <div className="w-12 h-12 rounded-full bg-[#FFEBE6] flex items-center justify-center mx-auto mb-4"><AlertTriangle size={22} className="text-[#DE350B]" /></div>
            <h3 className="text-[16px] font-bold text-[#172B4D] mb-2">Delete Space?</h3>
            <p className="text-[13px] text-[#42526E] mb-6">This will permanently delete the space and all its pages. This action cannot be undone.</p>
            <div className="flex items-center justify-center gap-3">
              <button onClick={() => setDeleteSpaceConfirm(null)} className="btn-secondary">Cancel</button>
              <button onClick={() => { deleteSpaceMutation.mutate(deleteSpaceConfirm); setDeleteSpaceConfirm(null); }}
                disabled={deleteSpaceMutation.isPending}
                className="px-4 py-2 rounded text-[13px] font-semibold bg-[#DE350B] text-white hover:bg-[#BF2600] transition-colors">
                Delete Space
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation suppression page */}
      {deletePageConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl w-full max-w-sm mx-4 p-6 text-center" style={{ boxShadow: '0 20px 60px rgba(9,30,66,.32)' }}>
            <div className="w-12 h-12 rounded-full bg-[#FFEBE6] flex items-center justify-center mx-auto mb-4"><AlertTriangle size={22} className="text-[#DE350B]" /></div>
            <h3 className="text-[16px] font-bold text-[#172B4D] mb-2">Delete Page?</h3>
            <p className="text-[13px] text-[#42526E] mb-6">This page will be permanently deleted.</p>
            <div className="flex items-center justify-center gap-3">
              <button onClick={() => setDeletePageConfirm(null)} className="btn-secondary">Cancel</button>
              <button onClick={() => deletePageMutation.mutate(deletePageConfirm)}
                disabled={deletePageMutation.isPending}
                className="px-4 py-2 rounded text-[13px] font-semibold bg-[#DE350B] text-white hover:bg-[#BF2600] transition-colors">
                Delete Page
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
