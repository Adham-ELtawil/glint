// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { UpdateToast } from "../src/ui/update-toast";

function makeToast() {
  const actions = { update: vi.fn(), later: vi.fn(), retry: vi.fn() };
  const toast = new UpdateToast(actions);
  document.body.append(toast.root);
  const q = (selector: string) => toast.root.querySelector<HTMLElement>(selector)!;
  const buttons = () =>
    Array.from(toast.root.querySelectorAll<HTMLButtonElement>("button")).map((b) => b.textContent);
  return { toast, actions, q, buttons };
}

describe("UpdateToast", () => {
  it("is hidden until there is something to say", () => {
    const { toast } = makeToast();
    expect(toast.root.hidden).toBe(true);
    toast.render({ kind: "idle" });
    expect(toast.root.hidden).toBe(true);
  });

  it("offers the update with Later and Update", () => {
    const { toast, actions, q, buttons } = makeToast();
    toast.render({ kind: "available", version: "0.1.7" });
    expect(toast.root.hidden).toBe(false);
    expect(q(".update-toast-title").textContent).toBe("Glint 0.1.7 is available");
    expect(buttons()).toEqual(["Later", "Update"]);
    expect(q(".update-toast-track").hidden).toBe(true);
    q(".update-toast-primary").click();
    expect(actions.update).toHaveBeenCalledOnce();
    q(".update-toast-later").click();
    expect(actions.later).toHaveBeenCalledOnce();
  });

  it("shows download progress without buttons and keeps the same nodes", () => {
    const { toast, q, buttons } = makeToast();
    const mb = 1024 * 1024;
    toast.render({ kind: "downloading", version: "0.1.7", received: 0, total: null });
    expect(q(".update-toast-text").textContent).toBe("Starting the download");
    expect(q(".update-toast-track").classList.contains("is-unknown")).toBe(true);
    toast.render({ kind: "downloading", version: "0.1.7", received: 2 * mb, total: 8 * mb });
    expect(q(".update-toast-title").textContent).toBe("Downloading Glint 0.1.7…");
    expect(q(".update-toast-text").textContent).toBe("25% · 2.0 of 8.0 MB");
    expect(q(".update-toast-bar").style.width).toBe("25.0%");
    expect(q(".update-toast-track").getAttribute("aria-valuenow")).toBe("25");
    expect(buttons()).toEqual([]);
    expect(q(".update-toast-actions").hidden).toBe(true);
    toast.render({ kind: "installing", version: "0.1.7" });
    expect(q(".update-toast-title").textContent).toBe("Installing Glint 0.1.7…");
    expect(q(".update-toast-bar").style.width).toBe("100.0%");
  });

  it("says you're up to date", () => {
    const { toast, q, buttons } = makeToast();
    toast.render({ kind: "current", version: "0.1.6" });
    expect(q(".update-toast-title").textContent).toBe("You're up to date");
    expect(q(".update-toast-text").textContent).toBe("Glint 0.1.6 is the latest version.");
    expect(buttons()).toEqual([]);
  });

  it("offers a retry after a failure", () => {
    const { toast, actions, q, buttons } = makeToast();
    toast.render({ kind: "failed", step: "install", version: "0.1.7" });
    expect(q(".update-toast-title").textContent).toBe("Couldn't install the update");
    expect(buttons()).toEqual(["Later", "Try again"]);
    q(".update-toast-primary").click();
    expect(actions.retry).toHaveBeenCalledOnce();
    toast.render({ kind: "failed", step: "check", version: null });
    expect(buttons()).toEqual(["Close", "Try again"]);
  });

  it("keeps its clicks and keys away from the player", () => {
    const { toast } = makeToast();
    const onDocument = vi.fn();
    document.addEventListener("keydown", onDocument);
    toast.render({ kind: "available", version: "0.1.7" });
    toast.root
      .querySelector("button")!
      .dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
    expect(onDocument).not.toHaveBeenCalled();
    document.removeEventListener("keydown", onDocument);
  });
});
