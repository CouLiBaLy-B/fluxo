import React, { useRef, useEffect, KeyboardEvent } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PageTitleProps {
  value: string;
  onChange: (title: string) => void;
  readOnly?: boolean;
  placeholder?: string;
  /** Callback appelé quand l'utilisateur appuie sur Entrée (pour passer au contenu) */
  onEnter?: () => void;
}

// ─── Composant PageTitle ──────────────────────────────────────────────────────

export function PageTitle({
  value,
  onChange,
  readOnly = false,
  placeholder = 'Titre sans nom',
  onEnter,
}: PageTitleProps) {
  const divRef = useRef<HTMLDivElement>(null);

  // Synchronise le contenu du div avec la valeur prop (sans boucle infinie)
  useEffect(() => {
    const el = divRef.current;
    if (!el || readOnly) return;
    // N'écrase le contenu que si différent pour éviter de déplacer le curseur
    if (el.textContent !== value) {
      el.textContent = value;
    }
  }, [value, readOnly]);

  const handleInput = () => {
    const text = divRef.current?.textContent ?? '';
    onChange(text);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onEnter?.();
    }
  };

  // Mode lecture : simple h1 statique
  if (readOnly) {
    return (
      <h1
        className="text-[40px] font-bold text-[#172B4D] leading-tight tracking-tight"
        style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}
      >
        {value || <span className="text-[#97A0AF] font-normal italic">{placeholder}</span>}
      </h1>
    );
  }

  // Mode édition : contentEditable avec placeholder
  return (
    <div className="relative">
      <div
        ref={divRef}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        spellCheck={false}
        data-placeholder={placeholder}
        className="text-[40px] font-bold text-[#172B4D] leading-tight tracking-tight outline-none"
        style={{
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          minHeight: '1.2em',
          wordBreak: 'break-word',
        }}
        aria-label="Titre de la page"
        role="textbox"
        aria-multiline="false"
      />
      {/* Placeholder affiché quand le titre est vide */}
      {!value && (
        <span
          className="absolute top-0 left-0 text-[40px] font-bold text-[#97A0AF] italic pointer-events-none leading-tight tracking-tight"
          style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}
          aria-hidden="true"
        >
          {placeholder}
        </span>
      )}
    </div>
  );
}
