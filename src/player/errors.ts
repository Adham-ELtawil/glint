const CONTAINER_NEEDS_MPV = new Set([
  "mkv",
  "avi",
  "wmv",
  "flv",
  "ts",
  "m2ts",
  "mts",
  "vob",
  "rmvb",
  "divx",
  "ogv",
]);

export interface MediaErrorCopy {
  title: string;
  body: string;
}

export function describeMediaError(input: {
  filename: string;
  code: number | null;
  extension: string;
}): MediaErrorCopy {
  const ext = input.extension.toLowerCase().replace(/^\./, "");
  const unsupported = input.code === 3 || input.code === 4 || CONTAINER_NEEDS_MPV.has(ext);
  if (unsupported) {
    return {
      title: "This file can't be played",
      body: `${input.filename} uses a format the built-in player doesn't support. Glint plays MP4 and WebM, which is what the system webview can decode. Support for MKV and other formats is planned.`,
    };
  }
  if (input.code === 2) {
    return {
      title: "Playback was interrupted",
      body: `Glint couldn't read ${input.filename}. The file may have moved, or the connection to it dropped.`,
    };
  }
  if (input.code === 1) {
    return {
      title: "Playback was stopped",
      body: `${input.filename} was closed before it could play.`,
    };
  }
  return {
    title: "Something went wrong",
    body: `Glint couldn't play ${input.filename}.`,
  };
}
