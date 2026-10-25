import { describe, expect, it, vi } from "vitest";
import { AUTO_CHECK_DELAY_MS, CURRENT_HIDE_MS, UpdateController } from "../src/update/controller";
import {
  applyDownloadEvent,
  formatProgress,
  progressRatio,
  visibleState,
  type DownloadEvent,
  type UpdateInfo,
  type UpdateState,
  type UpdaterApi,
} from "../src/update/model";

const info: UpdateInfo = { version: "0.1.7", currentVersion: "0.1.6", notes: null };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function setup(api: Partial<UpdaterApi> = {}) {
  const timers: { fn: () => void; ms: number; id: number; cleared: boolean }[] = [];
  const rendered: UpdateState[] = [];
  const beforeInstall = vi.fn();
  const full: UpdaterApi = {
    check: api.check ?? (async () => null),
    install: api.install ?? (async () => {}),
  };
  const controller = new UpdateController(full, {
    currentVersion: "0.1.6",
    render: (state) => rendered.push(state),
    beforeInstall,
    setTimer: (fn, ms) => {
      const id = timers.length + 1;
      timers.push({ fn, ms, id, cleared: false });
      return id;
    },
    clearTimer: (id) => {
      const timer = timers.find((t) => t.id === id);
      if (timer) timer.cleared = true;
    },
  });
  const last = () => rendered[rendered.length - 1];
  return { controller, timers, rendered, last, beforeInstall };
}

describe("update model", () => {
  it("folds download events into progress and then installing", () => {
    let state: UpdateState = { kind: "downloading", version: "0.1.7", received: 0, total: null };
    const events: DownloadEvent[] = [
      { event: "started", data: { contentLength: 1000 } },
      { event: "progress", data: { chunkLength: 250 } },
      { event: "progress", data: { chunkLength: 250 } },
    ];
    for (const event of events) state = applyDownloadEvent(state, event);
    expect(state).toEqual({ kind: "downloading", version: "0.1.7", received: 500, total: 1000 });
    expect(progressRatio(state)).toBe(0.5);
    state = applyDownloadEvent(state, { event: "finished" });
    expect(state).toEqual({ kind: "installing", version: "0.1.7" });
    expect(progressRatio(state)).toBe(1);
  });

  it("ignores download events outside a download", () => {
    const state: UpdateState = { kind: "available", version: "0.1.7" };
    expect(applyDownloadEvent(state, { event: "finished" })).toBe(state);
  });

  it("has no ratio when the size is unknown and clamps overshoot", () => {
    expect(
      progressRatio({ kind: "downloading", version: "1", received: 10, total: null }),
    ).toBeNull();
    expect(progressRatio({ kind: "downloading", version: "1", received: 10, total: 0 })).toBeNull();
    expect(progressRatio({ kind: "downloading", version: "1", received: 20, total: 10 })).toBe(1);
  });

  it("formats megabytes", () => {
    const mb = 1024 * 1024;
    expect(formatProgress({ kind: "downloading", version: "1", received: 0, total: 5 * mb })).toBe(
      "",
    );
    expect(
      formatProgress({ kind: "downloading", version: "1", received: 3.1 * mb, total: 7.4 * mb }),
    ).toBe("3.1 of 7.4 MB");
    expect(
      formatProgress({ kind: "downloading", version: "1", received: 2 * mb, total: null }),
    ).toBe("2.0 MB");
  });

  it("holds offers back in fullscreen but keeps a running download visible", () => {
    const offer: UpdateState = { kind: "available", version: "0.1.7" };
    const download: UpdateState = { kind: "downloading", version: "0.1.7", received: 1, total: 2 };
    expect(visibleState(offer, true)).toEqual({ kind: "idle" });
    expect(visibleState(offer, false)).toBe(offer);
    expect(visibleState(download, true)).toBe(download);
    expect(visibleState({ kind: "current", version: "0.1.6" }, true)).toEqual({ kind: "idle" });
  });
});

