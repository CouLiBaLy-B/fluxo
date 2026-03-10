import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ReactRenderer } from '@tiptap/react';
import { Extension } from '@tiptap/core';
import Suggestion from '@tiptap/suggestion';
import type { SuggestionKeyDownProps, SuggestionProps } from '@tiptap/suggestion';
import tippy from 'tippy.js';
import type { Instance as TippyInstance, Props as TippyProps } from 'tippy.js';

// ─── Définition des commandes disponibles ─────────────────────────────────────

interface SlashCommand {
  title: string;
  description: string;
  icon: string;
  group: string;
  command: (props: SuggestionProps) => void;
}

export const SLASH_COMMANDS: SlashCommand[] = [
  // Groupe : Texte
  {
    title: 'Paragraphe',
    description: 'Texte normal',
    icon: '¶',
    group: 'Texte',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setParagraph().run();
    },
  },
  {
    title: 'Titre 1',
    description: 'Grand titre de section',
    icon: 'H1',
    group: 'Texte',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHeading({ level: 1 }).run();
    },
  },
  {
    title: 'Titre 2',
    description: 'Titre de sous-section',
    icon: 'H2',
    group: 'Texte',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHeading({ level: 2 }).run();
    },
  },
  {
    title: 'Titre 3',
    description: 'Petit titre',
    icon: 'H3',
    group: 'Texte',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHeading({ level: 3 }).run();
    },
  },

  // Groupe : Listes
  {
    title: 'Liste à puces',
    description: 'Liste avec des points',
    icon: '•',
    group: 'Listes',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBulletList().run();
    },
  },
  {
    title: 'Liste numérotée',
    description: 'Liste ordonnée',
    icon: '1.',
    group: 'Listes',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleOrderedList().run();
    },
  },
  {
    title: 'Liste de tâches',
    description: 'Avec des cases à cocher',
    icon: '☑',
    group: 'Listes',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleTaskList().run();
    },
  },

  // Groupe : Blocs
  {
    title: 'Citation',
    description: 'Extrait mis en avant',
    icon: '"',
    group: 'Blocs',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBlockquote().run();
    },
  },
  {
    title: 'Bloc de code',
    description: 'Code avec coloration syntaxique',
    icon: '</>',
    group: 'Blocs',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleCodeBlock().run();
    },
  },
  {
    title: 'Séparateur',
    description: 'Ligne de séparation horizontale',
    icon: '—',
    group: 'Blocs',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHorizontalRule().run();
    },
  },

  // Groupe : Tableaux
  {
    title: 'Tableau',
    description: 'Tableau 3 colonnes × 3 lignes',
    icon: '⊞',
    group: 'Tableaux',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
    },
  },

  // Groupe : Panneaux
  {
    title: 'Panneau Info',
    description: 'Note d\'information bleue',
    icon: 'ℹ',
    group: 'Panneaux',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range)
        .insertContent({ type: 'infoPanel', attrs: { panelType: 'info' }, content: [{ type: 'paragraph' }] })
        .run();
    },
  },
  {
    title: 'Panneau Succès',
    description: 'Note de confirmation verte',
    icon: '✓',
    group: 'Panneaux',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range)
        .insertContent({ type: 'infoPanel', attrs: { panelType: 'success' }, content: [{ type: 'paragraph' }] })
        .run();
    },
  },
  {
    title: 'Panneau Attention',
    description: 'Avertissement orange',
    icon: '⚠',
    group: 'Panneaux',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range)
        .insertContent({ type: 'infoPanel', attrs: { panelType: 'warning' }, content: [{ type: 'paragraph' }] })
        .run();
    },
  },
  {
    title: 'Panneau Erreur',
    description: 'Alerte erreur rouge',
    icon: '✕',
    group: 'Panneaux',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range)
        .insertContent({ type: 'infoPanel', attrs: { panelType: 'error' }, content: [{ type: 'paragraph' }] })
        .run();
    },
  },
];

// ─── Composant de liste du menu ───────────────────────────────────────────────

interface SlashMenuListProps {
  items: SlashCommand[];
  command: (item: SlashCommand) => void;
}

interface SlashMenuListHandle {
  onKeyDown: (props: SuggestionKeyDownProps) => boolean;
}

