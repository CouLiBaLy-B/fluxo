import React from 'react';
import { useEditor, EditorContent, BubbleMenu } from '@tiptap/react';
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { DOMParser as ProseMirrorDOMParser } from '@tiptap/pm/model';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Typography from '@tiptap/extension-typography';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import TableExtension from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';
import Color from '@tiptap/extension-color';
import TextStyle from '@tiptap/extension-text-style';
import Highlight from '@tiptap/extension-highlight';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import CharacterCount from '@tiptap/extension-character-count';
import Underline from '@tiptap/extension-underline';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import { createLowlight } from 'lowlight';
import typescript from 'highlight.js/lib/languages/typescript';
import javascript from 'highlight.js/lib/languages/javascript';
import python from 'highlight.js/lib/languages/python';
import bash from 'highlight.js/lib/languages/bash';
import sql from 'highlight.js/lib/languages/sql';
import json from 'highlight.js/lib/languages/json';
import xml from 'highlight.js/lib/languages/xml';
import css from 'highlight.js/lib/languages/css';
import go from 'highlight.js/lib/languages/go';
import rust from 'highlight.js/lib/languages/rust';
import java from 'highlight.js/lib/languages/java';
import csharp from 'highlight.js/lib/languages/csharp';

import {
  Bold, Italic, Underline as UnderlineIcon, Link2, Code,
  Strikethrough, Highlighter,
} from 'lucide-react';

import { EditorToolbar } from './EditorToolbar';
import { SlashCommand } from './SlashCommandMenu';
import { InfoPanelExtension } from './InfoPanel';
import { useAutoSave, formatSaveStatus } from '../../hooks/useAutoSave';

import '../../styles/confluence.css';

// ─── Configuration lowlight (coloration syntaxique) ──────────────────────────

const lowlight = createLowlight();
lowlight.register('typescript', typescript);
lowlight.register('javascript', javascript);
lowlight.register('python', python);
lowlight.register('bash', bash);
lowlight.register('sql', sql);
lowlight.register('json', json);
lowlight.register('xml', xml);
lowlight.register('html', xml);
lowlight.register('css', css);
lowlight.register('go', go);
lowlight.register('rust', rust);
lowlight.register('java', java);
lowlight.register('csharp', csharp);

// ─── Markdown paste support ───────────────────────────────────────────────────

/** Retourne true si le texte contient suffisamment de motifs Markdown */
function isMaybeMarkdown(text: string): boolean {
  const patterns = [
    /^#{1,6}\s/m,
    /^\s*[-*+]\s+\S/m,
    /^\s*\d+\.\s+\S/m,
    /^\s*>\s+/m,
    /^```/m,
    /\*\*[^*\n]+\*\*/,
    /`[^`\n]+`/,
    /\[[^\]]+\]\([^)]+\)/,
    /^---+\s*$/m,
  ];
  return patterns.filter(p => p.test(text)).length >= 2;
}

