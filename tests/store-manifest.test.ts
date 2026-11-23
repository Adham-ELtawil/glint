import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const manifest = read("src-tauri/store/AppxManifest.xml");
const tauriConf = JSON.parse(read("src-tauri/tauri.conf.json")) as {
  version: string;
  bundle: { fileAssociations: { ext: string[] }[] };
};
const hooks = read("src-tauri/windows/hooks.nsh");

const attr = (element: string, name: string) =>
  new RegExp(`<${element}\\b[^>]*\\s${name}="([^"]*)"`).exec(manifest)?.[1];
const text = (element: string) =>
  new RegExp(`<${element}>([^<]*)</${element}>`).exec(manifest)?.[1];

describe("Microsoft Store manifest", () => {
  it("uses the identity reserved in Partner Center", () => {
    expect(attr("Identity", "Name")).toBe("AdhamEltawil.GlintVideoPlayer");
    expect(attr("Identity", "Publisher")).toBe("CN=63ED1683-4804-4DAA-8DE3-FFFC10D581DA");
    expect(attr("Identity", "ProcessorArchitecture")).toBe("x64");
    expect(text("DisplayName")).toBe("Glint Video Player");
    expect(text("PublisherDisplayName")).toBe("Adham Eltawil");
  });

  it("takes its version from tauri.conf.json at build time", () => {
    expect(attr("Identity", "Version")).toBe("{{VERSION}}");
    expect(tauriConf.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("runs glint.exe as a full-trust desktop app", () => {
    expect(manifest).toContain('<rescap:Capability Name="runFullTrust" />');
    expect(attr("Application", "Executable")).toBe("glint.exe");
    expect(attr("Application", "EntryPoint")).toBe("Windows.FullTrustApplication");
    expect(attr("TargetDeviceFamily", "MinVersion")).toBe("10.0.17763.0");
  });

  it("opens the same video types as the regular installer", () => {
    const store = [...manifest.matchAll(/<uap:FileType[^>]*>\.([a-z0-9]+)<\/uap:FileType>/g)].map(
      (match) => match[1],
    );
    const associations = tauriConf.bundle.fileAssociations.flatMap((entry) => entry.ext);
    const openWith = [...hooks.matchAll(/!insertmacro \$\{MACRO\} "([a-z0-9]+)"/g)].map(
      (match) => match[1],
    );
    expect(new Set(store).size).toBe(store.length);
    expect([...store].sort()).toEqual([...associations, ...openWith].sort());
  });

  it("references logos that exist", () => {
    const logos = [...manifest.matchAll(/Assets\\([A-Za-z0-9x]+)\.png/g)].map((match) => match[1]);
    expect(logos.length).toBeGreaterThan(0);
    for (const logo of new Set(logos)) {
      // MakePri resolves "Assets\X.png" to the scale-qualified files.
      expect(() => read(`src-tauri/store/Assets/${logo}.scale-100.png`)).not.toThrow();
    }
  });
});
