import React, { useState, useMemo, useRef } from 'react';
import DOMPurify from 'dompurify';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { api } from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import type { ConfluencePage, ConfluenceSpace, JiraUser } from '../types';
import {
  FileText, ChevronRight, X, Plus, Search,
  Clock, Eye, Home, Trash2, Globe,
  MoreHorizontal, AlertTriangle, Layers,
  ThumbsUp, Tag,
} from 'lucide-react';

import { RichTextEditor } from './confluence/RichTextEditor';
import { PageTitle } from './confluence/PageTitle';
import { PageHeader } from './confluence/PageHeader';
import { PageSidebar } from './confluence/PageSidebar';
import { TableOfContents } from './confluence/TableOfContents';
import { SkeletonPage, SkeletonSidebar } from './ui/Skeleton';
import { useToast } from './ui/Toast';

// ═══════════════════════════════════════════════════════════════════════════════
// Markdown → HTML (utilisé uniquement pour les anciennes pages Markdown)
// ═══════════════════════════════════════════════════════════════════════════════

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
      const isExternal = /^https?:\/\//.test(href as string);
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
    if (line.startsWith('#### ')) { out.push(`<h4>${inlineMarkdown(line.slice(5))}</h4>`); continue; }
    if (line.startsWith('### ')) { out.push(`<h3>${inlineMarkdown(line.slice(4))}</h3>`); continue; }
    if (line.startsWith('## ')) { out.push(`<h2>${inlineMarkdown(line.slice(3))}</h2>`); continue; }
    if (line.startsWith('# ')) { out.push(`<h1>${inlineMarkdown(line.slice(2))}</h1>`); continue; }
    if (/^---+$/.test(line.trim())) { out.push('<hr>'); continue; }
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

