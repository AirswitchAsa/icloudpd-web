import { apiFetch } from "./client";
import type { AppSettings } from "@/types/api";

export const settingsApi = {
  get: () => apiFetch<AppSettings>("/settings"),
  put: (settings: AppSettings) =>
    apiFetch<AppSettings>("/settings", { method: "PUT", body: settings }),
};
