import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { CheckCircle, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
}

interface ToastContextValue {
  toasts: Toast[];
  toast: (opts: Omit<Toast, 'id'>) => void;
  dismiss: (id: string) => void;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

// ─── Configuration visuelle par type ──────────────────────────────────────────

const TOAST_CONFIG: Record<ToastType, {
  icon: React.ReactNode;
  bg: string;
  border: string;
  iconColor: string;
}> = {
  success: {
    icon: <CheckCircle size={16} />,
    bg: '#E3FCEF',
    border: '#00875A',
    iconColor: '#00875A',
  },
  error: {
    icon: <AlertCircle size={16} />,
    bg: '#FFEBE6',
    border: '#DE350B',
    iconColor: '#DE350B',
  },
  info: {
    icon: <Info size={16} />,
    bg: '#DEEBFF',
    border: '#4C9AFF',
    iconColor: '#0052CC',
  },
  warning: {
    icon: <AlertTriangle size={16} />,
    bg: '#FFFAE6',
    border: '#FF8B00',
    iconColor: '#FF8B00',
  },
};

// ─── Toast Item ───────────────────────────────────────────────────────────────

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  const config = TOAST_CONFIG[toast.type];
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    // Animation d'entrée
    const enterTimer = setTimeout(() => setVisible(true), 10);
    // Auto-dismiss
    const duration = toast.duration ?? 4000;
    const dismissTimer = setTimeout(() => {
      setVisible(false);
      setTimeout(() => onDismiss(toast.id), 250);
    }, duration);
    return () => {
      clearTimeout(enterTimer);
      clearTimeout(dismissTimer);
    };
  }, [toast.id, toast.duration, onDismiss]);

  return (
    <div
      style={{
        background: config.bg,
        borderLeft: `4px solid ${config.border}`,
        transform: visible ? 'translateX(0)' : 'translateX(calc(100% + 16px))',
        opacity: visible ? 1 : 0,
        transition: 'transform 0.25s ease, opacity 0.25s ease',
      }}
      className="flex items-start gap-3 rounded-r-lg px-4 py-3 shadow-lg min-w-[280px] max-w-[380px]"
    >
      <span style={{ color: config.iconColor }} className="flex-shrink-0 mt-0.5">
        {config.icon}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold text-[#172B4D] leading-tight">{toast.title}</p>
        {toast.message && (
          <p className="text-[12px] text-[#42526E] mt-0.5 leading-snug">{toast.message}</p>
        )}
      </div>
      <button
        onClick={() => { setVisible(false); setTimeout(() => onDismiss(toast.id), 250); }}
        className="flex-shrink-0 w-5 h-5 rounded flex items-center justify-center text-[#6B778C] hover:text-[#172B4D] hover:bg-black/10 transition-colors mt-0.5"
        aria-label="Fermer la notification"
      >
        <X size={12} />
      </button>
    </div>
  );
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counterRef = useRef(0);

  const toast = useCallback((opts: Omit<Toast, 'id'>) => {
    const id = `toast-${++counterRef.current}`;
    setToasts(prev => [...prev, { ...opts, id }]);
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, toast, dismiss }}>
      {children}
      {/* Conteneur des toasts — coin bas-droit */}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none"
      >
        {toasts.map(t => (
          <div key={t.id} className="pointer-events-auto">
            <ToastItem toast={t} onDismiss={dismiss} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
