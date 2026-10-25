/** Shapes shared by the home screen and the desktop bridge. */

export interface LibraryFolder {
  path: string;
  name: string;
  isDefault: boolean;
  exists: boolean;
}

export interface LibraryVideo {
  path: string;
  filename: string;
  /** Subfolder relative to the library folder, empty at the top level. */
  subfolder: string;
  size: number;
  modifiedMs: number;
}

export interface FolderScan {
  path: string;
  name: string;
  exists: boolean;
  truncated: boolean;
  videos: LibraryVideo[];
}

export interface MediaInfo {
  path: string;
  exists: boolean;
  size: number;
  modifiedMs: number;
  thumbnail: string | null;
  thumbnailFailed: boolean;
  duration: number | null;
}

/**
 * What the home screen needs from the platform. The desktop app implements
 * it with Rust commands; the browser preview has no file system and returns
 * nothing, so it only ever shows the empty state.
 */
export interface LibraryApi {
  readonly available: boolean;
  folders(): Promise<LibraryFolder[]>;
  addFolder(path: string): Promise<LibraryFolder[]>;
  removeFolder(path: string): Promise<LibraryFolder[]>;
  pickFolder(defaultPath?: string): Promise<string | null>;
  scan(): Promise<FolderScan[]>;
  mediaInfo(paths: string[]): Promise<MediaInfo[]>;
  saveThumbnail(path: string, data: string | null, duration: number | null): Promise<void>;
  mediaUrl(path: string): Promise<string>;
}

export const offlineLibrary: LibraryApi = {
  available: false,
  folders: async () => [],
  addFolder: async () => [],
  removeFolder: async () => [],
  pickFolder: async () => null,
  scan: async () => [],
  mediaInfo: async (paths) =>
    paths.map((path) => ({
      path,
      exists: false,
      size: 0,
      modifiedMs: 0,
      thumbnail: null,
      thumbnailFailed: false,
      duration: null,
    })),
  saveThumbnail: async () => {},
  mediaUrl: async () => {
    throw new Error("No file system in the browser preview.");
  },
};
