// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HistoryEntry } from "../src/home/history-store";
import type { Thumb } from "../src/home/thumbnails";
import { brandMarkLarge } from "../src/ui/icons";
import { HomeView, type HomeActions, type HomeModel } from "../src/ui/home";

function makeHome(thumb: Thumb = { kind: "fallback", duration: null, missing: false }) {
  const actions = {
    play: vi.fn(),
    openFile: vi.fn(),
    addFolder: vi.fn(),
    removeFolder: vi.fn(),
    removeHistory: vi.fn(),
    clearHistory: vi.fn(),
  } satisfies HomeActions;
  const source = { get: vi.fn(async () => thumb) };
  const view = new HomeView(actions, source);
  document.body.append(view.root);
  view.show();
  return { view, actions, source, root: view.root };
}

const entry = (
  name: string,
  position: number,
  duration: number,
  watchedAt = Date.now(),
): HistoryEntry => ({
  id: `/v/${name}`,
  path: `/v/${name}`,
  filename: name,
  position,
  duration,
  watchedAt,
});

const folder = { path: "/v", name: "Videos", isDefault: true, exists: true };
const video = (name: string) => ({
  path: `/v/${name}`,
  filename: name,
  subfolder: "",
  size: 45_000_000,
  modifiedMs: Date.now(),
});

