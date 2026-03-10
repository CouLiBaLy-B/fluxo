import React, { useState } from 'react';
import { Edit3, Share2, MoreHorizontal, Trash2, Copy, ExternalLink, ChevronRight, Eye, ThumbsUp } from 'lucide-react';
import type { ConfluencePage, ConfluenceSpace, JiraUser } from '../../types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relativeDate(dateStr: string): string {
  const d = new Date(dateStr);
  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffH   = Math.floor(diffMs / 3600000);
  const diffD   = Math.floor(diffMs / 86400000);
  if (diffMin < 2)  return 'à l\'instant';
  if (diffMin < 60) return `il y a ${diffMin} min`;
  if (diffH < 24)   return `il y a ${diffH}h`;
  if (diffD === 1)  return 'hier';
  if (diffD < 30)   return `il y a ${diffD} jours`;
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Avatar utilisateur avec initiales et couleur */
function UserAvatar({ name, color, size = 24 }: { name: string; color?: string; size?: number }) {
  const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  return (
    <div
      className="rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0"
      style={{ width: size, height: size, background: color ?? '#0052CC', fontSize: size * 0.38 }}
      title={name}
      aria-label={name}
    >
      {initials}
    </div>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface PageHeaderProps {
  page: ConfluencePage;
  space: ConfluenceSpace;
  breadcrumb: Array<{ id: string; title: string }>;
  author: JiraUser | null;
  isEditing: boolean;
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete: () => void;
  onCopy: () => void;
  onLike: () => void;
}

// ─── Réactions emoji ──────────────────────────────────────────────────────────

const REACTIONS = [
  { emoji: '👍', label: 'J\'aime' },
  { emoji: '❤️', label: 'J\'adore' },
  { emoji: '🎉', label: 'Bravo' },
  { emoji: '💡', label: 'Bonne idée' },
];

function ReactionBar({ likes }: { likes: number }) {
  const [counts, setCounts] = useState<Record<string, number>>({ '👍': likes, '❤️': 0, '🎉': 0, '💡': 0 });
  const [active, setActive] = useState<Record<string, boolean>>({});

  const toggle = (emoji: string) => {
    setActive(prev => {
      const next = { ...prev, [emoji]: !prev[emoji] };
      setCounts(c => ({ ...c, [emoji]: c[emoji] + (next[emoji] ? 1 : -1) }));
      return next;
    });
  };

  return (
    <div className="flex items-center gap-1">
      {REACTIONS.map(r => (
        <button
          key={r.emoji}
          type="button"
          onClick={() => toggle(r.emoji)}
          title={r.label}
          className={[
            'flex items-center gap-1 px-2 py-0.5 rounded-full text-[12px] transition-all',
            active[r.emoji]
              ? 'bg-[#DEEBFF] border border-[#4C9AFF] text-[#0052CC]'
              : 'bg-[#F4F5F7] border border-transparent text-[#42526E] hover:bg-[#EBECF0]',
          ].join(' ')}
          aria-pressed={active[r.emoji]}
        >
          <span>{r.emoji}</span>
          {counts[r.emoji] > 0 && <span className="font-medium">{counts[r.emoji]}</span>}
        </button>
      ))}
    </div>
  );
}

// ─── Menu "Plus d'actions" ────────────────────────────────────────────────────

function MoreMenu({ onDelete, onCopy }: { onDelete: () => void; onCopy: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        className="btn-subtle w-8 h-8 p-0 flex items-center justify-center"
        aria-label="Plus d'actions"
        aria-expanded={open}
      >
        <MoreHorizontal size={15} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-[#DFE1E6] rounded-lg shadow-lg py-1 min-w-[180px]">
          <button
            type="button"
            onClick={() => { onCopy(); setOpen(false); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-[#172B4D] hover:bg-[#F4F5F7] transition-colors"
          >
            <Copy size={13} />
            Dupliquer la page
          </button>
          <button
            type="button"
            onClick={() => { window.open(window.location.href, '_blank'); setOpen(false); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-[#172B4D] hover:bg-[#F4F5F7] transition-colors"
          >
            <ExternalLink size={13} />
            Ouvrir dans un nouvel onglet
          </button>
          <hr className="my-1 border-[#DFE1E6]" />
          <button
            type="button"
            onClick={() => { onDelete(); setOpen(false); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-[#DE350B] hover:bg-[#FFEBE6] transition-colors"
          >
            <Trash2 size={13} />
            Supprimer la page
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Composant PageHeader ─────────────────────────────────────────────────────

export function PageHeader({
  page,
  space,
  breadcrumb,
  author,
  isEditing,
  onEdit,
  onSave,
  onCancel,
  onDelete,
  onCopy,
  onLike,
}: PageHeaderProps) {

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href).catch(() => null);
  };

  return (
    <div className="flex flex-col gap-3 mb-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1 text-[12px] text-[#6B778C] flex-wrap" aria-label="Fil d'Ariane">
        <button
          type="button"
          className="hover:text-[#0052CC] hover:underline transition-colors truncate max-w-[120px]"
          title={space.name}
        >
          {space.emoji} {space.name}
        </button>
        {breadcrumb.map((crumb) => (
          <React.Fragment key={crumb.id}>
            <ChevronRight size={12} className="flex-shrink-0 text-[#B3BAC5]" />
            <span className="truncate max-w-[120px] text-[#42526E]" title={crumb.title}>
              {crumb.title}
            </span>
          </React.Fragment>
        ))}
        {breadcrumb.length > 0 && (
          <>
            <ChevronRight size={12} className="flex-shrink-0 text-[#B3BAC5]" />
            <span className="text-[#172B4D] font-medium truncate max-w-[150px]">{page.title}</span>
          </>
        )}
      </nav>

      {/* Métadonnées auteur + actions */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 text-[12px] text-[#6B778C]">
          {/* Auteur */}
          {author && (
            <div className="flex items-center gap-1.5">
              <UserAvatar name={author.name} color={author.color} size={20} />
              <span className="font-medium text-[#172B4D]">{author.name}</span>
            </div>
          )}

          {/* Date de création */}
          <span>Créé {relativeDate(page.createdAt)}</span>

          {/* Dernière modification */}
          {page.updatedAt !== page.createdAt && (
            <span className="text-[#97A0AF]">· Modifié {relativeDate(page.updatedAt)}</span>
          )}

          {/* Vues */}
          {page.views > 0 && (
            <span className="flex items-center gap-1 text-[#97A0AF]">
              <Eye size={11} />
              {page.views}
            </span>
          )}
        </div>

        {/* Boutons d'action */}
        <div className="flex items-center gap-1.5">
          {isEditing ? (
            <>
              <button type="button" onClick={onCancel} className="btn-secondary text-[13px] px-3 py-1.5">
                Annuler
              </button>
              <button type="button" onClick={onSave} className="btn-primary text-[13px] px-3 py-1.5">
                Enregistrer
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={onEdit}
                className="btn-secondary flex items-center gap-1.5 text-[13px] px-3 py-1.5"
              >
                <Edit3 size={13} />
                Modifier
              </button>
              <button
                type="button"
                onClick={copyLink}
                className="btn-subtle w-8 h-8 p-0 flex items-center justify-center"
                title="Copier le lien"
              >
                <Share2 size={14} />
              </button>
              <MoreMenu onDelete={onDelete} onCopy={onCopy} />
            </>
          )}
        </div>
      </div>

      {/* Réactions emoji */}
      {!isEditing && <ReactionBar likes={page.likes} />}

      {/* Tags */}
      {page.tags.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {page.tags.map(tag => (
            <span
              key={tag}
              className="px-2 py-0.5 bg-[#DFE1E6] text-[#42526E] text-[11px] font-medium rounded-full"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Séparateur */}
      <div className="border-b border-[#DFE1E6]" />
    </div>
  );
}
