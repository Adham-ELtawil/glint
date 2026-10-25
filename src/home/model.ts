import type { HistoryEntry } from "./history-store";
import type { FolderScan, LibraryFolder } from "./library";
import type { HomeModel } from "../ui/home";

/**
 * Comparable form of a path. Windows reports some paths with the `\\?\`
 * verbatim prefix and compares them case-insensitively, so both are folded
 * for anything that looks like a Windows path.
 */
export function pathKey(path: string): string {
  let text = path.trim();
  if (text.startsWith("\\\\?\\UNC\\")) text = `\\\\${text.slice(8)}`;
  else if (text.startsWith("\\\\?\\")) text = text.slice(4);
  const windows = /^[a-zA-Z]:[\\/]/.test(text) || text.startsWith("\\\\");
  if (!windows) return text.replace(/\/+$/, "");
  return text.replace(/\//g, "\\").replace(/\\+$/, "").toLowerCase();
}

export function samePath(a: string, b: string): boolean {
  return pathKey(a) === pathKey(b);
}

export interface HomeInput {
  native: boolean;
  history: HistoryEntry[];
  /** pathKey → still on disk. Unknown paths count as available. */
  availability: ReadonlyMap<string, boolean>;
  folders: LibraryFolder[];
  scans: FolderScan[];
  scanning: boolean;
}

export function buildHomeModel(input: HomeInput): HomeModel {
  const scans = new Map(input.scans.map((scan) => [pathKey(scan.path), scan]));
  return {
    native: input.native,
    scanning: input.scanning,
    history: input.history.map((entry) => ({
      entry,
      available: input.availability.get(pathKey(entry.path)) ?? true,
    })),
    sections: input.folders.map((folder) => {
      const scan = scans.get(pathKey(folder.path));
      return {
        folder: { ...folder, exists: scan ? scan.exists : folder.exists },
        videos: scan?.videos ?? [],
        truncated: scan?.truncated ?? false,
      };
    }),
  };
}