function model(patch: Partial<HomeModel> = {}): HomeModel {
  return { native: true, history: [], sections: [], scanning: false, ...patch };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe("home empty state", () => {
  it("uses the Glint star, not a red circle", () => {
    const home = makeHome();
    home.view.render(model({ sections: [{ folder, videos: [], truncated: false }] }));
    const empty = home.root.querySelector(".home-empty")!;
    expect(empty).not.toBeNull();
    expect(empty.querySelector(".home-empty-mark svg linearGradient")).not.toBeNull();
    expect(empty.innerHTML).not.toMatch(/<circle/);
    expect(empty.querySelector("h1")?.textContent).toBe("Drop a video to play");
    expect(empty.querySelector(".home-empty-note")?.textContent).toBe(
      "Anything new in Videos will show up here.",
    );
  });

  it("matches the full-size app icon artwork", () => {
    const pathData = (svg: string) =>
      [...svg.matchAll(/ d="([^"]+)"/g)].map((m) => m[1]!.replace(/ ([A-Z])/g, "$1"));
    const source = readFileSync("src-tauri/icons/source/glint.svg", "utf8");
    expect(pathData(brandMarkLarge())).toEqual(pathData(source));
  });

  it("offers Open file and Add a folder in the app, only Open file in the browser", () => {
    const { view, root, actions } = makeHome();
    view.render(model());
    const buttons = [...root.querySelectorAll<HTMLButtonElement>(".home-empty button")];
    expect(buttons.map((b) => b.textContent)).toEqual(["Open file", "Add a folder"]);
    buttons[0]!.click();
    buttons[1]!.click();
    expect(actions.openFile).toHaveBeenCalledOnce();
    expect(actions.addFolder).toHaveBeenCalledOnce();
    view.render(model({ native: false }));
    expect([...root.querySelectorAll(".home-empty button")].map((b) => b.textContent)).toEqual([
      "Open file",
    ]);
  });

  it("shows a skeleton instead of the empty state while the first scan runs", () => {
    const { view, root } = makeHome();
    view.render(model({ scanning: true }));
    expect(root.querySelector(".home-empty")).toBeNull();
    expect(root.querySelector(".skeleton, [class*='skeleton']")).not.toBeNull();
  });
});

describe("continue watching", () => {
  it("renders cards with progress, duration and last-watched text", () => {
    const { view, root } = makeHome();
    view.render(
      model({
        history: [
          { entry: entry("Tears of Steel.mp4", 300, 734, Date.now() - 120_000), available: true },
        ],
      }),
    );
    const card = root.querySelector('[data-shelf="history"] .card')!;
    expect(card.querySelector(".card-title")?.textContent).toBe("Tears of Steel");
    expect([...card.querySelectorAll(".card-meta")].map((m) => m.textContent)).toEqual([
      "v",
      "Watched 2 minutes ago",
    ]);
    expect(card.querySelector(".thumb-badge")?.textContent).toBe("12:14");
    expect((card.querySelector(".thumb-progress-fill") as HTMLElement).style.width).toBe("40.87%");
    expect(card.querySelector(".card-main")?.getAttribute("aria-label")).toContain("41% watched");
  });

  it("resumes on click and removes with the X", () => {
    const { view, root, actions } = makeHome();
    view.render(model({ history: [{ entry: entry("a.mp4", 30, 100), available: true }] }));
    root.querySelector<HTMLButtonElement>(".card-main")!.click();
    expect(actions.play).toHaveBeenCalledWith("/v/a.mp4", { fromStart: false });
    root.querySelector<HTMLButtonElement>(".card-remove")!.click();
    expect(actions.removeHistory).toHaveBeenCalledWith("/v/a.mp4");
    expect(actions.play).toHaveBeenCalledTimes(1);
  });

  it("marks missing files unavailable and does not play them", () => {
    const { view, root, actions } = makeHome();
    view.render(model({ history: [{ entry: entry("gone.mp4", 30, 100), available: false }] }));
    const card = root.querySelector(".card")!;
    expect(card.classList.contains("is-unavailable")).toBe(true);
    expect(card.querySelector(".card-main")?.getAttribute("aria-disabled")).toBe("true");
    expect(card.textContent).toContain("File moved or deleted");
    expect(card.querySelector(".thumb")?.classList.contains("is-fallback")).toBe(true);
    card.querySelector<HTMLButtonElement>(".card-main")!.click();
    expect(actions.play).not.toHaveBeenCalled();
  });

  it("offers resume, start over and remove in the context menu", () => {
    const { view, root, actions } = makeHome();
    view.render(model({ history: [{ entry: entry("a.mp4", 30, 100), available: true }] }));
    root.querySelector(".card")!.dispatchEvent(
      new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        clientX: 10,
        clientY: 10,
      }),
    );
    const menu = root.querySelector<HTMLElement>(".home-menu")!;
    expect(menu.hidden).toBe(false);
    expect(root.classList.contains("menu-open")).toBe(true);
    const items = [...menu.querySelectorAll<HTMLButtonElement>(".menu-item")];
    expect(items.map((i) => i.textContent)).toEqual([
      "Resume",
      "Play from the beginning",
      "Remove from history",
    ]);
    items[1]!.click();
    expect(actions.play).toHaveBeenCalledWith("/v/a.mp4", { fromStart: true });
    expect(menu.hidden).toBe(true);
    expect(root.classList.contains("menu-open")).toBe(false);
  });

  it("removes the focused card with Delete", () => {
    const { view, root, actions } = makeHome();
    view.render(model({ history: [{ entry: entry("a.mp4", 30, 100), available: true }] }));
    const main = root.querySelector<HTMLButtonElement>(".card-main")!;
    main.focus();
    main.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true }));
    expect(actions.removeHistory).toHaveBeenCalledWith("/v/a.mp4");
  });

  it("asks before clearing history, and Esc cancels", () => {
    const { view, root, actions } = makeHome();
    view.render(model({ history: [{ entry: entry("a.mp4", 30, 100), available: true }] }));
    const clear = [...root.querySelectorAll<HTMLButtonElement>("button")].find(
      (b) => b.textContent === "Clear history",
    )!;
    clear.click();
    let panel = root.querySelector<HTMLElement>("[role=alertdialog]")!;
    expect(panel.textContent).toContain("Your video files aren't touched.");
    panel.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(root.querySelector("[role=alertdialog]")).toBeNull();
    expect(actions.clearHistory).not.toHaveBeenCalled();
    clear.click();
    panel = root.querySelector<HTMLElement>("[role=alertdialog]")!;
    [...panel.querySelectorAll<HTMLButtonElement>("button")]
      .find((b) => b.textContent === "Clear history")!
      .click();
    expect(actions.clearHistory).toHaveBeenCalledOnce();
  });
});