/** Convertit du Markdown basique en HTML compatible TipTap */
function markdownToHtml(md: string): string {
  const escHtml = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const inline = (s: string) =>
    s
      .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/__(.+?)__/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/_(.+?)_/g, '<em>$1</em>')
      .replace(/~~(.+?)~~/g, '<s>$1</s>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');

  const lines = md.split('\n');
  const out: string[] = [];
  let inCode = false;
  let codeLang = '';
  let codeLines: string[] = [];
  let inTable = false;
  let tableRows: string[] = [];

  const flushTable = () => {
    if (!tableRows.length) return;
    out.push('<table>');
    tableRows.forEach((row, idx) => {
      if (row.replace(/[|\-\s]/g, '') === '') return;
      const cells = row.split('|').slice(1, -1);
      const tag = idx === 0 ? 'th' : 'td';
      out.push('<tr>' + cells.map(c => `<${tag}>${inline(c.trim())}</${tag}>`).join('') + '</tr>');
    });
    out.push('</table>');
    tableRows = [];
    inTable = false;
  };

  for (const line of lines) {
    if (line.startsWith('```')) {
      if (inCode) {
        out.push(`<pre><code class="language-${codeLang || 'text'}">${escHtml(codeLines.join('\n'))}</code></pre>`);
        inCode = false; codeLines = []; codeLang = '';
      } else {
        if (inTable) flushTable();
        codeLang = line.slice(3).trim();
        inCode = true;
      }
      continue;
    }
    if (inCode) { codeLines.push(line); continue; }
    if (line.trim().startsWith('|')) { inTable = true; tableRows.push(line); continue; }
    if (inTable) flushTable();

    if (/^#{4}\s/.test(line))      { out.push(`<h4>${inline(line.slice(5))}</h4>`); continue; }
    if (/^#{3}\s/.test(line))      { out.push(`<h3>${inline(line.slice(4))}</h3>`); continue; }
    if (/^#{2}\s/.test(line))      { out.push(`<h2>${inline(line.slice(3))}</h2>`); continue; }
    if (/^#{1}\s/.test(line))      { out.push(`<h1>${inline(line.slice(2))}</h1>`); continue; }
    if (/^---+\s*$/.test(line))    { out.push('<hr>'); continue; }
    if (/^>\s+/.test(line))        { out.push(`<blockquote><p>${inline(line.replace(/^>\s*/, ''))}</p></blockquote>`); continue; }

    const trimmed = line.trimStart();
    if (/^\d+\.\s/.test(trimmed))            { out.push(`<li data-ol>${inline(trimmed.replace(/^\d+\.\s/, ''))}</li>`); continue; }
    if (/^[-*+]\s/.test(trimmed))            { out.push(`<li>${inline(trimmed.slice(2))}</li>`); continue; }
    if (line.trim() === '')                   { out.push('<p></p>'); continue; }
    out.push(`<p>${inline(line)}</p>`);
  }
  if (inTable) flushTable();
  if (inCode && codeLines.length) {
    out.push(`<pre><code class="language-${codeLang || 'text'}">${escHtml(codeLines.join('\n'))}</code></pre>`);
  }

  return out.join('')
    .replace(/(<li data-ol>[\s\S]*?<\/li>)+/g, m => `<ol>${m.replace(/ data-ol/g, '')}</ol>`)
    .replace(/(<li>(?!<li)[\s\S]*?<\/li>)+/g, m => `<ul>${m}</ul>`);
}

/** Extension TipTap : gestion du collé Markdown → HTML riche */
const MarkdownPasteExtension = Extension.create({
  name: 'markdownPaste',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('markdownPaste'),
        props: {
          handlePaste(view, event) {
            const text = event.clipboardData?.getData('text/plain') ?? '';
            if (!text || !isMaybeMarkdown(text)) return false;

            event.preventDefault();
            const html = markdownToHtml(text);

            const tempEl = document.createElement('div');
            tempEl.innerHTML = html;

            const parser = ProseMirrorDOMParser.fromSchema(view.state.schema);
            const slice = parser.parseSlice(tempEl);
            const tr = view.state.tr.replaceSelection(slice);
            view.dispatch(tr);
            return true;
          },
        },
      }),
    ];
  },
});

// ─── Types ────────────────────────────────────────────────────────────────────

interface RichTextEditorProps {
  /** Contenu HTML initial */
  content: string;
  /** Callback appelé à chaque changement */
  onChange: (html: string) => void;
  /** Fonction de sauvegarde asynchrone (pour l'auto-save) */
  onSave?: (html: string) => Promise<void>;
  /** Mode lecture seule */
  readOnly?: boolean;
  /** Texte affiché quand l'éditeur est vide */
  placeholder?: string;
  /** Hauteur minimale de la zone d'édition */
  minHeight?: number;
}

// ─── Composant RichTextEditor ─────────────────────────────────────────────────

