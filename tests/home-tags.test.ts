// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HistoryEntry } from "../src/home/history-store";
import { pathKey } from "../src/home/model";
import { initialState } from "../src/player/state";
import { HomeView, type HomeActions, type HomeModel } from "../src/ui/home";
import { TagDialog } from "../src/ui/tag-dialog";
import { PlayerView, type ViewActions } from "../src/ui/view";

function makeHome() {
  const actions = {
    play: vi.fn(),
    openFile: vi.fn(),
    addFolder: vi.fn(),
    removeFolder: vi.fn(),
    removeHistory: vi.fn(),
    clearHistory: vi.fn(),
    editTags: vi.fn(),
  } satisfies HomeActions;
  const source = {
    get: vi.fn(async () => ({ kind: "fallback", duration: null, missing: false }) as const),
  };
  const view = new HomeView(actions, source);
  document.body.append(view.root);
  view.show();
  return { view, actions, root: view.root };
}

const entry = (name: string): HistoryEntry => ({
  id: `/v/${name}`,
  path: `/v/${name}`,
  filename: name,
  position: 10,
  duration: 100,
  watchedAt: Date.now(),
});
const video = (name: string) => ({
  path: `/v/${name}`,
  filename: name,
  subfolder: "",
  size: 1_000_000,
  modifiedMs: Date.now(),
});
const folder = { path: "/v", name: "Videos", isDefault: true, exists: true };

function model(tags: Record<string, string[]>): HomeModel {
  return {
    native: true,
    scanning: false,
    history: [{ entry: entry("GOPR0042.mp4"), available: true }],
    sections: [
      {
        folder,
        videos: [video("GOPR0042.mp4"), video("Beach day.mp4"), video("Snow trip.mp4")],
        truncated: false,
      },
    ],
    tags: new Map(Object.entries(tags).map(([name, list]) => [pathKey(`/v/${name}`), list])),
  };
}

const titles = (root: HTMLElement) =>
  [...root.querySelectorAll(".card-title")].map((node) => node.textContent);
const chips = (root: HTMLElement) =>
  [...root.querySelectorAll<HTMLButtonElement>(".home-tag")].map((node) => node.textContent);

afterEach(() => document.body.replaceChildren());

