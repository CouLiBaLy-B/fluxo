import React, { useState, useRef, useEffect } from 'react';
import type { Editor } from '@tiptap/react';
import {
  Bold, Italic, Underline, Strikethrough, Code, Link2, Highlighter,
  List, ListOrdered, ListChecks, Quote, Minus, Table,
  Heading1, Heading2, Heading3, Type, AlignLeft,
  Subscript, Superscript, Image, Undo, Redo,
  ChevronDown, FileCode,
} from 'lucide-react';
import { Tooltip } from '../ui/Tooltip';

// ─── Types ────────────────────────────────────────────────────────────────────

interface EditorToolbarProps {
  editor: Editor | null;
}

// ─── Bouton de toolbar ────────────────────────────────────────────────────────

interface ToolbarBtnProps {
  label: string;
  shortcut?: string;
  icon: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}

function ToolbarBtn({ label, shortcut, icon, onClick, active = false, disabled = false }: ToolbarBtnProps) {
  return (
    <Tooltip content={label} shortcut={shortcut} position="bottom">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={['confluence-toolbar__btn', active ? 'is-active' : ''].join(' ')}
        aria-label={label}
        aria-pressed={active}
      >
        {icon}
      </button>
    </Tooltip>
  );
}

// ─── Séparateur ───────────────────────────────────────────────────────────────

function Divider() {
  return <div className="confluence-toolbar__divider" aria-hidden="true" />;
}

// ─── Dropdown Niveau de titre ─────────────────────────────────────────────────

const HEADING_OPTIONS = [
  { label: 'Paragraphe', value: 0 },
  { label: 'Titre 1', value: 1 },
  { label: 'Titre 2', value: 2 },
  { label: 'Titre 3', value: 3 },
  { label: 'Titre 4', value: 4 },
];

