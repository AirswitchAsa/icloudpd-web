import { create } from "zustand";
import type { RunStatus } from "@/types/api";

export interface LogLine {
  seq: number;
  line: string;
}

export interface RunStateEntry {
  runId: string;
  policyName: string;
  status: RunStatus;
  logs: LogLine[];
  downloaded: number;
  total: number;
  lastEventId: string;
  errorId: string | null;
}

interface Store {
  runs: Record<string, RunStateEntry>;
  init(runId: string, policyName: string): void;
  appendLog(runId: string, line: string, seq: string): void;
  setProgress(runId: string, downloaded: number, total: number): void;
  setStatus(runId: string, status: RunStatus, errorId?: string | null): void;
  clear(runId: string): void;
}

const MAX_LINES = 2000;

export const useRunStore = create<Store>((set) => ({
  runs: {},
  init: (runId, policyName) =>
    set((state) => ({
      runs: {
        ...state.runs,
        [runId]: state.runs[runId] ?? {
          runId,
          policyName,
          status: "running",
          logs: [],
          downloaded: 0,
          total: 0,
          lastEventId: "",
          errorId: null,
        },
      },
    })),
  appendLog: (runId, line, seq) =>
    set((state) => {
      const entry = state.runs[runId];
      if (!entry) return state;
      const seqNum = Number(seq) || entry.logs.length;
      const logs = [...entry.logs, { seq: seqNum, line }].slice(-MAX_LINES);
      return {
        runs: { ...state.runs, [runId]: { ...entry, logs, lastEventId: seq } },
      };
    }),
  setProgress: (runId, downloaded, total) =>
    set((state) => {
      const entry = state.runs[runId];
      if (!entry) return state;
      return { runs: { ...state.runs, [runId]: { ...entry, downloaded, total } } };
    }),
  setStatus: (runId, status, errorId = null) =>
    set((state) => {
      const entry = state.runs[runId];
      if (!entry) return state;
      return {
        runs: {
          ...state.runs,
          [runId]: { ...entry, status, errorId: errorId ?? entry.errorId },
        },
      };
    }),
  clear: (runId) =>
    set((state) => {
      const rest = { ...state.runs };
      delete rest[runId];
      return { runs: rest };
    }),
}));
