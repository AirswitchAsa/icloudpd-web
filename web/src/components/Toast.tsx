import { useEffect } from "react";
import { cn } from "@/lib/cn";
import { useToastStore } from "@/store/toastStore";

const tones = {
  error: "bg-red-50 border-red-200 text-red-800",
  info: "bg-blue-50 border-blue-200 text-blue-800",
  success: "bg-green-50 border-green-200 text-green-800",
};

export function ToastStack() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  useEffect(() => {
    if (toasts.length === 0) return;
    const timers = toasts.map((t) =>
      window.setTimeout(() => dismiss(t.id), t.tone === "error" ? 8000 : 4000)
    );
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [toasts, dismiss]);

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn("border rounded-md px-4 py-2 shadow-md min-w-[16rem]", tones[t.tone])}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-sm">{t.message}</div>
              {t.errorId && (
                <div className="text-xs opacity-70 mt-1">Error ID: {t.errorId}</div>
              )}
            </div>
            <button
              aria-label="Dismiss"
              onClick={() => dismiss(t.id)}
              className="text-sm opacity-60 hover:opacity-100"
            >
              ✕
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
