import type { Chapter } from "./chapters";

export type PlayerPhase = "empty" | "loading" | "ready" | "error";

export interface PlayerState {
  phase: PlayerPhase;
  playing: boolean;
  ended: boolean;
  buffering: boolean;
  currentTime: number;
  duration: number;
  buffered: { start: number; end: number }[];
  volume: number;
  muted: boolean;
  rate: number;
  filename: string | null;
  chapterTitle: string | null;
  chapters: Chapter[];
  hasNext: boolean;
  nextFilename: string | null;
  tracks: { id: string; label: string }[];
  activeTrackId: string | null;
  captionsOn: boolean;
  errorTitle: string | null;
  errorBody: string | null;
  fullscreen: boolean;
  theater: boolean;
  resumeLabel: string | null;
  /** True while Space is held for temporary 2x playback. */
  boosting: boolean;
  /** "Converting audio…" etc. while the file plays through Glint's ffmpeg. */
  convertNote: string | null;
}

export type FlashEffect =
  | { kind: "play" }
  | { kind: "pause" }
  | { kind: "seek"; direction: -1 | 1; label: string }
  | { kind: "volume"; label: string }
  | { kind: "rate"; label: string };

export function initialState(): PlayerState {
  return {
    phase: "empty",
    playing: false,
    ended: false,
    buffering: false,
    currentTime: 0,
    duration: 0,
    buffered: [],
    volume: 1,
    muted: false,
    rate: 1,
    filename: null,
    chapterTitle: null,
    chapters: [],
    hasNext: false,
    nextFilename: null,
    tracks: [],
    activeTrackId: null,
    captionsOn: true,
    errorTitle: null,
    errorBody: null,
    fullscreen: false,
    theater: false,
    resumeLabel: null,
    boosting: false,
    convertNote: null,
  };
}