describe("tags on Home", () => {
  it("shows a few chips on each card and +N for the rest", () => {
    const { view, root } = makeHome();
    view.render(model({ "GOPR0042.mp4": ["Snow", "Trip", "Family", "Alps", "2024"] }));
    const card = root.querySelector('[data-shelf="history"] .card')!;
    expect([...card.querySelectorAll(".card-tag")].map((n) => n.textContent)).toEqual([
      "Snow",
      "Trip",
      "Family",
      "+2",
    ]);
    expect(card.querySelector(".card-main")!.getAttribute("aria-label")).toContain(
      "Tags: Snow, Trip, Family, Alps, 2024",
    );
  });

  it("hides the tag bar until something is tagged", () => {
    const { view, root } = makeHome();
    view.render(model({}));
    expect(root.querySelector<HTMLElement>(".home-tags")!.hidden).toBe(true);
    view.render(model({ "Beach day.mp4": ["Family"], "GOPR0042.mp4": ["Family", "Snow"] }));
    expect(root.querySelector<HTMLElement>(".home-tags")!.hidden).toBe(false);
    // Most used first.
    expect(chips(root)).toEqual(["All", "Family", "Snow"]);
  });

  it("filters Continue watching and folders by a tag, and All clears it", () => {
    const { view, root } = makeHome();
    view.render(model({ "Beach day.mp4": ["Family"], "GOPR0042.mp4": ["Snow"] }));
    root.querySelectorAll<HTMLButtonElement>(".home-tag")[1]!.click();
    expect(view.tagFilter).toBe("Family");
    expect(root.querySelector('[data-shelf="history"]')).toBeNull();
    expect(titles(root)).toEqual(["Beach day"]);
    expect(root.querySelector(".home-tag.is-active")!.textContent).toBe("Family");
    // Clicking the active chip again shows everything.
    root.querySelector<HTMLButtonElement>(".home-tag.is-active")!.click();
    expect(view.tagFilter).toBeNull();
    expect(titles(root)).toHaveLength(4);
    root.querySelectorAll<HTMLButtonElement>(".home-tag")[2]!.click();
    expect(titles(root)).toEqual(["GOPR0042", "GOPR0042"]);
    root.querySelector<HTMLButtonElement>(".home-tag")!.click();
    expect(titles(root)).toHaveLength(4);
  });

  it("finds videos by tag in search", () => {
    const { view, root } = makeHome();
    view.render(model({ "GOPR0042.mp4": ["Snowboarding"] }));
    const input = root.querySelector<HTMLInputElement>(".home-search-input")!;
    input.value = "snowboarding";
    input.dispatchEvent(new Event("input"));
    expect(titles(root)).toEqual(["GOPR0042", "GOPR0042"]);
  });

  it("keeps the No videos match state, with a way to clear the filter", () => {
    const { view, root } = makeHome();
    view.render(model({ "Beach day.mp4": ["Family"] }));
    root.querySelectorAll<HTMLButtonElement>(".home-tag")[1]!.click();
    const input = root.querySelector<HTMLInputElement>(".home-search-input")!;
    input.value = "snow";
    input.dispatchEvent(new Event("input"));
    const empty = root.querySelector(".home-no-match")!;
    expect(empty.querySelector("h2")!.textContent).toBe("No videos match");
    expect(empty.textContent).toContain(
      "Nothing tagged \u201cFamily\u201d matches \u201csnow\u201d.",
    );
    empty.querySelector<HTMLButtonElement>("button")!.click();
    expect(view.tagFilter).toBeNull();
    expect(view.searchQuery).toBe("");
    expect(titles(root)).toHaveLength(4);
  });

  it("drops a filter whose tag no longer exists", () => {
    const { view, root } = makeHome();
    view.render(model({ "Beach day.mp4": ["Family"] }));
    root.querySelectorAll<HTMLButtonElement>(".home-tag")[1]!.click();
    view.render(model({ "Beach day.mp4": ["Beach"] }));
    expect(view.tagFilter).toBeNull();
    expect(titles(root)).toHaveLength(4);
  });

  it("offers Add tags in a card's menu", () => {
    const { view, root, actions } = makeHome();
    view.render(model({ "GOPR0042.mp4": ["Snow"] }));
    const cards = root.querySelectorAll<HTMLElement>(".card");
    cards[0]!.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    let item = [...root.querySelectorAll<HTMLButtonElement>(".home-menu .menu-item")].find((node) =>
      node.textContent?.includes("tags"),
    )!;
    expect(item.textContent).toBe("Edit tags\u2026");
    item.click();
    expect(actions.editTags).toHaveBeenCalledWith("/v/GOPR0042.mp4", "GOPR0042.mp4");
    cards[2]!.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    item = [...root.querySelectorAll<HTMLButtonElement>(".home-menu .menu-item")].find((node) =>
      node.textContent?.includes("tags"),
    )!;
    expect(item.textContent).toBe("Add tags\u2026");
  });

  it("says clearing history keeps tags", () => {
    const { view, root } = makeHome();
    view.render(model({}));
    view.confirmClearHistory();
    expect(root.querySelector(".home-dialog-panel")!.textContent).toContain("Tags you added stay.");
  });
});

