import { useState, useCallback, useRef, useEffect } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export type AutoSaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface UseAutoSaveOptions {
  /** Délai de debounce en millisecondes (défaut : 2000) */
  delay?: number;
  /** Fonction de sauvegarde asynchrone */
  saveFn: (content: string) => Promise<void>;
}

interface UseAutoSaveReturn {
  status: AutoSaveStatus;
  lastSaved: Date | null;
  /** Déclenche la sauvegarde immédiatement sans debounce */
  saveNow: (content: string) => Promise<void>;
  /** Déclenche la sauvegarde avec debounce (à appeler à chaque changement) */
  scheduleAutoSave: (content: string) => void;
}

// ─── Hook useAutoSave ─────────────────────────────────────────────────────────

export function useAutoSave({ delay = 2000, saveFn }: UseAutoSaveOptions): UseAutoSaveReturn {
  const [status, setStatus] = useState<AutoSaveStatus>('idle');
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveFnRef = useRef(saveFn);
  // Garde la référence à jour sans re-créer les callbacks
  useEffect(() => { saveFnRef.current = saveFn; }, [saveFn]);

  /** Sauvegarde immédiate */
  const saveNow = useCallback(async (content: string) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setStatus('saving');
    try {
      await saveFnRef.current(content);
      setStatus('saved');
      setLastSaved(new Date());
    } catch {
      setStatus('error');
    }
  }, []);

  /** Sauvegarde différée (debounce) */
  const scheduleAutoSave = useCallback((content: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setStatus('idle');
    timerRef.current = setTimeout(async () => {
      setStatus('saving');
      try {
        await saveFnRef.current(content);
        setStatus('saved');
        setLastSaved(new Date());
      } catch {
        setStatus('error');
      }
    }, delay);
  }, [delay]);

  // Nettoyage au démontage
  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  return { status, lastSaved, saveNow, scheduleAutoSave };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Formate le label d'état de sauvegarde en français */
export function formatSaveStatus(status: AutoSaveStatus, lastSaved: Date | null): string {
  switch (status) {
    case 'saving': return 'Enregistrement...';
    case 'saved': {
      if (!lastSaved) return 'Enregistré';
      const diffMs = Date.now() - lastSaved.getTime();
      const diffMin = Math.floor(diffMs / 60000);
      if (diffMin < 1) return 'Enregistré à l\'instant';
      if (diffMin === 1) return 'Enregistré il y a 1 min';
      return `Enregistré il y a ${diffMin} min`;
    }
    case 'error': return 'Erreur d\'enregistrement';
    default: return '';
  }
}
