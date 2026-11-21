// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { StarCard } from "../src/ui/star-card";

function makeCard() {
  const actions = { star: vi.fn(), notNow: vi.fn(), never: vi.fn() };
  const card = new StarCard(actions);
  document.body.append(card.root);
  const q = (selector: string) => card.root.querySelector<HTMLElement>(selector)!;
  return { card, actions, q };
}

describe("StarCard", () => {
  it("is hidden until shown", () => {
    const { card } = makeCard();
    expect(card.root.hidden).toBe(true);
    card.render(true);
    expect(card.root.hidden).toBe(false);
    card.render(false);
    expect(card.root.hidden).toBe(true);
  });

  it("says thanks briefly and offers three answers", () => {
    const { card, q } = makeCard();
    card.render(true);
    expect(q(".star-card-title").textContent).toBe("Enjoying Glint?");
    expect(q(".star-card-text").textContent).toBe(
      "A GitHub star is a small act that means a lot, and it helps others find Glint.",
    );
    const labels = Array.from(card.root.querySelectorAll("button")).map((b) =>
      (b.getAttribute("aria-label") ?? b.textContent ?? "").trim(),
    );
    expect(labels).toEqual(["Close", "Don't show again", "Not now", "Star on GitHub"]);
  });

  it("wires each button", () => {
    const { card, actions, q } = makeCard();
    card.render(true);
    q(".star-card-primary").click();
    expect(actions.star).toHaveBeenCalledOnce();
    q(".star-card-later").click();
    q(".star-card-close").click();
    expect(actions.notNow).toHaveBeenCalledTimes(2);
    q(".star-card-never").click();
    expect(actions.never).toHaveBeenCalledOnce();
  });

  it("Esc closes it like Not now, but not while typing or when hidden", () => {
    const { card, actions } = makeCard();
    const esc = (target: EventTarget = document.body) =>
      target.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    esc();
    expect(actions.notNow).not.toHaveBeenCalled();
    card.render(true);
    const input = document.createElement("input");
    document.body.append(input);
    esc(input);
    expect(actions.notNow).not.toHaveBeenCalled();
    esc();
    expect(actions.notNow).toHaveBeenCalledOnce();
  });

  it("marks a preview so it is clear the answer is not saved", () => {
    const { card } = makeCard();
    card.render(true, true);
    expect(card.root.dataset.preview).toBe("true");
    card.render(true, false);
    expect(card.root.dataset.preview).toBeUndefined();
  });
});
