import React from 'react';
import { Info, CheckCircle, AlertTriangle, AlertCircle, StickyNote } from 'lucide-react';
import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper, NodeViewContent } from '@tiptap/react';

// ─── Types ────────────────────────────────────────────────────────────────────

export type InfoPanelType = 'info' | 'success' | 'warning' | 'error' | 'note';

interface InfoPanelConfig {
  icon: React.ReactNode;
  bg: string;
  borderColor: string;
  textColor: string;
  label: string;
}

// ─── Configuration par type ───────────────────────────────────────────────────

const PANEL_CONFIG: Record<InfoPanelType, InfoPanelConfig> = {
  info: {
    icon: <Info size={16} />,
    bg: '#DEEBFF',
    borderColor: '#4C9AFF',
    textColor: '#0747A6',
    label: 'Information',
  },
  success: {
    icon: <CheckCircle size={16} />,
    bg: '#E3FCEF',
    borderColor: '#00875A',
    textColor: '#006644',
    label: 'Succès',
  },
  warning: {
    icon: <AlertTriangle size={16} />,
    bg: '#FFFAE6',
    borderColor: '#FF8B00',
    textColor: '#974F0C',
    label: 'Attention',
  },
  error: {
    icon: <AlertCircle size={16} />,
    bg: '#FFEBE6',
    borderColor: '#DE350B',
    textColor: '#BF2600',
    label: 'Erreur',
  },
  note: {
    icon: <StickyNote size={16} />,
    bg: '#F4F5F7',
    borderColor: '#8993A4',
    textColor: '#42526E',
    label: 'Note',
  },
};

// ─── Composant React du panneau (affiché dans l'éditeur TipTap) ───────────────

function InfoPanelView({ node, updateAttributes }: {
  node: { attrs: { panelType: InfoPanelType; title: string } };
  updateAttributes: (attrs: Record<string, unknown>) => void;
}) {
  const panelType: InfoPanelType = (node.attrs.panelType as InfoPanelType) || 'info';
  const config = PANEL_CONFIG[panelType];
  const title = node.attrs.title as string | null;

  return (
    <NodeViewWrapper>
      <div
        className="confluence-info-panel"
        style={{
          background: config.bg,
          borderLeftColor: config.borderColor,
        }}
        data-type="info-panel"
        data-panel-type={panelType}
      >
        {/* Icône colorée */}
        <span
          className="confluence-info-panel__icon"
          style={{ color: config.borderColor }}
          contentEditable={false}
        >
          {config.icon}
        </span>

        <div className="confluence-info-panel__content">
          {/* Titre optionnel */}
          {title !== null && (
            <div
              className="confluence-info-panel__title"
              style={{ color: config.textColor }}
              contentEditable
              suppressContentEditableWarning
              onBlur={e => updateAttributes({ title: e.currentTarget.textContent || '' })}
            >
              {title || config.label}
            </div>
          )}

          {/* Contenu éditable */}
          <NodeViewContent
            style={{ color: config.textColor, fontSize: 14 }}
            className="confluence-info-panel__body"
          />
        </div>

        {/* Sélecteur de type (non éditable) */}
        <select
          contentEditable={false}
          value={panelType}
          onChange={e => updateAttributes({ panelType: e.target.value })}
          className="ml-auto text-[11px] border-none bg-transparent opacity-50 hover:opacity-100 cursor-pointer outline-none"
          title="Type de panneau"
          style={{ color: config.textColor }}
        >
          {(Object.keys(PANEL_CONFIG) as InfoPanelType[]).map(t => (
            <option key={t} value={t}>{PANEL_CONFIG[t].label}</option>
          ))}
        </select>
      </div>
    </NodeViewWrapper>
  );
}

// ─── Extension TipTap pour le panneau ────────────────────────────────────────

export const InfoPanelExtension = Node.create({
  name: 'infoPanel',
  group: 'block',
  content: 'block+',
  atom: false,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      panelType: {
        default: 'info',
        parseHTML: el => el.getAttribute('data-panel-type') as InfoPanelType,
        renderHTML: attrs => ({ 'data-panel-type': attrs.panelType }),
      },
      title: {
        default: null,
        parseHTML: el => el.querySelector('.confluence-info-panel__title')?.textContent ?? null,
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="info-panel"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'info-panel', class: 'confluence-info-panel' }), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(InfoPanelView);
  },
});

// ─── Composant de rendu statique (mode lecture) ───────────────────────────────

interface StaticInfoPanelProps {
  type: InfoPanelType;
  title?: string;
  children: React.ReactNode;
}

export function StaticInfoPanel({ type, title, children }: StaticInfoPanelProps) {
  const config = PANEL_CONFIG[type];
  return (
    <div
      className="confluence-info-panel"
      style={{ background: config.bg, borderLeftColor: config.borderColor }}
    >
      <span className="confluence-info-panel__icon" style={{ color: config.borderColor }}>
        {config.icon}
      </span>
      <div className="confluence-info-panel__content">
        {title && (
          <div className="confluence-info-panel__title" style={{ color: config.textColor }}>
            {title}
          </div>
        )}
        <div style={{ color: config.textColor, fontSize: 14 }}>{children}</div>
      </div>
    </div>
  );
}
