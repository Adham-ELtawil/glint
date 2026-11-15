import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

describe("styles", () => {
  it("lets the hidden attribute win over component display rules", () => {
    // Toasts, pills and menus set `display: flex` on their class and rely on
    // `hidden` alone to disappear (an empty home toast once showed as a white box).
    expect(css).toMatch(/(^|\n)\[hidden\]\s*\{\s*display:\s*none\s*!important;\s*\}/);
  });
});