export function RichTextEditor({
  content,
  onChange,
  onSave,
  readOnly = false,
  placeholder = 'Commencez à écrire… Tapez / pour insérer un bloc.',
  minHeight = 400,
}: RichTextEditorProps) {

  // Auto-save : déclenche la sauvegarde 2 secondes après chaque modification
  const { status: saveStatus, lastSaved, scheduleAutoSave } = useAutoSave({
    delay: 2000,
    saveFn: onSave ?? (() => Promise.resolve()),
  });

  // Initialisation de TipTap avec toutes les extensions
  const editor = useEditor({
    editable: !readOnly,
    content,
    editorProps: {
      attributes: {
        class: 'confluence-editor-content',
        spellcheck: 'true',
      },
    },
    extensions: [
      // Kit de base : paragraphes, titres, listes, code, blockquote, HR, etc.
      StarterKit.configure({
        // On remplace codeBlock par CodeBlockLowlight pour la coloration syntaxique
        codeBlock: false,
        // Désactive heading pour le configurer séparément si besoin
      }),

      // Raccourcis typographiques automatiques (-- → —, ... → …, etc.)
      Typography,

      // Placeholder quand l'éditeur est vide
      Placeholder.configure({ placeholder }),

      // Liens hypertextes avec ouverture dans un nouvel onglet
      Link.configure({
        openOnClick: false,
        autolink: true,
        defaultProtocol: 'https',
        HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer' },
      }),

      // Images
      Image.configure({ inline: false, allowBase64: true }),

      // Tableaux
      TableExtension.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,

      // Couleur de texte
      TextStyle,
      Color,

      // Surlignage
      Highlight.configure({ multicolor: false }),

      // Listes de tâches avec cases à cocher
      TaskList,
      TaskItem.configure({ nested: true }),

      // Bloc de code avec coloration syntaxique
      CodeBlockLowlight.configure({
        lowlight,
        defaultLanguage: 'typescript',
        HTMLAttributes: { class: 'confluence-code-block-prosemirror' },
      }),

      // Compteur de mots/caractères
      CharacterCount,

      // Formatage inline supplémentaire
      Underline,
      Subscript,
      Superscript,

      // Menu de slash commands (/)
      SlashCommand,

      // Panneaux Info/Warning/Error/Success/Note
      InfoPanelExtension,

      // Collé Markdown → HTML riche
      MarkdownPasteExtension,
    ],
    onUpdate: ({ editor: e }) => {
      const html = e.getHTML();
      onChange(html);
      if (onSave) scheduleAutoSave(html);
    },
  });

  // Met à jour l'éditeur quand le contenu change depuis l'extérieur
  // (ex: changement de page sélectionnée)
  React.useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content, false);
    }
  }, [content, editor]);

  // Bascule le mode lecture/édition
  React.useEffect(() => {
    if (editor) editor.setEditable(!readOnly);
  }, [readOnly, editor]);

  const wordCount = editor?.storage.characterCount?.words() ?? 0;
  const saveLabel = formatSaveStatus(saveStatus, lastSaved);

  return (
    <div
      className={[
        'confluence-editor-wrapper',
        'flex flex-col',
        readOnly ? 'is-read-only' : 'is-editing',
      ].join(' ')}
    >
      {/* Toolbar fixe — masquée en mode lecture */}
      {!readOnly && <EditorToolbar editor={editor} />}

      {/* Bubble menu — apparaît lors d'une sélection de texte */}
      {editor && !readOnly && (
        <BubbleMenu
          editor={editor}
          tippyOptions={{ duration: 100, placement: 'top' }}
          className="confluence-bubble-menu"
        >
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={editor.isActive('bold') ? 'is-active' : ''}
            aria-label="Gras"
            title="Gras (Ctrl+B)"
          >
            <Bold size={13} />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={editor.isActive('italic') ? 'is-active' : ''}
            aria-label="Italique"
            title="Italique (Ctrl+I)"
          >
            <Italic size={13} />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            className={editor.isActive('underline') ? 'is-active' : ''}
            aria-label="Souligné"
            title="Souligné (Ctrl+U)"
          >
            <UnderlineIcon size={13} />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleStrike().run()}
            className={editor.isActive('strike') ? 'is-active' : ''}
            aria-label="Barré"
            title="Barré"
          >
            <Strikethrough size={13} />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleCode().run()}
            className={editor.isActive('code') ? 'is-active' : ''}
            aria-label="Code inline"
            title="Code inline (Ctrl+E)"
          >
            <Code size={13} />
          </button>
          <div className="confluence-bubble-menu__divider" />
          <button
            type="button"
            onClick={() => {
              const url = window.prompt('URL du lien :', editor.getAttributes('link').href ?? '');
              if (url) editor.chain().focus().setLink({ href: url, target: '_blank' }).run();
            }}
            className={editor.isActive('link') ? 'is-active' : ''}
            aria-label="Lien"
            title="Lien (Ctrl+K)"
          >
            <Link2 size={13} />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleHighlight().run()}
            className={editor.isActive('highlight') ? 'is-active' : ''}
            aria-label="Surligner"
            title="Surligner"
          >
            <Highlighter size={13} />
          </button>
        </BubbleMenu>
      )}

      {/* Zone de contenu TipTap */}
      <div
        className="flex-1 overflow-y-auto"
        style={{ minHeight }}
        onClick={() => { if (!readOnly) editor?.commands.focus(); }}
      >
        <EditorContent editor={editor} />
      </div>

      {/* Pied de page : compteur de mots + statut auto-save */}
      {!readOnly && (
        <div className="confluence-editor-footer">
          <span>{wordCount} mot{wordCount !== 1 ? 's' : ''}</span>
          {saveLabel && (
            <span className={[
              'confluence-editor-footer__save',
              saveStatus === 'saved'  ? 'confluence-editor-footer__save--saved'  : '',
              saveStatus === 'saving' ? 'confluence-editor-footer__save--saving' : '',
              saveStatus === 'error'  ? 'confluence-editor-footer__save--error'  : '',
            ].join(' ')}>
              {saveLabel}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
