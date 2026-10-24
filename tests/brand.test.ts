// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { brandMark } from "../src/ui/icons";
import { PlayerView, type ViewActions } from "../src/ui/view";

const pathData = (svg: string) =>
  [...svg.matchAll(/ d="([^"]+)"/g)].map((m) => m[1].replace(/ ([A-Z])/g, "$1"));

describe("brand mark", () => {
  it("shows the Glint star next to the wordmark", () => {
    const root = document.createElement("div");
    const actions = new Proxy({} as ViewActions, { get: () => () => {} });
    new PlayerView(root, actions, false);
    const brand = root.querySelector(".brand")!;
    expect(brand.querySelector(".brand-mark svg linearGradient")).not.toBeNull();
    expect(brand.querySelector(".brand-name")?.textContent).toBe("Glint");
  });

  it("matches the small-size app icon artwork", () => {
    const source = readFileSync("src-tauri/icons/source/glint-small.svg", "utf8");
    expect(pathData(brandMark())).toEqual(pathData(source));
  });
});
