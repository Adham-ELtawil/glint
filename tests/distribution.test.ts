// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { isStoreBuild } from "../src/build-flags";
import { selfUpdates, STORE_BUILD, storeUpdater } from "../src/distribution";
import { UpdateController } from "../src/update/controller";
import type { UpdateState } from "../src/update/model";
import { PlayerView, type ViewActions } from "../src/ui/view";

describe("GLINT_STORE build variable", () => {
  it("only '1' means the Microsoft Store build", () => {
    expect(isStoreBuild("1")).toBe(true);
    expect(isStoreBuild(" 1 ")).toBe(true);
    expect(isStoreBuild(undefined)).toBe(false);
    expect(isStoreBuild("")).toBe(false);
    expect(isStoreBuild("0")).toBe(false);
    expect(isStoreBuild("true")).toBe(false);
  });

  it("follows GLINT_STORE when the build is made", () => {
    // The Store workflow runs the tests with GLINT_STORE=1 too.
    expect(STORE_BUILD).toBe(isStoreBuild(process.env.GLINT_STORE));
  });

  it("only the regular desktop build updates itself", () => {
    expect(selfUpdates(true, false)).toBe(true);
    expect(selfUpdates(true, true)).toBe(false);
    expect(selfUpdates(false, false)).toBe(false);
    expect(selfUpdates(true)).toBe(!STORE_BUILD);
  });
});

describe("the Store build's updater", () => {
  it("never finds an update and cannot install one", async () => {
    await expect(storeUpdater.check()).resolves.toBeNull();
    await expect(storeUpdater.install(() => {})).rejects.toThrow(/Microsoft Store/);
  });

  it("still shows What's new after the Store updated Glint", () => {
    const states: UpdateState[] = [];
    const updates = new UpdateController(storeUpdater, {
      currentVersion: "0.2.3",
      render: (state) => states.push(state),
      setTimer: () => 0,
      clearTimer: () => {},
    });
    updates.showWhatsNew("0.2.3", "- Hold the mouse for 2x");
    expect(updates.current).toEqual({
      kind: "updated",
      version: "0.2.3",
      notes: "- Hold the mouse for 2x",
    });
  });
});

describe("Help menu", () => {
  afterEach(() => document.body.replaceChildren());

  function helpItems(actions: Partial<ViewActions>): string[] {
    const root = document.createElement("div");
    document.body.append(root);
    const all = new Proxy(actions as ViewActions, {
      get: (target, name) =>
        name in target
          ? target[name as keyof ViewActions]
          : name === "checkForUpdates"
            ? undefined
            : () => {},
      has: (target, name) => name in target,
    });
    new PlayerView(root, all, true);
    const help = [...root.querySelectorAll<HTMLButtonElement>(".menu-btn")].find(
      (button) => button.textContent === "Help",
    )!;
    help.click();
    return [...root.querySelectorAll(".menu-item")].map((item) => item.textContent ?? "");
  }

  it("offers 'Check for updates…' in the regular build", () => {
    const check = vi.fn();
    const items = helpItems({ checkForUpdates: check });
    expect(items.some((label) => label.startsWith("Check for updates"))).toBe(true);
  });

  it("leaves it out in the Store build", () => {
    const items = helpItems({});
    expect(items.some((label) => label.startsWith("Check for updates"))).toBe(false);
    expect(items.some((label) => label.startsWith("Star Glint on GitHub"))).toBe(true);
  });
});