describe("tag dialog", () => {
  function open(tags: string[] = ["Trip"]) {
    const host = document.createElement("div");
    document.body.append(host);
    const dialog = new TagDialog(host);
    const onSave = vi.fn();
    dialog.open(
      {
        title: "Snowboard trip",
        tags,
        suggestions: ["Snowboard", "Trip"],
        known: ["Family", "Trip"],
      },
      onSave,
    );
    const input = host.querySelector<HTMLInputElement>(".tag-input")!;
    const chipText = () => [...host.querySelectorAll(".tag-chip-text")].map((n) => n.textContent);
    const type = (text: string) => {
      input.value = text;
      input.dispatchEvent(new Event("input"));
    };
    const press = (key: string, init: KeyboardEventInit = {}) =>
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init }),
      );
    return { host, dialog, onSave, input, chipText, type, press };
  }

  it("opens with the current tags and focuses the text box", () => {
    const { host, chipText, input } = open();
    expect(chipText()).toEqual(["Trip"]);
    expect(document.activeElement).toBe(input);
    expect(host.querySelector(".tag-dialog-video")!.textContent).toBe("Snowboard trip");
  });

  it("adds a tag on Enter and every tag before a comma", () => {
    const { chipText, type, press, input } = open();
    type("Family");
    press("Enter");
    expect(chipText()).toEqual(["Trip", "Family"]);
    type("snow, ski, wi");
    expect(chipText()).toEqual(["Trip", "Family", "snow", "ski"]);
    expect(input.value).toBe("wi");
  });

  it("removes a tag with × or Backspace in an empty box", () => {
    const { host, chipText, press } = open(["A", "B", "C"]);
    host.querySelector<HTMLButtonElement>('[aria-label="Remove tag A"]')!.click();
    expect(chipText()).toEqual(["B", "C"]);
    press("Backspace");
    expect(chipText()).toEqual(["B"]);
  });

  it("adds a suggestion on click and hides ones the video has", () => {
    const { host, chipText } = open();
    const ideas = () => [...host.querySelectorAll(".tag-idea")].map((n) => n.textContent);
    expect(ideas()).toEqual(["Snowboard", "Family"]);
    host.querySelector<HTMLButtonElement>(".tag-idea")!.click();
    expect(chipText()).toEqual(["Trip", "Snowboard"]);
    expect(ideas()).toEqual(["Family"]);
  });

  it("saves with what is still typed, and Enter in an empty box saves", () => {
    const first = open();
    first.type("Alps");
    first.host.querySelector<HTMLButtonElement>(".is-primary")!.click();
    expect(first.onSave).toHaveBeenCalledWith(["Trip", "Alps"]);
    expect(first.dialog.isOpen).toBe(false);
    const second = open();
    second.press("Enter");
    expect(second.onSave).toHaveBeenCalledWith(["Trip"]);
  });

  it("Esc and Cancel close without saving", () => {
    const first = open();
    first.type("Alps");
    first.press("Escape");
    expect(first.dialog.isOpen).toBe(false);
    expect(first.onSave).not.toHaveBeenCalled();
    const second = open();
    second.host.querySelector<HTMLButtonElement>(".is-ghost")!.click();
    expect(second.onSave).not.toHaveBeenCalled();
  });

  it("keeps its keys away from the player behind it", () => {
    const root = document.createElement("div");
    document.body.append(root);
    const calls: string[] = [];
    const actions = new Proxy({} as ViewActions, {
      get: (_t, name: string) => () => void calls.push(name),
    });
    const view = new PlayerView(root, actions, true);
    view.render({ ...initialState(), phase: "ready", duration: 100 });
    const dialog = new TagDialog(root);
    dialog.open({ title: "x", tags: [], suggestions: [], known: [] }, () => {});
    // A focused button in the dialog is not a text box, so the player would see it.
    const button = root.querySelector<HTMLButtonElement>(".tag-dialog .is-ghost")!;
    for (const key of ["k", "f", "m", " ", "Backspace"]) {
      button.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
    }
    expect(calls).toEqual([]);
  });
});

describe("player right-click menu", () => {
  it("offers Edit tags for the video that is playing", () => {
    const root = document.createElement("div");
    document.body.append(root);
    const editTags = vi.fn();
    let can = true;
    const actions = new Proxy({} as ViewActions, {
      get: (_t, name: string) =>
        name === "editTags" ? editTags : name === "canEditTags" ? () => can : () => {},
    });
    const view = new PlayerView(root, actions, true);
    view.render({ ...initialState(), phase: "ready", duration: 100 });
    const openMenu = () =>
      root
        .querySelector(".player")!
        .dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    const find = () =>
      [...root.querySelectorAll<HTMLButtonElement>(".context .menu-item")].find((item) =>
        item.textContent?.startsWith("Edit tags"),
      )!;
    openMenu();
    expect(find().disabled).toBe(false);
    find().click();
    expect(editTags).toHaveBeenCalledOnce();
    can = false;
    openMenu();
    expect(find().disabled).toBe(true);
  });
});