/** Détermine si le contenu est du Markdown brut ou du HTML TipTap */
function contentToHtml(content: string): string {
  if (!content) return '';
  // Si le contenu commence par une balise HTML c'est déjà du HTML
  if (content.trim().startsWith('<')) return content;
  // Sinon c'est du Markdown (ancien format)
  return parseMarkdown(content);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════════

function relativeDate(dateStr: string): string {
  const d = new Date(dateStr);
  const diff = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (diff === 0) return 'Aujourd\'hui';
  if (diff === 1) return 'Hier';
  if (diff < 30) return `Il y a ${diff} jours`;
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

function getAuthor(users: JiraUser[], authorId: string | null): JiraUser | null {
  if (!authorId) return null;
  return users.find(u => u.id === authorId) ?? null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Icône d'espace
// ═══════════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════════
// Modal création d'espace (conservée de l'original)
// ═══════════════════════════════════════════════════════════════════════════════

const SPACE_COLORS = ['#0052CC', '#6554C0', '#00875A', '#DE350B', '#FF8B00', '#0747A6'];
const SPACE_EMOJIS = ['⚙️', '🧭', '📚', '🎯', '💡', '🔬', '🌐', '🛠️', '📊', '🎨'];

function CreateSpaceModal({ onSave, onClose, existingKeys }: {
  onSave: (data: { key: string; name: string; description: string; emoji: string; color: string }) => void;
  onClose: () => void;
  existingKeys: string[];
}) {
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [desc, setDesc] = useState('');
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
    if (!name.trim()) errs.name = 'Le nom est requis';
    if (!key.trim()) errs.key = 'La clé est requise';
    if (existingKeys.includes(key)) errs.key = 'Clé déjà utilisée';
    if (Object.keys(errs).length) { setErrors(errs); return; }
    onSave({ key: key.trim(), name: name.trim(), description: desc.trim(), emoji, color });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg mx-4 overflow-hidden" style={{ boxShadow: '0 24px 64px rgba(9,30,66,.32)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-5 border-b border-[#DFE1E6]">
          <h2 className="text-[18px] font-bold text-[#172B4D]">Créer un espace</h2>
          <button onClick={onClose} className="w-8 h-8 rounded flex items-center justify-center text-[#42526E] hover:bg-[#F4F5F7]"><X size={15} /></button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 flex flex-col gap-5">
          {/* Emoji + Color */}
          <div className="flex gap-5">
            <div className="flex-1">
              <label className="block text-[11px] font-semibold text-[#42526E] uppercase tracking-wider mb-2">Icône</label>
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
              <label className="block text-[11px] font-semibold text-[#42526E] uppercase tracking-wider mb-2">Couleur</label>
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
              <div className="text-[14px] font-bold text-[#172B4D]">{name || 'Nom de l\'espace'}</div>
              <div className="text-[11px] font-bold text-[#8993A4] uppercase">{key || 'CLÉ'}</div>
            </div>
          </div>

          {/* Name + Key */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-[#42526E] uppercase tracking-wider mb-1.5">Nom *</label>
              <input className={`atl-input text-[14px] ${errors.name ? 'border-[#DE350B]' : ''}`} value={name} onChange={e => handleNameChange(e.target.value)} placeholder="ex. Ingénierie" autoFocus />
              {errors.name && <p className="text-[11px] text-[#DE350B] mt-1">{errors.name}</p>}
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#42526E] uppercase tracking-wider mb-1.5">Clé *</label>
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
            <textarea className="atl-input resize-none text-[14px]" rows={2} value={desc} onChange={e => setDesc(e.target.value)} placeholder="À quoi sert cet espace ?" />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#DFE1E6]">
            <button type="button" onClick={onClose} className="btn-secondary">Annuler</button>
            <button type="submit" className="btn-primary">Créer l'espace</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Modal confirmation suppression
// ═══════════════════════════════════════════════════════════════════════════════

function ConfirmDeleteModal({ title, message, onConfirm, onCancel, loading }: {
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-xl w-full max-w-sm mx-4 p-6 text-center" style={{ boxShadow: '0 20px 60px rgba(9,30,66,.32)' }}>
        <div className="w-12 h-12 rounded-full bg-[#FFEBE6] flex items-center justify-center mx-auto mb-4">
          <AlertTriangle size={22} className="text-[#DE350B]" />
        </div>
        <h3 className="text-[16px] font-bold text-[#172B4D] mb-2">{title}</h3>
        <p className="text-[13px] text-[#42526E] mb-6">{message}</p>
        <div className="flex items-center justify-center gap-3">
          <button onClick={onCancel} className="btn-secondary">Annuler</button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="px-4 py-2 rounded text-[13px] font-semibold bg-[#DE350B] text-white hover:bg-[#BF2600] transition-colors disabled:opacity-60"
          >
            {loading ? 'Suppression…' : 'Supprimer'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Props du composant principal
// ═══════════════════════════════════════════════════════════════════════════════

interface Props {
  spaces?: ConfluenceSpace[];
  setSpaces?: React.Dispatch<React.SetStateAction<ConfluenceSpace[]>>;
  initialPageTarget?: { pageId: string; spaceId: string } | null;
  onPageTargetConsumed?: () => void;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Composant principal ConfluenceWiki
// ═══════════════════════════════════════════════════════════════════════════════

export function ConfluenceWiki({ initialPageTarget, onPageTargetConsumed }: Props) {
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // ── Requêtes API ────────────────────────────────────────────────────────────

  const { data: spaces = [], isLoading: spacesLoading } = useQuery({
    queryKey: ['confluence-spaces'],
    queryFn: api.confluence.spaces,
    placeholderData: keepPreviousData,
  });

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: api.users.list,
  });

  const invalidateSpaces = () => queryClient.invalidateQueries({ queryKey: ['confluence-spaces'] });

  // ── Mutations ───────────────────────────────────────────────────────────────

  const createSpaceMutation = useMutation({
    mutationFn: (data: { key: string; name: string; description?: string; emoji?: string; color?: string }) =>
      api.confluence.createSpace(data),
    onSuccess: (space) => {
      invalidateSpaces();
      setSelectedSpaceId(space.id);
      toast({ type: 'success', title: 'Espace créé', message: space.name });
    },
    onError: () => toast({ type: 'error', title: 'Erreur', message: 'Impossible de créer l\'espace' }),
  });

  const deleteSpaceMutation = useMutation({
    mutationFn: (id: string) => api.confluence.deleteSpace(id),
    onSuccess: () => {
      invalidateSpaces();
      setSelectedSpaceId(null);
      setSelectedPageId(null);
      toast({ type: 'success', title: 'Espace supprimé' });
    },
  });

  const createPageMutation = useMutation({
    mutationFn: ({ spaceKey, data }: {
      spaceKey: string;
      data: { title: string; content?: string; tags?: string[]; emoji?: string; parentId?: string };
    }) => api.confluence.createPage(spaceKey, data),
    onSuccess: (page) => {
      // Ajouter la nouvelle page au cache immédiatement
      queryClient.setQueryData<ConfluenceSpace[]>(['confluence-spaces'], (old: ConfluenceSpace[] | undefined) => {
        if (!old) return old;
        return old.map((space: ConfluenceSpace) =>
          space.key === page.spaceKey
            ? { ...space, pages: [...space.pages, page] }
            : space
        );
      });
      setSelectedPageId(page.id);
      setEditTitle(page.title);
      setEditContent(contentToHtml(page.content));
      setIsEditing(true);
      setShowCreate(false);
      setNewPageTitle('');
      setNewPageParentId(null);
      toast({ type: 'success', title: 'Page créée', message: page.title });
      // Refetch progressif en arrière-plan (sans interférer avec l'UI)
      setTimeout(() => {
        api.confluence.spaces().then(spaces => {
          queryClient.setQueryData(['confluence-spaces'], spaces);
        }).catch(() => {});
      }, 1500);
    },
    onError: () => toast({ type: 'error', title: 'Erreur', message: 'Impossible de créer la page' }),
  });

  const updatePageMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<ConfluencePage> }) => {
      console.log('📤 Envoi de la mise à jour de page:', { id, data });
      try {
        const result = await api.confluence.updatePage(id, data);
        console.log('✅ Réponse du serveur reçue:', result);
        return result;
      } catch (err) {
        console.error('❌ Erreur réseau/serveur:', err);
        throw err;
      }
    },
    onSuccess: (updatedPage: ConfluencePage) => {
      console.log('✅ Succès! Page enregistrée');
      setIsEditing(false);
      toast({ type: 'success', title: 'Modifications enregistrées' });
    },
    onError: (err: any) => {
      console.error('❌ Erreur complète:', err);
      const message = err?.message || String(err);
      toast({ type: 'error', title: 'Erreur d\'enregistrement', message });
    },
  });

  const deletePageMutation = useMutation({
    mutationFn: (id: string) => api.confluence.deletePage(id),
    onSuccess: (_, id) => {
      invalidateSpaces();
      if (selectedPageId === id) { setSelectedPageId(null); setIsEditing(false); }
      setDeletePageConfirm(null);
      toast({ type: 'success', title: 'Page supprimée' });
    },
  });

  const likePageMutation = useMutation({
    mutationFn: (id: string) => api.confluence.likePage(id),
    onSuccess: () => invalidateSpaces(),
  });

  // ── État local ──────────────────────────────────────────────────────────────

  const [selectedSpaceId, setSelectedSpaceId] = useState<string | null>(initialPageTarget?.spaceId ?? null);
  const [selectedPageId, setSelectedPageId] = useState<string | null>(initialPageTarget?.pageId ?? null);

  React.useEffect(() => {
    if (initialPageTarget) onPageTargetConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Restaure la navigation Confluence lors de l'appui sur le bouton Retour du navigateur
  React.useEffect(() => {
    const handler = (e: PopStateEvent) => {
      setSelectedPageId(e.state?.pageId ?? null);
      setSelectedSpaceId(e.state?.spaceId ?? null);
      setIsEditing(false);
    };
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, []);

  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [showCreateSpace, setShowCreateSpace] = useState(false);
  const [newPageTitle, setNewPageTitle] = useState('');
  const [newPageParentId, setNewPageParentId] = useState<string | null>(null);
  const [deleteSpaceConfirm, setDeleteSpaceConfirm] = useState<string | null>(null);
  const [deletePageConfirm, setDeletePageConfirm] = useState<string | null>(null);

  const selectedSpace = spaces.find(s => s.id === selectedSpaceId) ?? null;
  const selectedPage = spaces.flatMap(s => s.pages).find(p => p.id === selectedPageId) ?? null;

  const allPages = useMemo(() =>
    spaces.flatMap(s => s.pages.map(p => ({
      ...p,
      spaceName: s.name, spaceColor: s.color, spaceEmoji: s.emoji, spaceId: s.id,
    }))),
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

  // Breadcrumb pour la page sélectionnée
  const breadcrumb = useMemo((): Array<{ id: string; title: string }> => {
    if (!selectedPage || !selectedSpace) return [];
    const crumbs: Array<{ id: string; title: string }> = [];
    let parentId = selectedPage.parentId;
    while (parentId) {
      const parent = selectedSpace.pages.find(p => p.id === parentId);
      if (!parent) break;
      crumbs.unshift({ id: parent.id, title: parent.title });
      parentId = parent.parentId;
    }
    return crumbs;
  }, [selectedPage, selectedSpace]);

  // ── Actions ─────────────────────────────────────────────────────────────────

  const openPage = (page: ConfluencePage & { spaceId?: string }) => {
    const sid = (page as { spaceId?: string }).spaceId ?? spaces.find(s => s.key === page.spaceKey)?.id ?? null;
    window.history.pushState({ spaceId: sid, pageId: page.id }, '');
    setSelectedPageId(page.id);
    setSelectedSpaceId(sid);
    setIsEditing(false);
    setSearch('');
    // Incrémente les vues (non-bloquant)
    api.confluence.getPage(page.id).catch(() => { });
  };

  const openSpace = (spaceId: string) => {
    window.history.pushState({ spaceId, pageId: null }, '');
    setSelectedSpaceId(spaceId);
    setSelectedPageId(null);
    setIsEditing(false);
  };

  const startEdit = () => {
    if (!selectedPage) return;
    setEditTitle(selectedPage.title);
    setEditContent(contentToHtml(selectedPage.content));
    setIsEditing(true);
  };

  const saveEdit = () => {
    if (!selectedPage) return;
    updatePageMutation.mutate({
      id: selectedPage.id,
      data: { title: editTitle, content: editContent },
    });
  };

  const cancelEdit = () => {
    setIsEditing(false);
    // Réinitialise le contenu d'édition
    if (selectedPage) {
      setEditTitle(selectedPage.title);
      setEditContent(contentToHtml(selectedPage.content));
    }
  };

  const handleDuplicatePage = () => {
    if (!selectedPage || !selectedSpace) return;
    createPageMutation.mutate({
      spaceKey: selectedSpace.key,
      data: {
        title: `${selectedPage.title} (copie)`,
        content: editContent || selectedPage.content,
        tags: selectedPage.tags,
        emoji: selectedPage.emoji ?? '📄',
        parentId: selectedPage.parentId ?? undefined,
      },
    });
  };

  const createPage = () => {
    if (!newPageTitle.trim() || !selectedSpace) return;
    createPageMutation.mutate({
      spaceKey: selectedSpace.key,
      data: {
        title: newPageTitle.trim(),
        content: `<h1>${newPageTitle.trim()}</h1><p>Commencez à rédiger votre contenu ici...</p>`,
        emoji: '📄',
        tags: [],
        parentId: newPageParentId ?? undefined,
      },
    });
  };

  const handleNewPage = (spaceId: string, parentId?: string) => {
    setSelectedSpaceId(spaceId);
    setNewPageParentId(parentId ?? null);
    setShowCreate(true);
  };

  // Auto-save : sauvegarde le contenu de la page en cours d'édition
  const handleAutoSave = async (html: string) => {
    if (!selectedPage || !isEditing) {
      console.log('⏭️ Autosave skipped (pas de page sélectionnée ou pas en édition)');
      return;
    }
    try {
      console.log('💾 Autosave en cours...');
      const updated = await api.confluence.updatePage(selectedPage.id, { title: editTitle, content: html });
      console.log('✅ Autosave réussi');
      // Mettre à jour le cache sans invalider ni refetch
      queryClient.setQueryData<ConfluenceSpace[]>(['confluence-spaces'], (old: ConfluenceSpace[] | undefined) => {
        if (!old) {
          console.warn('⚠️ Cache vide lors de autosave');
          return old;
        }
        return old.map((space: ConfluenceSpace) => ({
          ...space,
          pages: space.pages.map((page: ConfluencePage) =>
            page.id === updated.id ? { ...page, ...updated } : page
          ),
        }));
      });
      console.log('📦 Cache autosave mis à jour');
    } catch (err) {
      console.error('❌ Erreur autosave:', err);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // Rendu
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <div className="h-full flex min-h-0">

      {/* ── Sidebar de navigation ──────────────────────────────────────────── */}
      <div className="w-[260px] flex-shrink-0 flex flex-col border-r border-[#DFE1E6] bg-[#FAFBFC] overflow-hidden">
        {/* Barre de recherche + bouton accueil */}
        <div className="px-3 pt-3 pb-2 border-b border-[#DFE1E6] flex-shrink-0">
          <button
            onClick={() => { setSelectedSpaceId(null); setSelectedPageId(null); setIsEditing(false); }}
            className="flex items-center gap-2 w-full px-2 py-1.5 mb-2 rounded text-[13px] font-medium text-[#42526E] hover:bg-[#EBECF0] transition-colors"
          >
            <Home size={14} className="flex-shrink-0" />
            Fluxo Doc
          </button>
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#8993A4] pointer-events-none" />
            <input
              className="atl-input pl-8 text-[13px] h-8"
              placeholder="Rechercher des pages..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Résultats de recherche OU arbre de navigation */}
        {searchResults ? (
          <div className="flex-1 overflow-y-auto py-1">
            <div className="px-3 py-1 text-[10px] font-semibold text-[#8993A4] uppercase tracking-wider">
              {searchResults.length} résultat{searchResults.length !== 1 ? 's' : ''}
            </div>
            {searchResults.length === 0 ? (
              <div className="px-3 py-6 text-center text-[13px] text-[#8993A4]">Aucune page trouvée</div>
            ) : searchResults.map(p => (
              <button
                key={p.id}
                onClick={() => openPage(p)}
                className="w-full flex items-start gap-2 px-3 py-2.5 hover:bg-[#EBECF0] transition-colors text-left"
              >
                <span className="text-base mt-0.5 flex-shrink-0">{p.emoji ?? '📄'}</span>
                <div>
                  <div className="text-[13px] font-medium text-[#172B4D] leading-snug">{p.title}</div>
                  <div className="text-[11px] text-[#8993A4] mt-0.5">{p.spaceName}</div>
                </div>
              </button>
            ))}
          </div>
        ) : spacesLoading ? (
          <SkeletonSidebar />
        ) : (
          <>
            {/* En-tête Espaces + bouton créer */}
            <div className="flex items-center justify-between px-3 pt-3 pb-1 flex-shrink-0">
              <span className="text-[10px] font-semibold text-[#8993A4] uppercase tracking-wider">Espaces</span>
              <button
                onClick={() => setShowCreateSpace(true)}
                title="Créer un espace"
                className="w-5 h-5 flex items-center justify-center text-[#8993A4] hover:text-[#0052CC] hover:bg-[#DEEBFF] rounded transition-colors"
              >
                <Plus size={12} />
              </button>
            </div>

            {spaces.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-[#8993A4] px-3">
                <Layers size={24} strokeWidth={1.5} className="mb-2" />
                <p className="text-[12px] text-center">Aucun espace.<br />Créez votre premier espace !</p>
              </div>
            ) : (
              <div className="flex-1 overflow-hidden">
                <PageSidebar
                  spaces={spaces}
                  activeSpaceId={selectedSpaceId}
                  activePageId={selectedPageId}
                  onSelectSpace={openSpace}
                  onSelectPage={(pageId, spaceId) => {
                    const page = spaces.flatMap(s => s.pages).find(p => p.id === pageId);
                    if (page) openPage({ ...page, spaceId });
                  }}
                  onNewPage={handleNewPage}
                  onSpaceHome={openSpace}
                />
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Contenu principal ─────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden bg-white">

        {/* ── Vue accueil ────────────────────────────────────────────────── */}
        {!selectedSpaceId && !selectedPageId && (
          <div className="flex-1 overflow-y-auto p-8">
            <div className="flex items-center justify-between mb-2">
              <h1 className="text-[24px] font-bold text-[#172B4D]">Fluxo Doc</h1>
              <button onClick={() => setShowCreateSpace(true)} className="btn-primary gap-2">
                <Plus size={14} /> Nouvel espace
              </button>
            </div>
            <p className="text-[14px] text-[#42526E] mb-8">Parcourez les espaces et pages de votre organisation.</p>

            {spacesLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3].map(i => (
                  <div key={i} className="bg-white rounded-lg border border-[#DFE1E6] p-5 animate-pulse">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-lg bg-[#EBECF0]" />
                      <div className="flex-1 space-y-1.5">
                        <div className="h-4 bg-[#EBECF0] rounded w-3/4" />
                        <div className="h-3 bg-[#EBECF0] rounded w-1/2" />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <div className="h-3 bg-[#EBECF0] rounded" />
                      <div className="h-3 bg-[#EBECF0] rounded w-4/5" />
                    </div>
                  </div>
                ))}
              </div>
            ) : spaces.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <div className="w-20 h-20 rounded-2xl bg-[#DEEBFF] flex items-center justify-center mb-4">
                  <Globe size={36} className="text-[#0052CC]" />
                </div>
                <h3 className="text-[18px] font-bold text-[#172B4D] mb-2">Aucun espace</h3>
                <p className="text-[14px] text-[#42526E] mb-6 max-w-xs">
                  Créez votre premier espace pour commencer à organiser vos connaissances.
                </p>
                <button onClick={() => setShowCreateSpace(true)} className="btn-primary gap-2">
                  <Plus size={14} /> Créer un espace
                </button>
              </div>
            ) : (
              <>
                {/* Grille des espaces */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
                  {spaces.map(space => (
                    <button
                      key={space.id}
                      onClick={() => openSpace(space.id)}
                      className="bg-white rounded-lg border border-[#DFE1E6] p-5 text-left hover:border-[#0052CC] hover:shadow-md transition-all group"
                      style={{ boxShadow: '0 1px 2px rgba(9,30,66,.08)' }}
                    >
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
                        <span className="flex items-center gap-1"><Eye size={11} /> {space.pages.reduce((a, p) => a + p.views, 0)} vues</span>
                      </div>
                    </button>
                  ))}
                  {/* Tuile créer espace */}
                  <button
                    onClick={() => setShowCreateSpace(true)}
                    className="bg-white rounded-lg border-2 border-dashed border-[#DFE1E6] p-5 flex flex-col items-center justify-center gap-2 text-[#8993A4] hover:border-[#0052CC] hover:text-[#0052CC] hover:bg-[#F4F8FF] transition-all min-h-[140px]"
                  >
                    <div className="w-10 h-10 rounded-full border-2 border-current flex items-center justify-center">
                      <Plus size={18} />
                    </div>
                    <span className="text-[13px] font-semibold">Nouvel espace</span>
                  </button>
                </div>

                {/* Pages récemment mises à jour */}
                <div>
                  <h2 className="text-[16px] font-bold text-[#172B4D] mb-4">Récemment mis à jour</h2>
                  <div
                    className="bg-white rounded-lg border border-[#DFE1E6] divide-y divide-[#DFE1E6]"
                    style={{ boxShadow: '0 1px 2px rgba(9,30,66,.08)' }}
                  >
                    {allPages
                      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
                      .slice(0, 8)
                      .map(page => {
                        const author = getAuthor(users, page.authorId);
                        return (
                          <button
                            key={page.id}
                            onClick={() => openPage(page)}
                            className="w-full flex items-center gap-4 px-5 py-3.5 hover:bg-[#F4F5F7] transition-colors text-left"
                          >
                            <span className="text-xl flex-shrink-0">{page.emoji ?? '📄'}</span>
                            <div className="flex-1 min-w-0">
                              <div className="text-[14px] font-semibold text-[#172B4D] leading-snug truncate">{page.title}</div>
                              <div className="flex items-center gap-2 mt-0.5">
                                {author && <span className="text-[11px] text-[#42526E]">{author.name}</span>}
                                <span className="text-[11px] text-[#8993A4]">·</span>
                                <span className="text-[11px] text-[#8993A4]">{relativeDate(page.updatedAt)}</span>
                                <span
                                  className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                                  style={{ background: `${page.spaceColor}22`, color: page.spaceColor }}
                                >
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
                      <div className="py-10 text-center text-[#8993A4] text-[13px]">
                        Aucune page. Créez une page dans un espace pour la voir ici.
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Vue espace (liste des pages) ───────────────────────────────── */}
        {selectedSpaceId && !selectedPageId && selectedSpace && (
          <div className="flex-1 overflow-y-auto">
            {/* Header de l'espace */}
            <div
              className="px-8 py-8 text-white"
              style={{ background: `linear-gradient(135deg, ${selectedSpace.color}, ${selectedSpace.color}cc)` }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-xl bg-white/20 flex items-center justify-center text-2xl">
                    {selectedSpace.emoji}
                  </div>
                  <div>
                    <h1 className="text-[24px] font-bold">{selectedSpace.name}</h1>
                    <p className="text-white/70 text-[13px] mt-0.5">{selectedSpace.key} · {selectedSpace.pages.length} pages</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleNewPage(selectedSpace.id)}
                    className="flex items-center gap-1.5 px-4 py-2 bg-white text-[13px] font-semibold rounded transition-colors"
                    style={{ color: selectedSpace.color }}
                  >
                    <Plus size={14} /> Nouvelle page
                  </button>
                  <button
                    onClick={() => setDeleteSpaceConfirm(selectedSpace.id)}
                    className="flex items-center gap-1.5 px-3 py-2 bg-white/20 text-white text-[13px] font-semibold rounded hover:bg-white/30 transition-colors"
                    title="Supprimer l'espace"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              <p className="mt-4 text-white/80 text-[14px]">{selectedSpace.description}</p>
            </div>

            <div className="p-6">
              <h2 className="text-[14px] font-bold text-[#172B4D] mb-4 uppercase tracking-wide">Pages</h2>
              {selectedSpace.pages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-[#8993A4]">
                  <FileText size={40} strokeWidth={1.5} className="mb-3" />
                  <p className="text-[15px] font-semibold mb-1">Aucune page</p>
                  <p className="text-[13px] mb-4">Créez la première page dans cet espace.</p>
                  <button onClick={() => handleNewPage(selectedSpace.id)} className="btn-primary gap-1.5">
                    <Plus size={14} /> Créer une page
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                  {selectedSpace.pages.map(page => {
                    const author = getAuthor(users, page.authorId);
                    return (
                      <div key={page.id} className="relative group">
                        <button
                          onClick={() => openPage({ ...page, spaceId: selectedSpace.id })}
                          className="w-full bg-white rounded-lg border border-[#DFE1E6] p-4 text-left hover:border-[#0052CC] hover:shadow-md transition-all"
                          style={{ boxShadow: '0 1px 2px rgba(9,30,66,.08)' }}
                        >
                          <div className="flex items-start gap-3">
                            <span className="text-2xl flex-shrink-0 mt-0.5">{page.emoji ?? '📄'}</span>
                            <div className="flex-1 min-w-0">
                              <h3 className="text-[14px] font-semibold text-[#172B4D] group-hover:text-[#0052CC] transition-colors line-clamp-2 leading-snug pr-6">
                                {page.title}
                              </h3>
                              <div className="flex items-center gap-1.5 mt-2 text-[11px] text-[#8993A4]">
                                {author && (
                                  <>
                                    <div className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold text-white" style={{ background: author.color }}>
                                      {author.avatar}
                                    </div>
                                    <span>{author.name.split(' ')[0]}</span>
                                    <span>·</span>
                                  </>
                                )}
                                <Clock size={9} />
                                <span>{relativeDate(page.updatedAt)}</span>
                              </div>
                              {page.tags.length > 0 && (
                                <div className="flex gap-1 mt-2 flex-wrap">
                                  {page.tags.slice(0, 3).map(t => (
                                    <span key={t} className="text-[10px] bg-[#F4F5F7] text-[#42526E] px-1.5 py-0.5 rounded">{t}</span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </button>
                        <button
                          onClick={() => setDeletePageConfirm(page.id)}
                          className="absolute top-2 right-2 w-6 h-6 rounded flex items-center justify-center text-[#DE350B] bg-[#FFEBE6] opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Supprimer la page"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    );
                  })}
                  {/* Tuile nouvelle page */}
                  <button
                    onClick={() => handleNewPage(selectedSpace.id)}
                    className="bg-white rounded-lg border-2 border-dashed border-[#DFE1E6] p-4 flex items-center justify-center gap-2 text-[#8993A4] hover:border-[#0052CC] hover:text-[#0052CC] hover:bg-[#F4F8FF] transition-all"
                  >
                    <Plus size={16} />
                    <span className="text-[14px] font-semibold">Nouvelle page</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Vue page (lecture / édition avec TipTap) ───────────────────── */}
        {selectedPageId && selectedPage && (
          <div className="flex-1 flex min-h-0">
            {/* Zone de contenu + header */}
            <div className="flex-1 overflow-y-auto">
              <div className="max-w-[800px] mx-auto px-8 py-8">
                {/* En-tête de la page */}
                <PageHeader
                  page={selectedPage}
                  space={selectedSpace ?? spaces[0] ?? { id: '', key: '', name: '', description: '', emoji: '', color: '#0052CC', ownerId: null, pages: [], createdAt: '' }}
                  breadcrumb={breadcrumb}
                  author={getAuthor(users, selectedPage.authorId) ?? (currentUser ? {
                    id: currentUser.id,
                    name: currentUser.name,
                    avatar: currentUser.avatar,
                    color: currentUser.color,
                    email: currentUser.email,
                  } : null)}
                  isEditing={isEditing}
                  onEdit={startEdit}
                  onSave={saveEdit}
                  onCancel={cancelEdit}
                  onDelete={() => setDeletePageConfirm(selectedPage.id)}
                  onCopy={handleDuplicatePage}
                  onLike={() => likePageMutation.mutate(selectedPage.id)}
                />

                {/* Titre de la page */}
                <div className="mb-6">
                  <PageTitle
                    value={isEditing ? editTitle : selectedPage.title}
                    onChange={setEditTitle}
                    readOnly={!isEditing}
                    placeholder="Titre sans nom"
                    onEnter={() => document.querySelector<HTMLElement>('.ProseMirror')?.focus()}
                  />
                </div>

                {/* Éditeur TipTap ou rendu statique */}
                {/* Key force React à remonter le composant quand la page change, évitant la race condition avec TipTap */}
                <RichTextEditor
                  key={`${selectedPageId}-${isEditing}`}
                  content={isEditing ? editContent : contentToHtml(selectedPage.content)}
                  onChange={setEditContent}
                  onSave={isEditing ? handleAutoSave : undefined}
                  readOnly={!isEditing}
                  placeholder="Commencez à écrire… Tapez / pour insérer un bloc."
                />
              </div>
            </div>

            {/* Table des matières — sidebar droite */}
            <div className="w-[220px] flex-shrink-0 px-3 py-8 border-l border-[#DFE1E6] hidden xl:block overflow-y-auto">
              <TableOfContents
                editor={null}
                contentHtml={contentToHtml(selectedPage.content)}
              />
            </div>
          </div>
        )}
      </div>

      {/* ── Modals ──────────────────────────────────────────────────────── */}

      {/* Créer une page */}
      {showCreate && selectedSpace && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setShowCreate(false)}>
          <div
            className="bg-white rounded-lg w-full max-w-md mx-4 overflow-hidden"
            style={{ boxShadow: '0 20px 60px rgba(9,30,66,.32)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#DFE1E6]">
              <h2 className="text-[15px] font-bold text-[#172B4D]">Créer une page</h2>
              <button onClick={() => setShowCreate(false)} className="w-8 h-8 rounded flex items-center justify-center text-[#42526E] hover:bg-[#F4F5F7]">
                <X size={14} />
              </button>
            </div>
            <div className="px-5 py-5">
              <div className="mb-4">
                <label className="block text-[11px] font-semibold text-[#42526E] uppercase tracking-wider mb-1.5">Espace</label>
                <div className="flex items-center gap-2 text-[13px] text-[#172B4D]">
                  <span>{selectedSpace.emoji}</span>
                  <span className="font-semibold">{selectedSpace.name}</span>
                </div>
              </div>
              <div className="mb-5">
                <label className="block text-[11px] font-semibold text-[#42526E] uppercase tracking-wider mb-1.5">Titre *</label>
                <input
                  className="atl-input text-[14px]"
                  placeholder="Donnez un titre à votre page..."
                  value={newPageTitle}
                  onChange={e => setNewPageTitle(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && createPage()}
                  autoFocus
                />
              </div>
              {createPageMutation.isError && (
                <p className="text-[12px] text-[#DE350B] mb-3">
                  {(createPageMutation.error as Error).message}
                </p>
              )}
              <div className="flex items-center justify-end gap-2">
                <button onClick={() => setShowCreate(false)} className="btn-secondary">Annuler</button>
                <button
                  onClick={createPage}
                  disabled={!newPageTitle.trim() || createPageMutation.isPending}
                  className="btn-primary"
                >
                  {createPageMutation.isPending ? 'Création…' : 'Créer'}
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
        <ConfirmDeleteModal
          title="Supprimer l'espace ?"
          message="Cette action supprimera définitivement l'espace et toutes ses pages. Cette action est irréversible."
          onConfirm={() => { deleteSpaceMutation.mutate(deleteSpaceConfirm); setDeleteSpaceConfirm(null); }}
          onCancel={() => setDeleteSpaceConfirm(null)}
          loading={deleteSpaceMutation.isPending}
        />
      )}

      {/* Confirmation suppression page */}
      {deletePageConfirm && (
        <ConfirmDeleteModal
          title="Supprimer la page ?"
          message="Cette page sera définitivement supprimée."
          onConfirm={() => deletePageMutation.mutate(deletePageConfirm)}
          onCancel={() => setDeletePageConfirm(null)}
          loading={deletePageMutation.isPending}
        />
      )}
    </div>
  );
}
