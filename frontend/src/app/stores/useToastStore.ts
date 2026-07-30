import { create } from 'zustand';

export type ToastTone = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  tone: ToastTone;
  title: string;
  description?: string;
  /** Milliseconds before auto-dismiss. 0 keeps the toast until dismissed. */
  duration: number;
  action?: { label: string; onClick: () => void };
}

export interface ToastInput {
  tone?: ToastTone;
  title: string;
  description?: string;
  duration?: number;
  action?: { label: string; onClick: () => void };
}

interface ToastState {
  toasts: Toast[];
  push: (input: ToastInput) => string;
  dismiss: (id: string) => void;
  clear: () => void;
}

// Errors stay on screen longer: they usually carry text the user must read.
const DEFAULT_DURATION: Record<ToastTone, number> = {
  success: 4000,
  info: 5000,
  warning: 7000,
  error: 9000,
};

// Keeps the stack readable; oldest toasts drop off first.
const MAX_VISIBLE = 4;

let counter = 0;
function nextId() {
  counter += 1;
  return `toast-${counter}`;
}

export const useToastStore = create<ToastState>()((set) => ({
  toasts: [],
  push: ({ tone = 'info', title, description, duration, action }) => {
    const id = nextId();
    const toast: Toast = {
      id,
      tone,
      title,
      description,
      duration: duration ?? DEFAULT_DURATION[tone],
      action,
    };
    set((state) => ({ toasts: [...state.toasts, toast].slice(-MAX_VISIBLE) }));
    return id;
  },
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
  clear: () => set({ toasts: [] }),
}));

/**
 * Imperative toast API usable outside React components (query clients,
 * mutation callbacks, plain modules). Mirrors the store actions.
 */
export const toast = {
  success: (title: string, description?: string) =>
    useToastStore.getState().push({ tone: 'success', title, description }),
  error: (title: string, description?: string) =>
    useToastStore.getState().push({ tone: 'error', title, description }),
  warning: (title: string, description?: string) =>
    useToastStore.getState().push({ tone: 'warning', title, description }),
  info: (title: string, description?: string) =>
    useToastStore.getState().push({ tone: 'info', title, description }),
  custom: (input: ToastInput) => useToastStore.getState().push(input),
  dismiss: (id: string) => useToastStore.getState().dismiss(id),
};

/** Normalizes unknown throwables into a displayable message. */
export function toErrorMessage(error: unknown, fallback = 'Erro inesperado.'): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error) return error;
  return fallback;
}