function HeadingDropdown({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Détermine le niveau actif
  const activeLevel = HEADING_OPTIONS.find(opt => {
    if (opt.value === 0) return editor.isActive('paragraph');
    return editor.isActive('heading', { level: opt.value });
  });

  // Ferme en cliquant à l'extérieur
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const apply = (level: number) => {
    if (level === 0) {
      editor.chain().focus().setParagraph().run();
    } else {
      editor.chain().focus().toggleHeading({ level: level as 1 | 2 | 3 | 4 }).run();
    }
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        className="confluence-toolbar__select flex items-center gap-1.5"
        aria-haspopup="listbox"
        aria-expanded={open}
        style={{ minWidth: 110 }}
      >
        <Type size={13} />
        <span className="text-[12px]">{activeLevel?.label ?? 'Style'}</span>
        <ChevronDown size={11} className={open ? 'rotate-180 transition-transform' : 'transition-transform'} />
      </button>
      {open && (
        <div
          className="absolute top-full left-0 mt-1 z-50 bg-white border border-[#DFE1E6] rounded-lg shadow-lg py-1 min-w-[140px]"
          role="listbox"
        >
          {HEADING_OPTIONS.map(opt => (
            <button
              key={opt.value}
              role="option"
              aria-selected={activeLevel?.value === opt.value}
              type="button"
              onClick={() => apply(opt.value)}
              className={[
                'w-full text-left px-3 py-1.5 text-[13px] hover:bg-[#F4F5F7] transition-colors',
                activeLevel?.value === opt.value ? 'bg-[#DEEBFF] text-[#0052CC] font-medium' : 'text-[#172B4D]',
              ].join(' ')}
              style={opt.value > 0 ? { fontSize: `${1.2 - (opt.value - 1) * 0.1}rem`, fontWeight: 600 } : {}}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Dropdown Couleur de texte ────────────────────────────────────────────────

const TEXT_COLORS = [
  { label: 'Défaut', value: 'inherit' },
  { label: 'Rouge', value: '#DE350B' },
  { label: 'Orange', value: '#FF8B00' },
  { label: 'Vert', value: '#00875A' },
  { label: 'Bleu', value: '#0052CC' },
  { label: 'Violet', value: '#6554C0' },
  { label: 'Gris', value: '#6B778C' },
];

function ColorDropdown({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [activeColor, setActiveColor] = useState('inherit');

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const apply = (color: string) => {
    if (color === 'inherit') {
      editor.chain().focus().unsetColor().run();
    } else {
      editor.chain().focus().setColor(color).run();
    }
    setActiveColor(color);
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <Tooltip content="Couleur du texte" position="bottom">
        <button
          type="button"
          onClick={() => setOpen(prev => !prev)}
          className="confluence-toolbar__btn"
          aria-label="Couleur du texte"
          aria-haspopup="true"
          aria-expanded={open}
        >
          <span className="flex flex-col items-center">
            <span className="text-[11px] font-bold leading-none">A</span>
            <span className="block h-[3px] w-[14px] rounded-sm mt-0.5" style={{ background: activeColor === 'inherit' ? '#172B4D' : activeColor }} />
          </span>
        </button>
      </Tooltip>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-[#DFE1E6] rounded-lg shadow-lg p-2">
          <div className="flex gap-1.5 flex-wrap" style={{ maxWidth: 120 }}>
            {TEXT_COLORS.map(c => (
              <button
                key={c.value}
                type="button"
                onClick={() => apply(c.value)}
                title={c.label}
                className="w-5 h-5 rounded border-2 transition-transform hover:scale-110"
                style={{
                  background: c.value === 'inherit' ? 'linear-gradient(135deg, #fff 50%, #ccc 50%)' : c.value,
                  borderColor: activeColor === c.value ? '#0052CC' : '#DFE1E6',
                }}
                aria-label={c.label}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Composant principal EditorToolbar ───────────────────────────────────────

export function EditorToolbar({ editor }: EditorToolbarProps) {
  if (!editor) return null;

  /** Insère un tableau 3x3 basique */
  const insertTable = () => {
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  };

  /** Ouvre une URL pour un lien */
  const setLink = () => {
    const previousUrl = editor.getAttributes('link').href as string | undefined;
    const url = window.prompt('URL du lien :', previousUrl ?? 'https://');
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url, target: '_blank' }).run();
  };

  /** Insère une image via URL */
  const insertImage = () => {
    const url = window.prompt('URL de l\'image :');
    if (url) editor.chain().focus().setImage({ src: url }).run();
  };

  return (
    <div className="confluence-toolbar" role="toolbar" aria-label="Outils de formatage">
      {/* Undo / Redo */}
      <ToolbarBtn
        label="Annuler" shortcut="Ctrl+Z" icon={<Undo size={14} />}
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
      />
      <ToolbarBtn
        label="Rétablir" shortcut="Ctrl+Y" icon={<Redo size={14} />}
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
      />

      <Divider />

      {/* Sélecteur de niveau de titre */}
      <HeadingDropdown editor={editor} />

      <Divider />

      {/* Formatage inline */}
      <ToolbarBtn
        label="Gras" shortcut="Ctrl+B" icon={<Bold size={14} />}
        onClick={() => editor.chain().focus().toggleBold().run()}
        active={editor.isActive('bold')}
      />
      <ToolbarBtn
        label="Italique" shortcut="Ctrl+I" icon={<Italic size={14} />}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        active={editor.isActive('italic')}
      />
      <ToolbarBtn
        label="Souligné" shortcut="Ctrl+U" icon={<Underline size={14} />}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        active={editor.isActive('underline')}
      />
      <ToolbarBtn
        label="Barré" shortcut="Ctrl+Shift+S" icon={<Strikethrough size={14} />}
        onClick={() => editor.chain().focus().toggleStrike().run()}
        active={editor.isActive('strike')}
      />
      <ToolbarBtn
        label="Code inline" shortcut="Ctrl+E" icon={<Code size={14} />}
        onClick={() => editor.chain().focus().toggleCode().run()}
        active={editor.isActive('code')}
      />
      <ToolbarBtn
        label="Surligner" icon={<Highlighter size={14} />}
        onClick={() => editor.chain().focus().toggleHighlight().run()}
        active={editor.isActive('highlight')}
      />
      <ColorDropdown editor={editor} />
      <ToolbarBtn
        label="Exposant" icon={<Superscript size={14} />}
        onClick={() => editor.chain().focus().toggleSuperscript().run()}
        active={editor.isActive('superscript')}
      />
      <ToolbarBtn
        label="Indice" icon={<Subscript size={14} />}
        onClick={() => editor.chain().focus().toggleSubscript().run()}
        active={editor.isActive('subscript')}
      />

      <Divider />

      {/* Lien */}
      <ToolbarBtn
        label="Lien" shortcut="Ctrl+K" icon={<Link2 size={14} />}
        onClick={setLink}
        active={editor.isActive('link')}
      />

      <Divider />

      {/* Listes */}
      <ToolbarBtn
        label="Liste à puces" icon={<List size={14} />}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        active={editor.isActive('bulletList')}
      />
      <ToolbarBtn
        label="Liste numérotée" icon={<ListOrdered size={14} />}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        active={editor.isActive('orderedList')}
      />
      <ToolbarBtn
        label="Liste de tâches" icon={<ListChecks size={14} />}
        onClick={() => editor.chain().focus().toggleTaskList().run()}
        active={editor.isActive('taskList')}
      />

      <Divider />

      {/* Blocs */}
      <ToolbarBtn
        label="Citation" icon={<Quote size={14} />}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        active={editor.isActive('blockquote')}
      />
      <ToolbarBtn
        label="Bloc de code" icon={<FileCode size={14} />}
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        active={editor.isActive('codeBlock')}
      />
      <ToolbarBtn
        label="Séparateur horizontal" icon={<Minus size={14} />}
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
      />

      <Divider />

      {/* Tableau et image */}
      <ToolbarBtn
        label="Tableau" icon={<Table size={14} />}
        onClick={insertTable}
        active={editor.isActive('table')}
      />
      <ToolbarBtn
        label="Image" icon={<Image size={14} />}
        onClick={insertImage}
      />
    </div>
  );
}