describe("library shelves", () => {
  it("shows one shelf per folder with progress from history", () => {
    const { view, root } = makeHome();
    view.render(
      model({
        history: [{ entry: entry("b.mp4", 50, 100), available: true }],
        sections: [{ folder, videos: [video("a.mp4"), video("b.mp4")], truncated: false }],
      }),
    );
    const shelf = root.querySelector('[data-shelf="folder:/v"]')!;
    expect(shelf.querySelector(".shelf-title")?.textContent).toBe("From Videos");
    expect(shelf.querySelector(".shelf-sub")?.textContent).toBe("2 videos");
    const cards = [...shelf.querySelectorAll(".card")];
    expect(cards.map((c) => c.querySelector(".card-title")?.textContent)).toEqual(["a", "b"]);
    expect(cards[0]!.querySelector(".card-meta")?.textContent).toBe("MP4 · 45 MB");
    expect(cards[0]!.querySelector(".thumb-progress")).toBeNull();
    expect(cards[1]!.querySelector(".thumb-progress")).not.toBeNull();
    expect(cards[0]!.querySelector(".card-remove")).toBeNull();
  });

  it("collapses long folders and expands them on demand", () => {
    const { view, root } = makeHome();
    const videos = Array.from({ length: 12 }, (_, i) => video(`${i}.mp4`));
    view.render(model({ sections: [{ folder, videos, truncated: false }] }));
    expect(root.querySelectorAll(".card")).toHaveLength(8);
    const toggle = root.querySelector<HTMLButtonElement>(".shelf-more button")!;
    expect(toggle.textContent).toBe("Show all 12");
    toggle.click();
    expect(root.querySelectorAll(".card")).toHaveLength(12);
    expect(root.querySelector(".shelf-more button")?.textContent).toBe("Show less");
  });

  it("removes a folder from its menu and explains a missing folder", () => {
    const { view, root, actions } = makeHome();
    view.render(
      model({
        sections: [
          { folder, videos: [video("a.mp4")], truncated: false },
          {
            folder: { path: "/gone", name: "Gone", isDefault: false, exists: false },
            videos: [],
            truncated: false,
          },
        ],
      }),
    );
    const missing = root.querySelector('[data-shelf="folder:/gone"]')!;
    expect(missing.querySelector(".shelf-sub")?.textContent).toBe("Folder not found");
    expect(missing.querySelector(".shelf-note")?.textContent).toContain("isn't available");
    missing.querySelector<HTMLButtonElement>(".home-icon-btn")!.click();
    const item = root.querySelector<HTMLButtonElement>(".home-menu .menu-item")!;
    expect(item.textContent).toBe("Remove Gone from Home");
    item.click();
    expect(actions.removeFolder).toHaveBeenCalledWith("/gone");
  });

  it("loads thumbnails and shows a fallback tile for undecodable files", async () => {
    // No layout here, so load immediately instead of waiting to be scrolled into view.
    vi.stubGlobal("IntersectionObserver", undefined);
    const { view, root, source } = makeHome({ kind: "fallback", duration: 42, missing: false });
    vi.unstubAllGlobals();
    view.render(model({ sections: [{ folder, videos: [video("old.avi")], truncated: false }] }));
    await flush();
    const thumb = root.querySelector(".thumb")!;
    expect(source.get).toHaveBeenCalledWith("/v/old.avi");
    expect(thumb.classList.contains("is-fallback")).toBe(true);
    expect(thumb.querySelector(".thumb-ext")?.textContent).toBe("AVI");
    expect(thumb.querySelector(".thumb-badge")?.textContent).toBe("0:42");
  });

  it("only offers Add a folder in the desktop app", () => {
    const { view, root } = makeHome();
    view.render(model({ sections: [{ folder, videos: [video("a.mp4")], truncated: false }] }));
    expect(root.querySelector(".home-add button")?.textContent).toBe("Add a folder");
    view.render(
      model({ native: false, history: [{ entry: entry("a.mp4", 1, 10), available: true }] }),
    );
    expect(root.querySelector(".home-add")).toBeNull();
  });
});

describe("toast", () => {
  it("runs its action once and hides", () => {
    const { view, root } = makeHome();
    const undo = vi.fn();
    view.toast("Removed from history", { label: "Undo", run: undo });
    const toast = root.querySelector<HTMLElement>(".home-toast")!;
    expect(toast.hidden).toBe(false);
    expect(toast.textContent).toContain("Removed from history");
    toast.querySelector<HTMLButtonElement>("button")!.click();
    expect(undo).toHaveBeenCalledOnce();
  });
});