const SlashMenuList = React.forwardRef<SlashMenuListHandle, SlashMenuListProps>(
  function SlashMenuList({ items, command }, ref) {
    const [selectedIndex, setSelectedIndex] = useState(0);

    const selectItem = useCallback((index: number) => {
      const item = items[index];
      if (item) command(item);
    }, [items, command]);

    // Navigation clavier exposée au parent via ref
    React.useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }: SuggestionKeyDownProps): boolean => {
        if (event.key === 'ArrowUp') {
          setSelectedIndex(i => (i - 1 + items.length) % items.length);
          return true;
        }
        if (event.key === 'ArrowDown') {
          setSelectedIndex(i => (i + 1) % items.length);
          return true;
        }
        if (event.key === 'Enter') {
          selectItem(selectedIndex);
          return true;
        }
        return false;
      },
    }), [items, selectedIndex, selectItem]);

    // Remet à zéro la sélection quand les items changent
    useEffect(() => setSelectedIndex(0), [items]);

    // Groupe les commandes par catégorie
    const groups = items.reduce<Record<string, SlashCommand[]>>((acc, item) => {
      if (!acc[item.group]) acc[item.group] = [];
      acc[item.group].push(item);
      return acc;
    }, {});

    if (items.length === 0) {
      return (
        <div className="confluence-slash-menu">
          <p className="px-3 py-2 text-[13px] text-[#6B778C]">Aucune commande trouvée</p>
        </div>
      );
    }

    let globalIndex = 0;

    return (
      <div className="confluence-slash-menu">
        {Object.entries(groups).map(([groupName, groupItems]) => (
          <div key={groupName}>
            <div className="confluence-slash-menu__group-title">{groupName}</div>
            {groupItems.map(item => {
              const idx = globalIndex++;
              return (
                <div
                  key={item.title}
                  className={['confluence-slash-menu__item', idx === selectedIndex ? 'confluence-slash-menu__item--active' : ''].join(' ')}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  onClick={() => selectItem(idx)}
                  role="option"
                  aria-selected={idx === selectedIndex}
                >
                  <div className="confluence-slash-menu__icon">
                    <span className="font-mono text-[13px] text-[#6B778C]">{item.icon}</span>
                  </div>
                  <div>
                    <div className="confluence-slash-menu__label">{item.title}</div>
                    <div className="confluence-slash-menu__desc">{item.description}</div>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    );
  }
);

// ─── Extension TipTap Slash Command ──────────────────────────────────────────

export const SlashCommand = Extension.create({
  name: 'slashCommand',

  addOptions() {
    return {
      suggestion: {
        char: '/',
        command: ({ editor, range, props }: { editor: Editor; range: Range; props: SlashCommand }) => {
          props.command({ editor, range });
        },
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
        items: ({ query }: { query: string }) => {
          if (!query) return SLASH_COMMANDS;
          return SLASH_COMMANDS.filter(item =>
            item.title.toLowerCase().includes(query.toLowerCase()) ||
            item.description.toLowerCase().includes(query.toLowerCase())
          );
        },
        render: () => {
          let component: ReactRenderer<SlashMenuListHandle, SlashMenuListProps>;
          let popup: TippyInstance[];

          return {
            onStart: (props: SuggestionProps) => {
              component = new ReactRenderer(SlashMenuList, {
                props,
                editor: props.editor,
              });

              if (!props.clientRect) return;

              popup = tippy('body', {
                getReferenceClientRect: props.clientRect as () => DOMRect,
                appendTo: () => document.body,
                content: component.element,
                showOnCreate: true,
                interactive: true,
                trigger: 'manual',
                placement: 'bottom-start',
                animation: 'shift-away',
                theme: 'confluence-slash',
                maxWidth: 320,
              } as Partial<TippyProps>);
            },

            onUpdate: (props: SuggestionProps) => {
              component.updateProps(props);
              if (!props.clientRect) return;
              popup[0].setProps({
                getReferenceClientRect: props.clientRect as () => DOMRect,
              });
            },

            onKeyDown: (props: SuggestionKeyDownProps): boolean => {
              if (props.event.key === 'Escape') {
                popup[0].hide();
                return true;
              }
              return component.ref?.onKeyDown(props) ?? false;
            },

            onExit: () => {
              popup[0].destroy();
              component.destroy();
            },
          };
        },
      }),
    ];
  },
});

// ─── Types manquants pour éviter les erreurs TypeScript ──────────────────────

type Editor = import('@tiptap/core').Editor;
type Range = import('@tiptap/core').Range;
