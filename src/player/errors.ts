import { STREAM_ERROR } from "./backend";

export interface MediaErrorCopy {
  title: string;
  body: string;
}

export function describeMediaError(input: {
  filename: string;
  code: number | null;
  extension: string;
  /** Converter failure reason, for `STREAM_ERROR`. */
  detail?: string | null;
}): MediaErrorCopy {
  if (input.code === STREAM_ERROR) {
    const reason = input.detail ? `${input.detail} ` : "";
    return {
      title: "This file can't be played",
      body: `${reason}${input.filename} may be damaged, or it uses a format Glint can't convert yet.`,
    };
  }
  if (input.code === 3 || input.code === 4) {
    return {
      title: "This file can't be played",
      body: `${input.filename} uses a format Glint can't play. It may be damaged, or use a codec this computer doesn't have.`,
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
