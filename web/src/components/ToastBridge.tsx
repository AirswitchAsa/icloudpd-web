import { useEffect } from "react";
import { useToast } from "@chakra-ui/react";
import { useToastStore } from "@/store/toastStore";

export function ToastBridge() {
  const toast = useToast();
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  useEffect(() => {
    if (toasts.length === 0) return;
    for (const t of toasts) {
      toast({
        title: t.tone === "error" ? "Error" : t.tone === "success" ? "Success" : "Info",
        description: t.errorId ? `${t.message} (${t.errorId})` : t.message,
        status: t.tone,
        duration: t.tone === "error" ? 8000 : 4000,
        isClosable: true,
      });
      dismiss(t.id);
    }
  }, [toasts, toast, dismiss]);

  return null;
}
