import { createContext, useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react';

type ToastKind = 'success' | 'error' | 'warning' | 'info';
interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  message?: string;
}

export interface ToastValue {
  notify: (kind: ToastKind, title: string, message?: string) => void;
  success: (title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
}

export const ToastContext = createContext<ToastValue | null>(null);

const ICONS = { success: CheckCircle2, error: XCircle, warning: AlertTriangle, info: Info };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const notify = useCallback(
    (kind: ToastKind, title: string, message?: string) => {
      const id = ++seq.current;
      setToasts((t) => [...t.slice(-3), { id, kind, title, message }]);
      setTimeout(() => dismiss(id), kind === 'error' ? 7000 : 4500);
    },
    [dismiss],
  );

  const value = useMemo(
    () => ({
      notify,
      success: (title: string, message?: string) => notify('success', title, message),
      error: (title: string, message?: string) => notify('error', title, message),
    }),
    [notify],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map((t) => {
          const Icon = ICONS[t.kind];
          return (
            <div key={t.id} className={`toast toast-${t.kind}`}>
              <Icon size={18} className="toast-icon" aria-hidden />
              <div className="toast-body">
                <div className="toast-title">{t.title}</div>
                {t.message && <div className="toast-message">{t.message}</div>}
              </div>
              <button className="icon-btn ghost sm" onClick={() => dismiss(t.id)} aria-label="Dismiss notification">
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