describe("UpdateController", () => {
  it("checks silently after a delay and offers a newer version", async () => {
    const check = vi.fn(async () => info);
    const { controller, timers, last } = setup({ check });
    controller.scheduleAutoCheck();
    expect(check).not.toHaveBeenCalled();
    expect(timers[0].ms).toBe(AUTO_CHECK_DELAY_MS);
    timers[0].fn();
    await vi.waitFor(() => expect(last()).toEqual({ kind: "available", version: "0.1.7" }));
  });

  it("shows nothing when a silent check fails or finds nothing", async () => {
    const failing = setup({ check: async () => Promise.reject(new Error("offline")) });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await failing.controller.check(false);
    expect(failing.rendered).toEqual([{ kind: "idle" }]);
    warn.mockRestore();

    const latest = setup({ check: async () => null });
    await latest.controller.check(false);
    expect(latest.rendered).toEqual([{ kind: "idle" }]);
  });

  it("answers a manual check, and hides 'up to date' on its own", async () => {
    const { controller, timers, rendered, last } = setup({ check: async () => null });
    await controller.check(true);
    expect(rendered[0]).toEqual({ kind: "checking" });
    expect(last()).toEqual({ kind: "current", version: "0.1.6" });
    const hide = timers.find((t) => t.ms === CURRENT_HIDE_MS)!;
    hide.fn();
    expect(last()).toEqual({ kind: "idle" });
  });

  it("reports a failed manual check and retries it", async () => {
    const check = vi
      .fn<UpdaterApi["check"]>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(info);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { controller, last } = setup({ check });
    await controller.check(true);
    expect(last()).toEqual({ kind: "failed", step: "check", version: null });
    controller.retry();
    await vi.waitFor(() => expect(last()).toEqual({ kind: "available", version: "0.1.7" }));
    warn.mockRestore();
  });

  it("a silent check never replaces what is on screen", async () => {
    const check = vi.fn(async () => info);
    const { controller } = setup({ check });
    await controller.check(true);
    await controller.check(false);
    expect(check).toHaveBeenCalledTimes(1);
  });

  it("downloads with progress, saves the position first, then installs", async () => {
    const gate = deferred<void>();
    let emit!: (event: DownloadEvent) => void;
    const install = vi.fn(async (onEvent: (event: DownloadEvent) => void) => {
      emit = onEvent;
      await gate.promise;
    });
    const { controller, last, beforeInstall } = setup({ check: async () => info, install });
    await controller.check(false);
    const running = controller.install();
    expect(beforeInstall).toHaveBeenCalledOnce();
    expect(last()).toEqual({ kind: "downloading", version: "0.1.7", received: 0, total: null });
    emit({ event: "started", data: { contentLength: 100 } });
    emit({ event: "progress", data: { chunkLength: 40 } });
    expect(last()).toEqual({ kind: "downloading", version: "0.1.7", received: 40, total: 100 });
    // Busy: neither checks nor Later interrupt it.
    controller.dismiss();
    await controller.check(true);
    expect(last().kind).toBe("downloading");
    emit({ event: "finished" });
    expect(last()).toEqual({ kind: "installing", version: "0.1.7" });
    gate.resolve();
    await running;
    expect(last()).toEqual({ kind: "installing", version: "0.1.7" });
  });

  it("reports a rejected download (bad signature) and can retry the install", async () => {
    const install = vi
      .fn<UpdaterApi["install"]>()
      .mockRejectedValueOnce("signature verification failed")
      .mockResolvedValueOnce();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { controller, last } = setup({ check: async () => info, install });
    await controller.check(false);
    await controller.install();
    expect(last()).toEqual({ kind: "failed", step: "install", version: "0.1.7" });
    controller.retry();
    await vi.waitFor(() => expect(install).toHaveBeenCalledTimes(2));
    warn.mockRestore();
  });

  it("Later hides the offer, and install does nothing without one", async () => {
    const install = vi.fn(async () => {});
    const { controller, last } = setup({ check: async () => info, install });
    await controller.install();
    expect(install).not.toHaveBeenCalled();
    await controller.check(false);
    controller.dismiss();
    expect(last()).toEqual({ kind: "idle" });
  });

  it("waits for fullscreen to end before showing an offer", async () => {
    const { controller, last } = setup({ check: async () => info });
    controller.setFullscreen(true);
    await controller.check(false);
    expect(last()).toEqual({ kind: "idle" });
    controller.setFullscreen(false);
    expect(last()).toEqual({ kind: "available", version: "0.1.7" });
  });

  it("drops a stale check result after Later", async () => {
    const gate = deferred<UpdateInfo | null>();
    const { controller, last } = setup({ check: () => gate.promise });
    const running = controller.check(true);
    controller.dismiss();
    gate.resolve(info);
    await running;
    expect(last()).toEqual({ kind: "idle" });
  });
});
