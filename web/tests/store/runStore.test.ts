import { describe, expect, it, beforeEach } from "vitest";
import { useRunStore } from "@/store/runStore";

describe("runStore", () => {
  beforeEach(() => {
    useRunStore.setState({ runs: {} });
  });

  it("initializes a run", () => {
    useRunStore.getState().init("r1", "p1");
    const run = useRunStore.getState().runs["r1"];
    expect(run.policyName).toBe("p1");
    expect(run.status).toBe("running");
  });

  it("appends logs and caps at 2000", () => {
    useRunStore.getState().init("r1", "p1");
    for (let i = 0; i < 2500; i += 1) {
      useRunStore.getState().appendLog("r1", `line ${i}`, String(i));
    }
    const logs = useRunStore.getState().runs["r1"].logs;
    expect(logs.length).toBe(2000);
    expect(logs[0].line).toBe("line 500");
    expect(logs[logs.length - 1].line).toBe("line 2499");
  });

  it("updates status and progress", () => {
    useRunStore.getState().init("r1", "p1");
    useRunStore.getState().setProgress("r1", 3, 10);
    useRunStore.getState().setStatus("r1", "success");
    const run = useRunStore.getState().runs["r1"];
    expect(run.downloaded).toBe(3);
    expect(run.total).toBe(10);
    expect(run.status).toBe("success");
  });
});
