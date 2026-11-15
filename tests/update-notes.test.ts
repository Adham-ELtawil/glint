import { describe, expect, it } from "vitest";
import { changelogSection, parseInline, parseNotes } from "../src/update/notes";
import { compareVersions, LAST_VERSION_KEY, takeWhatsNew } from "../src/update/whats-new";
import changelog from "../CHANGELOG.md?raw";
import { APP_VERSION } from "../src/version";

const CHANGELOG = [
  "# Changelog",
  "",
  "## [Unreleased]",
  "",
  "## [0.2.1] - 2026-11-15",
  "",
  "### Added",
  "",
  "- New thing",
  "",
  "## [0.2.0] - 2026-10-29",
  "",
  "- Old thing",
  "",
  "[0.2.1]: https://example.com",
].join("\n");

function storage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

describe("release notes", () => {
  it("parses bold, code and links into runs", () => {
    expect(parseInline("**Bold** and `code` [link](http://x) end")).toEqual([
      { text: "Bold", bold: true },
      { text: " and " },
      { text: "code", code: true },
      { text: " link end" },
    ]);
  });

  it("turns headings and nested bullets into blocks", () => {
    const blocks = parseNotes("### Added\n\n- One\n  - Two\n    wrapped\n\nPlain\n---");
    expect(blocks).toEqual([
      { kind: "heading", text: "Added" },
      { kind: "item", depth: 0, runs: [{ text: "One" }] },
      { kind: "item", depth: 1, runs: [{ text: "Two" }, { text: " wrapped" }] },
      { kind: "text", runs: [{ text: "Plain" }] },
    ]);
    expect(parseNotes(null)).toEqual([]);
  });

  it("finds one version's changelog section", () => {
    expect(changelogSection(CHANGELOG, "0.2.1")).toBe("### Added\n\n- New thing");
    expect(changelogSection(CHANGELOG, "0.2.0")).toBe("- Old thing");
    expect(changelogSection(CHANGELOG, "9.9.9")).toBeNull();
  });

  it("has notes for this version in the bundled changelog", () => {
    const section = changelogSection(changelog, APP_VERSION);
    expect(section).toBeTruthy();
    expect(parseNotes(section).length).toBeGreaterThan(2);
  });
});

describe("what's new", () => {
  it("compares versions numerically", () => {
    expect(compareVersions("0.2.10", "0.2.9")).toBe(1);
    expect(compareVersions("0.2.1", "0.2.1")).toBe(0);
    expect(compareVersions("0.1.7", "0.2.0")).toBe(-1);
  });

  it("shows nothing on a fresh install, and remembers the version", () => {
    const s = storage();
    expect(takeWhatsNew(s, "0.2.1", CHANGELOG)).toBeNull();
    expect(s.data.get(LAST_VERSION_KEY)).toBe("0.2.1");
    expect(takeWhatsNew(s, "0.2.1", CHANGELOG)).toBeNull();
  });

  it("shows the notes once after an update", () => {
    const s = storage({ [LAST_VERSION_KEY]: "0.2.0" });
    expect(takeWhatsNew(s, "0.2.1", CHANGELOG)).toEqual({
      version: "0.2.1",
      notes: "### Added\n\n- New thing",
    });
    expect(takeWhatsNew(s, "0.2.1", CHANGELOG)).toBeNull();
  });

  it("treats users of versions before 0.2.1 as updated", () => {
    const s = storage({ "glint.player.v1": "{}" });
    expect(takeWhatsNew(s, "0.2.1", CHANGELOG)?.version).toBe("0.2.1");
  });

  it("stays quiet when storage fails or a version has no notes", () => {
    const broken = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {},
    };
    expect(takeWhatsNew(broken, "0.2.1", CHANGELOG)).toBeNull();
    expect(takeWhatsNew(storage({ [LAST_VERSION_KEY]: "0.2.1" }), "0.2.2", CHANGELOG)).toBeNull();
  });
});
