import { create } from "zustand";

export interface Toast {
  id: number;
  message: string;
  tone: "error" | "info" | "success";
  errorId?: string | null;
}

interface Store {
  toasts: Toast[];
  push(t: Omit<Toast, "id">): void;
  dismiss(id: number): void;
}

let nextId = 1;

export const useToastStore = create<Store>((set) => ({
  toasts: [],
  push: (t) =>
    set((state) => ({ toasts: [...state.toasts, { ...t, id: nextId++ }] })),
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((x) => x.id !== id) })),
}));

export function pushError(message: string, errorId?: string | null): void {
  useToastStore.getState().push({ message, tone: "error", errorId });
}

export function pushSuccess(message: string): void {
  useToastStore.getState().push({ message, tone: "success" });
}
