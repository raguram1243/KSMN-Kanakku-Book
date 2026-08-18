import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  description?: string;
  duration?: number; // ms
}

interface ToastStore {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => string;
  dismiss: (id: string) => void;
}

export const useToastStore = create<ToastStore>((set, get) => ({
  toasts: [],
  addToast: (newToast) => {
    const id = Math.random().toString(36).substring(2, 9);
    
    // Duplicate prevention: check if there's already an active toast with the same contents
    const duplicate = get().toasts.find(
      (t) =>
        t.type === newToast.type &&
        t.title === newToast.title &&
        t.description === newToast.description
    );
    
    if (duplicate) {
      return duplicate.id; // Return existing ID and don't add duplicate
    }

    const toast: Toast = { ...newToast, id };
    
    set((state) => ({
      toasts: [...state.toasts, toast],
    }));

    // Auto-dismiss duration defaults
    const durations = {
      success: 3500,
      info: 3500,
      warning: 4500,
      error: 6000,
    };
    const duration = newToast.duration || durations[newToast.type];

    setTimeout(() => {
      get().dismiss(id);
    }, duration);

    return id;
  },
  dismiss: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },
}));
