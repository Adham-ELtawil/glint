import type { MediaSource } from "../model/media";

export type PlaybackKind = "html5" | "libmpv";

export interface TimeRange {
  start: number;
  end: number;
}

export type PlaybackStatus =
  "idle" | "loading" | "ready" | "playing" | "paused" | "ended" | "error";

export interface PlaybackSnapshot {
  status: PlaybackStatus;
  currentTime: number;
  duration: number;
  buffered: TimeRange[];
  volume: number;
  muted: boolean;
  rate: number;
  buffering: boolean;
  errorCode: number | null;
  /** Why a converted stream failed, when `errorCode` is `STREAM_ERROR`. */
  errorDetail: string | null;
  width: number;
  height: number;
}

export interface SubtitleCueTrack {
  id: string;
  label: string;
  /** WebVTT document, already converted from SRT when needed. */
  vtt: string;
}

/**
 * Everything the player UI is allowed to ask of a playback engine.
 *
 * `Html5Backend` is the v1 engine: a `<video>` element fed by the webview.
 * A future `LibmpvBackend` implements this same interface and renders into a
 * native surface so MKV and other containers can play. The controls, shortcuts,
 * resume store, and subtitle conversion stay where they are. Select the
 * implementation in `createBackend()`.
 */
export interface PlaybackBackend {
  readonly kind: PlaybackKind;
  attach(container: HTMLElement): void;
  load(source: MediaSource): Promise<void>;
  play(): Promise<void>;
  pause(): void;
  seek(time: number): void;
  setVolume(volume: number): void;
  setMuted(muted: boolean): void;
  setRate(rate: number): void;
  setSubtitles(track: SubtitleCueTrack | null): void;
  getSnapshot(): PlaybackSnapshot;
  /** Optional: decoded picture so far, for the native-playback safety net. */
  videoHealth?(): VideoHealth;
  subscribe(listener: () => void): () => void;
  destroy(): void;
}

/** Not a `MediaError` code: Glint's ffmpeg conversion failed. */
export const STREAM_ERROR = 100;

/** What the webview has actually decoded, to catch files that "play" with no picture. */
export interface VideoHealth {
  width: number;
  /** Decoded frames so far, or null when the engine can't tell. */
  frames: number | null;
}

export function emptySnapshot(): PlaybackSnapshot {
  return {
    status: "idle",
    currentTime: 0,
    duration: 0,
    buffered: [],
    volume: 1,
    muted: false,
    rate: 1,
    buffering: false,
    errorCode: null,
    errorDetail: null,
    width: 0,
    height: 0,
  };
}
