import { describe, expect, it } from "vitest";
import {
  createResumeStore,
  memoryStorage,
  resumePosition,
  RESUME_STORAGE_KEY,
} from "../src/player/resume-store";

describe("resumePosition", () => {
  it("skips the start and the credits", () => {
    expect(resumePosition(null, 100)).toBeNull();
    expect(resumePosition(4.9, 100)).toBeNull();
    expect(resumePosition(12, 100)).toBe(12);
    expect(resumePosition(95, 100)).toBeNull();
    expect(resumePosition(90, 100)).toBe(90);
    expect(resumePosition(12, Number.NaN)).toBe(12);
  });
});

describe("createResumeStore", () => {
  it("remembers volume, speed, and position per file and inherits defaults", () => {
    const store = createResumeStore(memoryStorage());
    store.updateFile("/videos/a.mp4", { position: 42, volume: 0.25, muted: true, rate: 1.5 });
    store.updateFile("/videos/b.mp4", { position: 8, volume: 0.8, muted: false, rate: 1 });

    expect(store.file("/videos/a.mp4")).toMatchObject({
      position: 42,
      volume: 0.25,
      muted: true,
      rate: 1.5,
    });
    expect(store.file("/videos/b.mp4")?.volume).toBe(0.8);
    expect(store.prefs()).toMatchObject({ volume: 0.8, muted: false, rate: 1 });

    expect(store.file("/videos/new.mp4")).toBeNull();
    expect(store.prefs().volume).toBe(0.8);
  });

  it("keeps captions as a global preference", () => {
    const store = createResumeStore(memoryStorage());
    expect(store.prefs().captions).toBe(true);
    store.setCaptions(false);
    expect(store.prefs().captions).toBe(false);
  });

  it("copies a Lumen store into the Glint key once", () => {
    const legacy = JSON.stringify({
      volume: 0.3,
      muted: true,
      rate: 1.25,
      captions: false,
      files: {
        "/clip.mp4": { position: 20, volume: 0.3, muted: true, rate: 1.25, updatedAt: 1 },
      },
    });
    const storage = memoryStorage({ "lumen.player.v1": legacy });
    const store = createResumeStore(storage);
    expect(store.prefs()).toMatchObject({ volume: 0.3, muted: true, rate: 1.25, captions: false });
    expect(store.file("/clip.mp4")?.position).toBe(20);
    expect(storage.getItem("lumen.player.v1")).toBeNull();
    expect(storage.getItem(RESUME_STORAGE_KEY)).toContain("/clip.mp4");

    storage.setItem("lumen.player.v1", JSON.stringify({ volume: 0.1, files: {} }));
    expect(createResumeStore(storage).prefs().volume).toBe(0.3);
    expect(storage.getItem("lumen.player.v1")).toContain("0.1");
  });

  it("recovers from corrupt storage and clamps bad values", () => {
    const storage = memoryStorage({ [RESUME_STORAGE_KEY]: "{not json" });
    expect(createResumeStore(storage).prefs().volume).toBe(1);

    const store = createResumeStore(memoryStorage());
    store.updateFile("clip", { volume: 4, rate: 9, position: -5 });
    expect(store.file("clip")).toMatchObject({ volume: 1, rate: 2, position: 0 });
  });

  it("keeps a subtitle delay per file only", () => {
    const storage = memoryStorage();
    const store = createResumeStore(storage);
    store.updateFile("/a.mp4", { subtitleDelay: -1.234 });
    store.updateFile("/a.mp4", { position: 30 });
    expect(store.file("/a.mp4")?.subtitleDelay).toBe(-1.2);
    expect(store.file("/b.mp4")).toBeNull();
    const reloaded = createResumeStore(storage);
    expect(reloaded.file("/a.mp4")?.subtitleDelay).toBe(-1.2);
    reloaded.updateFile("/a.mp4", { subtitleDelay: 0 });
    expect(reloaded.file("/a.mp4")).not.toHaveProperty("subtitleDelay");
    // Stores written before 0.2.1 have no delay at all.
    const old = memoryStorage({
      "glint.player.v1": JSON.stringify({
        files: { "/c.mp4": { position: 9, subtitleDelay: "x" } },
      }),
    });
    expect(createResumeStore(old).file("/c.mp4")).not.toHaveProperty("subtitleDelay");
  });

  it("forgets the oldest files after the cap", () => {
    const store = createResumeStore(memoryStorage());
    for (let index = 0; index < 205; index += 1) {
      store.updateFile(`file-${index}`, { position: index });
    }
    expect(store.file("file-0")).toBeNull();
    expect(store.file("file-4")).toBeNull();
    expect(store.file("file-204")?.position).toBe(204);
    expect(Object.keys(store.prefs().files)).toHaveLength(200);
  });
});
