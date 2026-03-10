import React, { useState, useRef, useCallback, useEffect } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TooltipProps {
  content: React.ReactNode;
  shortcut?: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
  delay?: number;
  children: React.ReactElement;
  disabled?: boolean;
}

// ─── Composant Tooltip ────────────────────────────────────────────────────────

export function Tooltip({
  content,
  shortcut,
  position = 'top',
  delay = 300,
  children,
  disabled = false,
}: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const show = useCallback(() => {
    if (disabled) return;
    timerRef.current = setTimeout(() => setVisible(true), delay);
  }, [delay, disabled]);

  const hide = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setVisible(false);
  }, []);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  // Classes de positionnement
  const positionClasses: Record<string, string> = {
    top:    'bottom-full left-1/2 -translate-x-1/2 mb-1.5',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-1.5',
    left:   'right-full top-1/2 -translate-y-1/2 mr-1.5',
    right:  'left-full top-1/2 -translate-y-1/2 ml-1.5',
  };

  return (
    <div
      ref={containerRef}
      className="relative inline-flex"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {visible && !disabled && (
        <div
          role="tooltip"
          className={[
            'absolute z-50 pointer-events-none whitespace-nowrap',
            'bg-[#172B4D] text-white text-[12px] rounded px-2 py-1',
            'shadow-lg flex items-center gap-2',
            positionClasses[position],
          ].join(' ')}
        >
          <span>{content}</span>
          {shortcut && (
            <span className="text-[#7A869A] text-[11px] font-mono">{shortcut}</span>
          )}
        </div>
      )}
    </div>
  );
}
