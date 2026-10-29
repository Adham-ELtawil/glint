import { chapterAt } from "../player/chapters";
import { PLAYBACK_RATES, formatRate } from "../player/rates";
import { isTypingTarget, mapShortcut, type ShortcutAction } from "../player/shortcuts";
import type { FlashEffect, PlayerState } from "../player/state";
import { formatPair, formatTime } from "../player/time";
import { APP_VERSION } from "../version";
import { brandMark, brandMarkLarge, icon, playPauseIcon, type IconName } from "./icons";

export interface ViewActions {
  openVideo(): void;
  openSubtitle(): void;
  quit(): void;
  togglePlay(): void;
  seekRatio(ratio: number): void;
  setVolume(volume: number): void;
  toggleMute(): void;
  toggleCaptions(): void;
  selectTrack(id: string | null): void;
  setRate(rate: number): void;
  next(): void;
  toggleFullscreen(): void;
  toggleTheater(): void;
  replay(): void;
  startOver(): void;
  shortcut(action: ShortcutAction): void;
  /** Space held past {@link SPACE_HOLD_MS}: play at 2x. */
  startBoost(): void;
  /** Space released after a hold: back to normal speed. */
  endBoost(): void;
  filesDropped(files: File[]): void;
  goHome(): void;
  addFolder(): void;
  clearHistory(): void;
  checkForUpdates(): void;
}

/**
 * How long the center play/pause/seek bubble stays up. Its CSS animation runs
 * 0.5s; the timer is the safety net that removes it even when the animation
 * never runs or never reports that it ended.
 */
export const FEEDBACK_HIDE_MS = 600;

/**
 * Space pressed for less than this is a tap (play/pause); held longer it plays
 * at 2x until released, like YouTube's press-and-hold.
 */
export const SPACE_HOLD_MS = 300;

/** Transparent gap between chapter segments on the progress bar (YouTube uses 4px). */
const CHAPTER_GAP_PX = 4;
/** How long the "Converting…" note stays up. */
export const CONVERT_NOTE_MS = 3500;

/** Diameter of the volume thumb; keep in sync with `.volume-slider` in styles.css. */
const VOLUME_THUMB_PX = 12;

type SettingsPage = "main" | "speed" | "subtitles";
type MenuName = "file" | "playback" | "view" | "help";

export class PlayerView {
  readonly root: HTMLElement;
  videoSlot!: HTMLElement;
  private state: PlayerState | null = null;
  private settingsPage: SettingsPage = "main";
  private settingsOpen = false;
  private menuName: MenuName | null = null;
  private scrubbing = false;
  private resumeTimer = 0;
  private hideTimer = 0;
  private feedbackTimer = 0;
  private spaceDown = false;
  private spaceTimer = 0;
  private spaceBoosting = false;
  private boostPill!: HTMLElement;
  private convertPill!: HTMLElement;
  private convertTimer = 0;
  private pointerX = Number.NaN;
  private pointerY = Number.NaN;
  private suppressPointerUntil = 0;

  private player!: HTMLElement;
  private playBtn!: HTMLButtonElement;
  private nextBtn!: HTMLButtonElement;
  private muteBtn!: HTMLButtonElement;
  private volumeSlider!: HTMLInputElement;
  private timeEl!: HTMLElement;
  private timeCurrent!: HTMLElement;
  private timeTotal!: HTMLElement;
  private chapterEl!: HTMLElement;
  private chapterTitle!: HTMLElement;
  private captionsBtn!: HTMLButtonElement;
  private theaterBtn!: HTMLButtonElement;
  private fullscreenBtn!: HTMLButtonElement;
  private progress!: HTMLElement;
  private track!: HTMLElement;
  /** One full-width copy of the bar per chapter, clipped to that chapter. */
  private segments: { root: HTMLElement; buffer: HTMLElement; played: HTMLElement }[] = [];
  private hoverSegment = -1;
  private handle!: HTMLElement;
  private tooltip!: HTMLElement;
  private tooltipChapter!: HTMLElement;
  private tooltipTime!: HTMLElement;
  private gradient!: HTMLElement;
  private controls!: HTMLElement;
  private feedback!: HTMLElement;
  private bigPlay!: HTMLButtonElement;
  private ended!: HTMLElement;
  private endedNext!: HTMLButtonElement;
  private endedName!: HTMLElement;
  private empty!: HTMLElement;
  private error!: HTMLElement;
  private errorTitle!: HTMLElement;
  private errorBody!: HTMLElement;
  private spinner!: HTMLElement;
  private loadbar!: HTMLElement;
  private resume!: HTMLElement;
  private resumeText!: HTMLElement;
  private settings!: HTMLElement;
  private menu!: HTMLElement;
  private context!: HTMLElement;
  private drop!: HTMLElement;
  private titleEl!: HTMLElement;
  private homeBtn!: HTMLButtonElement;
  stage!: HTMLElement;
  private homeActive = false;
  private menuButtons: Record<MenuName, HTMLButtonElement> = {
    file: null!,
    playback: null!,
    view: null!,
    help: null!,
  };

  constructor(
    root: HTMLElement,
    private readonly actions: ViewActions,
    private readonly nativeDrag: boolean,
  ) {
    this.root = root;
    root.className = "app";
    root.replaceChildren(this.build());
    this.bind();
    this.setControlsVisible(true);
  }

  render(state: PlayerState): void {
    const previous = this.state;
    this.state = state;
    this.root.classList.toggle("is-fullscreen", state.fullscreen);
    this.root.classList.toggle("is-theater", state.theater);
    this.player.dataset.phase = state.phase;
    this.player.dataset.playing = state.playing ? "true" : "false";
    this.player.dataset.buffering = state.buffering ? "true" : "false";

    const pair = formatPair(state.currentTime, state.duration);
    this.timeCurrent.textContent = pair.current;
    this.timeTotal.textContent = pair.total;
    this.chapterTitle.textContent = state.chapterTitle ?? "";
    this.chapterEl.hidden = !state.chapterTitle;
    this.titleEl.textContent = this.homeActive ? "" : (state.filename ?? "Glint");

    const ratio = state.duration > 0 ? state.currentTime / state.duration : 0;
    this.progress.setAttribute("aria-valuenow", String(Math.round(ratio * 100)));
    this.progress.setAttribute("aria-valuetext", `${pair.current} of ${pair.total}`);

    if (!previous || previous.chapters !== state.chapters || previous.duration !== state.duration) {
      this.buildSegments(state);
    }
    if (
      !previous ||
      !sameRanges(previous.buffered, state.buffered) ||
      previous.duration !== state.duration ||
      previous.chapters !== state.chapters
    ) {
      for (const segment of this.segments) {
        segment.buffer.replaceChildren(
          ...state.buffered.map((range) => {
            const el = document.createElement("span");
            el.className = "buffer-range";
            const start = state.duration > 0 ? (range.start / state.duration) * 100 : 0;
            const end = state.duration > 0 ? (range.end / state.duration) * 100 : 0;
            el.style.left = `${start}%`;
            el.style.width = `${Math.max(0, end - start)}%`;
            return el;
          }),
        );
      }
    }
    const playedWidth = `${ratio * 100}%`;
    for (const segment of this.segments) segment.played.style.width = playedWidth;
    this.handle.style.left = playedWidth;

    if (!previous || previous.playing !== state.playing) {
      const label = state.playing ? "Pause (k)" : "Play (k)";
      this.playBtn.setAttribute("aria-label", label);
      this.playBtn.dataset.tip = label;
    }
    this.bigPlay.hidden = true;
    this.nextBtn.hidden = !state.hasNext;
    this.ended.hidden = !(state.phase === "ready" && state.ended);
    this.endedNext.hidden = !state.hasNext;
    this.endedName.textContent = state.nextFilename ?? "";

    this.nextBtn.disabled = !state.hasNext;
    this.nextBtn.setAttribute("aria-disabled", state.hasNext ? "false" : "true");

    const volumeIcon: IconName =
      state.muted || state.volume === 0
        ? "volume-muted"
        : state.volume < 0.5
          ? "volume-low"
          : "volume";
    if (!previous || previous.muted !== state.muted || previous.volume !== state.volume) {
      this.muteBtn.innerHTML = icon(volumeIcon);
    }
    this.muteBtn.setAttribute("aria-label", state.muted ? "Unmute (m)" : "Mute (m)");
    if (document.activeElement !== this.volumeSlider) {
      this.volumeSlider.value = String(state.volume);
    }
    this.volumeSlider.style.setProperty("--vol", `${state.volume * 100}%`);
    this.volumeSlider.setAttribute(
      "aria-valuetext",
      state.muted ? "Muted" : `${Math.round(state.volume * 100)} percent`,
    );

    this.captionsBtn.classList.toggle("is-on", state.captionsOn);
    this.captionsBtn.setAttribute("aria-pressed", state.captionsOn ? "true" : "false");
    this.captionsBtn.disabled =
      state.tracks.length === 0 && state.phase !== "ready" && state.phase !== "empty";
    this.theaterBtn.setAttribute("aria-pressed", state.theater ? "true" : "false");
    if (!previous || previous.theater !== state.theater) {
      this.theaterBtn.innerHTML = icon(state.theater ? "theater-exit" : "theater");
      const tip = state.theater ? "Default view (t)" : "Theater mode (t)";
      this.theaterBtn.setAttribute("aria-label", tip);
      this.theaterBtn.dataset.tip = tip;
    }
    this.fullscreenBtn.innerHTML = icon(state.fullscreen ? "fullscreen-exit" : "fullscreen");
    this.fullscreenBtn.setAttribute(
      "aria-label",
      state.fullscreen ? "Exit fullscreen (f)" : "Fullscreen (f)",
    );

    this.error.hidden = state.phase !== "error";
    this.errorTitle.textContent = state.errorTitle ?? "";
    this.errorBody.textContent = state.errorBody ?? "";
    this.empty.hidden = state.phase !== "empty";
    this.spinner.hidden = !state.buffering || state.ended;
    this.loadbar.hidden = state.phase !== "loading";

    const showResume = Boolean(state.resumeLabel) && state.phase === "ready";
    if (showResume && state.resumeLabel !== previous?.resumeLabel) {
      this.resumeText.textContent = state.resumeLabel ?? "";
      this.resume.hidden = false;
      window.clearTimeout(this.resumeTimer);
      this.resumeTimer = window.setTimeout(() => {
        this.resume.hidden = true;
      }, 6000);
    }
    if (!showResume) this.resume.hidden = true;
    this.boostPill.hidden = !(state.boosting && state.phase === "ready");

    // A brief note that the file plays through Glint's converter.
    if (state.convertNote && state.convertNote !== previous?.convertNote) {
      this.convertPill.textContent = state.convertNote;
      this.convertPill.hidden = false;
      window.clearTimeout(this.convertTimer);
      this.convertTimer = window.setTimeout(() => {
        this.convertPill.hidden = true;
      }, CONVERT_NOTE_MS);
    }
    if (!state.convertNote) this.convertPill.hidden = true;

    if (this.settingsOpen && settingsChanged(previous, state)) this.paintSettings();
    if (this.menuName && menuChanged(previous, state)) this.paintMenu();

    if (!state.playing) this.setControlsVisible(true);
    else if (!previous?.playing) this.scheduleHide();
  }

  flash(effect: FlashEffect): void {
    const glyph: IconName =
      effect.kind === "pause"
        ? "pause"
        : effect.kind === "seek"
          ? effect.direction < 0
            ? "seek-back"
            : "seek-forward"
          : effect.kind === "volume"
            ? "volume"
            : effect.kind === "rate"
              ? "settings"
              : "play";
    const label = effect.kind === "play" ? "" : effect.kind === "pause" ? "" : effect.label;
    this.feedback.dataset.side =
      effect.kind === "seek" ? (effect.direction < 0 ? "back" : "forward") : "center";
    this.clearFeedback();
    const bubble = document.createElement("div");
    bubble.className =
      effect.kind === "play" || effect.kind === "pause"
        ? "feedback-bubble is-bezel"
        : "feedback-bubble";
    bubble.innerHTML = icon(glyph);
    if (label) {
      const text = document.createElement("span");
      text.textContent = label;
      bubble.append(text);
    }
    this.feedback.append(bubble);
    this.feedback.hidden = false;
    // The timer is what hides the bubble. Animation events are only an early
    // cleanup: they never fire when the animation is disabled (Windows
    // "Animation effects" off maps to prefers-reduced-motion: reduce) or
    // when the compositor stops advancing animations.
    const done = () => {
      if (bubble.isConnected) this.clearFeedback();
    };
    bubble.addEventListener("animationend", done, { once: true });
    bubble.addEventListener("animationcancel", done, { once: true });
    this.feedbackTimer = window.setTimeout(done, FEEDBACK_HIDE_MS);
  }

  private clearFeedback(): void {
    window.clearTimeout(this.feedbackTimer);
    this.feedbackTimer = 0;
    this.feedback.replaceChildren();
    this.feedback.hidden = true;
  }

  /**
   * Chapters are drawn the way YouTube draws them: separate bar segments with
   * a small transparent gap between them. Each segment is a full-width copy of
   * the bar clipped to its chapter, so played/buffered widths stay plain
   * percentages of the whole video and line up exactly with the handle.
   */
  private buildSegments(state: PlayerState): void {
    const bounds = [0];
    if (state.duration > 0) {
      for (const chapter of state.chapters) {
        const at = chapter.start / state.duration;
        if (at > 0.001 && at < 0.999 && at > bounds[bounds.length - 1]) bounds.push(at);
      }
    }
    bounds.push(1);
    const half = CHAPTER_GAP_PX / 2;
    this.segments = [];
    const nodes: HTMLElement[] = [];
    for (let index = 0; index < bounds.length - 1; index++) {
      const left = bounds[index] * 100;
      const right = (1 - bounds[index + 1]) * 100;
      const root = el("div", "segment");
      const insetLeft = index === 0 ? "0px" : `calc(${left}% + ${half}px)`;
      const insetRight = index === bounds.length - 2 ? "0px" : `calc(${right}% + ${half}px)`;
      root.style.clipPath = `inset(0 ${insetRight} 0 ${insetLeft})`;
      const buffer = el("div", "buffer");
      const played = el("div", "played");
      root.append(buffer, played);
      this.segments.push({ root, buffer, played });
      nodes.push(root);
    }
    this.hoverSegment = -1;
    this.track.replaceChildren(...nodes, this.handle);
  }

  private setHoverSegment(ratio: number | null): void {
    let index = -1;
    if (ratio != null && this.state && this.state.duration > 0) {
      const time = ratio * this.state.duration;
      index = 0;
      const starts = this.state.chapters
        .map((chapter) => chapter.start)
        .filter((start) => start > 0.001 * this.state!.duration);
      for (const start of starts) if (time >= start) index++;
      index = Math.min(index, this.segments.length - 1);
    }
    if (index === this.hoverSegment) return;
    this.segments[this.hoverSegment]?.root.classList.remove("is-hover");
    this.segments[index]?.root.classList.add("is-hover");
    this.hoverSegment = index;
  }

  /**
   * The home screen covers the player. While it is up, player shortcuts are
   * off (the keys belong to the cards) and the top bar stays visible even in
   * theater mode.
   */
  setHomeActive(on: boolean): void {
    this.homeActive = on;
    this.root.classList.toggle("is-home", on);
    this.homeBtn.setAttribute("aria-current", on ? "page" : "false");
    this.titleEl.textContent = on ? "" : (this.state?.filename ?? "Glint");
    if (on) {
      this.closeMenus();
      this.closeSettings();
      this.context.hidden = true;
      this.clearFeedback();
    }
  }

  isHomeActive(): boolean {
    return this.homeActive;
  }

  setDragHover(on: boolean): void {
    this.drop.hidden = !on;
  }

  isOverlayOpen(): boolean {
    return this.settingsOpen || this.menuName != null || !this.context.hidden;
  }

  private build(): HTMLElement {
    const header = el("header", "menubar");
    const nav = el("nav", "menu-nav");
    this.homeBtn = document.createElement("button");
    this.homeBtn.type = "button";
    this.homeBtn.className = "home-nav";
    this.homeBtn.setAttribute("aria-label", "Home (Backspace)");
    this.homeBtn.dataset.tip = "Home";
    this.homeBtn.innerHTML = icon("home");
    this.homeBtn.addEventListener("click", () => this.actions.goHome());
    this.menuButtons.file = menuButton("File");
    this.menuButtons.playback = menuButton("Playback");
    this.menuButtons.view = menuButton("View");
    this.menuButtons.help = menuButton("Help");
    nav.append(
      this.homeBtn,
      this.menuButtons.file,
      this.menuButtons.playback,
      this.menuButtons.view,
      this.menuButtons.help,
    );
    // Like the YouTube logo, the brand goes home.
    const brand = el("button", "brand");
    brand.type = "button";
    brand.setAttribute("aria-label", "Glint home");
    brand.addEventListener("click", () => this.actions.goHome());
    const mark = el("span", "brand-mark");
    mark.innerHTML = brandMark();
    const word = el("span", "brand-name");
    word.textContent = "Glint";
    brand.append(mark, word);
    this.titleEl = el("div", "window-title");
    this.titleEl.dir = "auto";
    this.titleEl.textContent = "Glint";
    header.append(nav, this.titleEl, brand);

    this.menu = el("div", "menu");
    this.menu.hidden = true;
    header.append(this.menu);

    this.player = el("div", "player");
    this.player.dataset.phase = "empty";
    this.videoSlot = el("div", "video-slot");
    const gesture = el("div", "gesture");
    gesture.addEventListener("click", () => this.actions.togglePlay());
    gesture.addEventListener("dblclick", (event) => {
      event.preventDefault();
      this.actions.toggleFullscreen();
    });

    this.gradient = el("div", "gradient");
    this.feedback = el("div", "feedback");
    this.feedback.hidden = true;

    this.boostPill = el("div", "boost-pill");
    this.boostPill.hidden = true;
    this.boostPill.setAttribute("role", "status");
    const boostRate = el("span", "boost-rate");
    boostRate.textContent = "2x";
    const boostArrows = el("span", "boost-arrows");
    boostArrows.setAttribute("aria-hidden", "true");
    boostArrows.textContent = "\u25B6\u25B6";
    this.boostPill.append(boostRate, boostArrows);

    this.convertPill = el("div", "convert-pill");
    this.convertPill.hidden = true;
    this.convertPill.setAttribute("role", "status");

    this.bigPlay = button("big-play", "Play", "play");
    this.bigPlay.addEventListener("click", (event) => {
      event.stopPropagation();
      this.actions.togglePlay();
    });

    this.ended = el("div", "ended");
    this.ended.hidden = true;
    const replay = button("ended-replay", "Replay", "replay");
    replay.addEventListener("click", () => this.actions.replay());
    this.endedNext = button("ended-next", "Up next", "next");
    this.endedName = el("span", "ended-name");
    this.endedNext.append(this.endedName);
    this.endedNext.addEventListener("click", () => this.actions.next());
    this.ended.append(replay, this.endedNext);

    this.empty = el("div", "empty");
    const emptyMark = el("div", "empty-mark");
    emptyMark.innerHTML = brandMarkLarge("glint-player-empty");
    const emptyTitle = el("h1");
    emptyTitle.textContent = "Drop a video to play";
    const emptyCopy = el("p");
    emptyCopy.textContent =
      "Plays MP4, MKV, AVI, MOV and more. Use File → Open, or drop a file on the window.";
    const openBtn = el("button", "open-btn");
    openBtn.type = "button";
    openBtn.textContent = "Open file";
    openBtn.addEventListener("click", () => this.actions.openVideo());
    const hints = el("p", "hints");
    hints.textContent =
      "Space play  ·  Hold Space 2x  ·  J / L seek  ·  ← → 5 seconds  ·  F fullscreen  ·  M mute";
    this.empty.append(emptyMark, emptyTitle, emptyCopy, openBtn, hints);

    this.error = el("div", "error");
    this.error.hidden = true;
    this.errorTitle = el("h1");
    this.errorBody = el("p");
    const another = el("button", "open-btn");
    another.type = "button";
    another.textContent = "Open another file";
    another.addEventListener("click", () => this.actions.openVideo());
    this.error.append(this.errorTitle, this.errorBody, another);

    this.spinner = el("div", "spinner");
    this.spinner.hidden = true;
    this.loadbar = el("div", "loadbar");
    this.loadbar.hidden = true;

    this.resume = el("div", "resume");
    this.resume.hidden = true;
    this.resumeText = el("span");
    const startOver = el("button");
    startOver.type = "button";
    startOver.textContent = "Start over";
    startOver.addEventListener("click", () => this.actions.startOver());
    this.resume.append(this.resumeText, startOver);

    this.controls = el("div", "controls");
    this.progress = el("div", "progress");
    this.progress.setAttribute("role", "slider");
    this.progress.setAttribute("aria-label", "Seek");
    this.progress.setAttribute("aria-valuemin", "0");
    this.progress.setAttribute("aria-valuemax", "100");
    this.progress.tabIndex = 0;
    this.tooltip = el("div", "tooltip");
    this.tooltip.hidden = true;
    this.tooltipChapter = el("span", "tooltip-chapter");
    this.tooltipTime = el("span", "tooltip-time");
    this.tooltip.append(this.tooltipChapter, this.tooltipTime);
    this.track = el("div", "progress-track");
    this.handle = el("div", "handle");
    this.track.append(this.handle);
    this.progress.append(this.tooltip, this.track);

    const bar = el("div", "bar");
    const left = el("div", "bar-left");
    const right = el("div", "bar-right");
    this.playBtn = iconButton("play", "Play (k)");
    this.playBtn.classList.add("play-toggle");
    this.playBtn.innerHTML = playPauseIcon();
    this.nextBtn = iconButton("next", "Next (Shift+N)");
    this.muteBtn = iconButton("volume", "Mute (m)");
    this.volumeSlider = document.createElement("input");
    this.volumeSlider.type = "range";
    this.volumeSlider.className = "volume-slider";
    this.volumeSlider.min = "0";
    this.volumeSlider.max = "1";
    this.volumeSlider.step = "0.01";
    this.volumeSlider.value = "1";
    this.volumeSlider.setAttribute("aria-label", "Volume");
    const volumePop = el("div", "volume-pop");
    volumePop.append(this.volumeSlider);
    const volume = el("div", "volume");
    volume.append(this.muteBtn, volumePop);
    this.timeEl = el("div", "time");
    this.timeCurrent = el("span", "time-current");
    this.timeCurrent.textContent = "0:00";
    const duration = el("span", "time-dur");
    duration.append(document.createTextNode(" / "));
    this.timeTotal = el("span", "time-total");
    this.timeTotal.textContent = "0:00";
    duration.append(this.timeTotal);
    this.timeEl.append(this.timeCurrent, duration);
    this.chapterEl = el("div", "chapter-label");
    this.chapterEl.hidden = true;
    this.chapterTitle = el("span", "chapter-title");
    this.chapterTitle.dir = "auto";
    const chevron = el("span", "chapter-chevron");
    chevron.innerHTML = icon("chevron");
    this.chapterEl.append(this.chapterTitle, chevron);
    const playGroup = el("div", "play-group");
    playGroup.append(this.playBtn, this.nextBtn);
    const volumeGroup = el("div", "control-cluster volume-group");
    volumeGroup.append(volume, this.timeEl);
    left.append(playGroup, volumeGroup, this.chapterEl);

    this.captionsBtn = iconButton("captions", "Captions (c)");
    this.captionsBtn.setAttribute("aria-pressed", "false");
    const settingsBtn = iconButton("settings", "Settings");
    settingsBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      this.toggleSettings();
    });
    this.theaterBtn = iconButton("theater", "Theater mode (t)");
    this.theaterBtn.classList.add("optional-control");
    this.fullscreenBtn = iconButton("fullscreen", "Fullscreen (f)");
    const cluster = el("div", "control-cluster");
    cluster.append(this.captionsBtn, settingsBtn, this.theaterBtn, this.fullscreenBtn);
    right.append(cluster);
    bar.append(left, right);
    this.controls.append(this.progress, bar);

    this.settings = el("div", "settings");
    this.settings.hidden = true;
    this.settings.setAttribute("role", "menu");
    this.context = el("div", "context");
    this.context.hidden = true;
    this.drop = el("div", "drop");
    this.drop.hidden = true;
    this.drop.textContent = "Drop to play";

    this.player.append(
      this.videoSlot,
      gesture,
      this.gradient,
      this.feedback,
      this.boostPill,
      this.convertPill,
      this.bigPlay,
      this.ended,
      this.empty,
      this.error,
      this.spinner,
      this.loadbar,
      this.resume,
      this.controls,
      this.settings,
      this.context,
      this.drop,
    );

    const stage = el("div", "stage");
    stage.append(this.player);
    this.stage = stage;
    const shell = el("div", "shell");
    shell.append(header, stage);
    return shell;
  }

  private bind(): void {
    this.playBtn.addEventListener("click", () => this.actions.togglePlay());
    this.nextBtn.addEventListener("click", () => this.actions.next());
    this.muteBtn.addEventListener("click", () => this.actions.toggleMute());
    this.captionsBtn.addEventListener("click", () => {
      if (!this.state || this.state.tracks.length === 0) this.actions.openSubtitle();
      else this.actions.toggleCaptions();
    });
    this.theaterBtn.addEventListener("click", () => this.actions.toggleTheater());
    this.fullscreenBtn.addEventListener("click", () => this.actions.toggleFullscreen());
    this.volumeSlider.addEventListener("input", () => {
      this.actions.setVolume(Number(this.volumeSlider.value));
    });
    this.bindVolumeDrag();
    this.volumeSlider.addEventListener("keyup", () => this.volumeSlider.blur());

    this.progress.addEventListener("pointerdown", (event) => this.onScrubStart(event));
    this.progress.addEventListener("pointermove", (event) => this.onScrubMove(event));
    this.progress.addEventListener("pointerup", (event) => this.onScrubEnd(event));
    this.progress.addEventListener("pointerleave", () => {
      if (!this.scrubbing) this.setHoverSegment(null);
      if (!this.scrubbing) this.tooltip.hidden = true;
    });

    for (const name of ["file", "playback", "view", "help"] as const) {
      this.menuButtons[name].addEventListener("click", (event) => {
        event.stopPropagation();
        this.toggleMenu(name);
      });
    }

    this.player.addEventListener("contextmenu", (event) => {
      if (this.state?.phase === "empty") return;
      event.preventDefault();
      this.openContext(event.clientX, event.clientY);
    });

    this.player.addEventListener("pointermove", (event) => this.onPointerMove(event));
    this.player.addEventListener("pointerleave", () => this.scheduleHide());

    document.addEventListener("pointerdown", (event) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!this.menu.hidden && !this.menu.contains(target) && !targetBelongs(target, ".menu-btn")) {
        this.closeMenus();
      }
      if (
        !this.settings.hidden &&
        !this.settings.contains(target) &&
        !targetBelongs(target, "[aria-label='Settings']")
      ) {
        this.closeSettings();
      }
      if (!this.context.hidden && !this.context.contains(target)) this.context.hidden = true;
    });

    window.addEventListener("keydown", (event) => this.onKey(event), true);
    window.addEventListener("keyup", (event) => this.onKeyUp(event), true);
    // A release that happens while the window is unfocused never arrives.
    window.addEventListener("blur", () => this.cancelSpace());
    // The mouse's back button goes home, like a browser's back.
    window.addEventListener("mouseup", (event) => {
      if (event.button !== 3 || this.homeActive) return;
      event.preventDefault();
      this.actions.goHome();
    });
    window.addEventListener("dragover", (event) => {
      if (this.nativeDrag) return;
      event.preventDefault();
      this.setDragHover(true);
    });
    window.addEventListener("dragleave", (event) => {
      if (this.nativeDrag) return;
      if (event.relatedTarget == null) this.setDragHover(false);
    });
    window.addEventListener("drop", (event) => {
      event.preventDefault();
      this.setDragHover(false);
      if (this.nativeDrag) return;
      const files = [...(event.dataTransfer?.files ?? [])];
      if (files.length > 0) this.actions.filesDropped(files);
    });
  }

  /**
   * The visible track is only 3px tall and lives in a pop-out that opens on hover.
   * While a drag is in progress the pop-out must stay open even when the
   * pointer drifts off the track, so the slider captures the pointer and the
   * volume group carries `is-dragging` until the button is released.
   */
  private bindVolumeDrag(): void {
    const slider = this.volumeSlider;
    const group = slider.closest<HTMLElement>(".volume");
    let dragging = -1;
    const end = (event: PointerEvent) => {
      if (event.pointerId !== dragging) return;
      dragging = -1;
      group?.classList.remove("is-dragging");
      if (slider.hasPointerCapture?.(event.pointerId))
        slider.releasePointerCapture(event.pointerId);
      slider.blur();
      this.scheduleHide();
    };
    slider.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      dragging = event.pointerId;
      group?.classList.add("is-dragging");
      try {
        slider.setPointerCapture(event.pointerId);
      } catch {
        // Synthetic pointers cannot be captured. The class still holds the pop-out open.
      }
      this.wakeControls();
    });
    slider.addEventListener("pointermove", (event) => {
      if (event.pointerId !== dragging) return;
      const rect = slider.getBoundingClientRect();
      if (rect.width <= 0) return;
      // With the pointer captured the native range input stops tracking once
      // the pointer leaves it vertically, so set the value from x ourselves.
      // Same mapping as the native input: the thumb centre travels between
      // half a thumb in from either end.
      const inset = VOLUME_THUMB_PX / 2;
      const span = Math.max(1, rect.width - VOLUME_THUMB_PX);
      const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left - inset) / span));
      const value = Math.round(ratio * 100) / 100;
      if (Number(slider.value) !== value) {
        slider.value = String(value);
        this.actions.setVolume(value);
      }
    });
    slider.addEventListener("pointerup", end);
    slider.addEventListener("pointercancel", end);
    slider.addEventListener("lostpointercapture", end);
  }

  isVolumeDragging(): boolean {
    return this.volumeSlider.closest(".volume")?.classList.contains("is-dragging") ?? false;
  }

  private onKey(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "o" && !event.shiftKey) {
      event.preventDefault();
      this.actions.openVideo();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "q") {
      event.preventDefault();
      this.actions.quit();
      return;
    }
    if (isTypingTarget(event.target)) return;
    // On the home screen the keys belong to the cards and buttons.
    if (this.homeActive) {
      if (event.key === "Escape" && this.isOverlayOpen()) {
        event.preventDefault();
        this.closeMenus();
      }
      return;
    }
    if (isHomeKey(event) && !this.isOverlayOpen()) {
      event.preventDefault();
      this.actions.goHome();
      return;
    }
    if (this.isOverlayOpen() && event.key !== "Escape") return;
    if (isPlainSpace(event)) {
      event.preventDefault();
      this.onSpaceDown(event.repeat);
      return;
    }
    const action = mapShortcut({
      key: event.key,
      code: event.code,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      repeat: event.repeat,
    });
    if (!action) return;
    event.preventDefault();
    if (action.type === "escape") {
      if (this.isOverlayOpen()) {
        this.closeMenus();
        this.closeSettings();
        this.context.hidden = true;
        return;
      }
    }
    if (action.type === "next") {
      this.actions.next();
      return;
    }
    this.actions.shortcut(action);
  }

  /**
   * A tap toggles play/pause on release; a hold past SPACE_HOLD_MS plays at 2x
   * until release. Auto-repeat keydowns while held are ignored.
   */
  private onSpaceDown(repeat: boolean): void {
    if (repeat || this.spaceDown) return;
    this.spaceDown = true;
    window.clearTimeout(this.spaceTimer);
    this.spaceTimer = window.setTimeout(() => {
      this.spaceTimer = 0;
      if (!this.spaceDown) return;
      this.spaceBoosting = true;
      this.actions.startBoost();
    }, SPACE_HOLD_MS);
  }

  private onKeyUp(event: KeyboardEvent): void {
    if (event.key !== " " || !this.spaceDown) return;
    // Also stops a focused button from turning the release into a click.
    event.preventDefault();
    this.spaceDown = false;
    if (this.spaceTimer) {
      window.clearTimeout(this.spaceTimer);
      this.spaceTimer = 0;
      this.actions.shortcut({ type: "toggle-play" });
      return;
    }
    if (this.spaceBoosting) {
      this.spaceBoosting = false;
      this.actions.endBoost();
    }
  }

  /** Focus lost mid-press: drop a pending tap and end any boost. */
  private cancelSpace(): void {
    window.clearTimeout(this.spaceTimer);
    this.spaceTimer = 0;
    this.spaceDown = false;
    if (this.spaceBoosting) {
      this.spaceBoosting = false;
      this.actions.endBoost();
    }
  }

  private onScrubStart(event: PointerEvent): void {
    if (event.button !== 0 || !this.state || this.state.duration <= 0) return;
    this.scrubbing = true;
    this.progress.classList.add("is-scrubbing");
    this.progress.setPointerCapture(event.pointerId);
    this.seekFromPointer(event);
    this.placeTooltip(event);
    this.wakeControls();
  }

  private onScrubMove(event: PointerEvent): void {
    if (!this.state || this.state.duration <= 0) return;
    this.placeTooltip(event);
    if (this.scrubbing) this.seekFromPointer(event);
  }

  private onScrubEnd(event: PointerEvent): void {
    if (!this.scrubbing) return;
    this.scrubbing = false;
    this.progress.classList.remove("is-scrubbing");
    this.seekFromPointer(event);
    const rect = this.progress.getBoundingClientRect();
    const inside =
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom;
    this.tooltip.hidden = !inside;
    if (!inside) this.setHoverSegment(null);
  }

  private seekFromPointer(event: PointerEvent): void {
    const ratio = this.ratioFromEvent(event);
    this.actions.seekRatio(ratio);
  }

  private placeTooltip(event: PointerEvent): void {
    if (!this.state) return;
    const rect = this.progress.getBoundingClientRect();
    const ratio = this.ratioFromEvent(event);
    const time = ratio * this.state.duration;
    this.setHoverSegment(ratio);
    const chapter = chapterAt(this.state.chapters, time);
    this.tooltipTime.textContent = formatTime(time, this.state.duration >= 3600);
    this.tooltipChapter.textContent = chapter?.title ?? "";
    this.tooltipChapter.hidden = !chapter;
    this.tooltip.hidden = false;
    const width = this.tooltip.offsetWidth || 48;
    const x = ratio * rect.width;
    const clamped = Math.min(rect.width - width / 2 - 8, Math.max(width / 2 + 8, x));
    this.tooltip.style.left = `${clamped}px`;
  }

  private ratioFromEvent(event: PointerEvent): number {
    const rect = this.progress.getBoundingClientRect();
    if (rect.width <= 0) return 0;
    return Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
  }

  private toggleMenu(name: MenuName): void {
    this.closeSettings();
    this.context.hidden = true;
    if (this.menuName === name) {
      this.closeMenus();
      return;
    }
    this.menuName = name;
    this.paintMenu();
    const button = this.menuButtons[name];
    const rect = button.getBoundingClientRect();
    const parent =
      button.offsetParent instanceof HTMLElement
        ? button.offsetParent.getBoundingClientRect()
        : rect;
    this.menu.style.left = `${rect.left - parent.left}px`;
    this.menu.hidden = false;
    for (const key of Object.keys(this.menuButtons) as MenuName[]) {
      this.menuButtons[key].setAttribute("aria-expanded", key === name ? "true" : "false");
    }
    this.wakeControls();
  }

  private paintMenu(): void {
    const state = this.state;
    this.menu.replaceChildren();
    const run = (fn: () => void) => () => {
      this.closeMenus();
      this.context.hidden = true;
      fn();
    };
    if (this.menuName === "file") {
      this.menu.append(
        menuItem(
          "Open…",
          "Ctrl+O",
          run(() => this.actions.openVideo()),
        ),
        menuItem(
          "Open subtitle…",
          "",
          run(() => this.actions.openSubtitle()),
          this.homeActive,
        ),
      );
      if (this.nativeDrag) {
        this.menu.append(
          separator(),
          menuItem(
            "Add folder to Home…",
            "",
            run(() => this.actions.addFolder()),
          ),
          separator(),
          menuItem(
            "Quit",
            "Ctrl+Q",
            run(() => this.actions.quit()),
          ),
        );
      }
    } else if (this.menuName === "playback") {
      this.menu.append(
        menuItem(
          state?.playing ? "Pause" : "Play",
          "K",
          run(() => this.actions.togglePlay()),
          this.homeActive,
        ),
        menuItem(
          "Next",
          "Shift+N",
          run(() => this.actions.next()),
          this.homeActive || !state?.hasNext,
        ),
        menuItem(
          state?.muted ? "Unmute" : "Mute",
          "M",
          run(() => this.actions.toggleMute()),
          this.homeActive,
        ),
      );
    } else if (this.menuName === "view") {
      this.menu.append(
        menuItem(
          "Home",
          "Backspace",
          run(() => this.actions.goHome()),
          this.homeActive,
        ),
        separator(),
        menuItem(
          state?.theater ? "Leave theater mode" : "Theater mode",
          "T",
          run(() => this.actions.toggleTheater()),
        ),
        menuItem(
          state?.fullscreen ? "Exit fullscreen" : "Fullscreen",
          "F",
          run(() => this.actions.toggleFullscreen()),
          this.homeActive,
        ),
        separator(),
        menuItem(
          "Clear watch history…",
          "",
          run(() => this.actions.clearHistory()),
        ),
      );
    } else if (this.menuName === "help") {
      const note = document.createElement("div");
      note.className = "menu-note";
      note.textContent = `Glint ${APP_VERSION}`;
      const credit = document.createElement("div");
      credit.className = "menu-note";
      credit.textContent =
        "Plays more formats with FFmpeg (ffmpeg.org), licensed under the LGPLv2.1.";
      this.menu.append(
        menuItem(
          "Check for updates…",
          "",
          run(() => this.actions.checkForUpdates()),
          !this.nativeDrag,
        ),
        separator(),
        note,
        credit,
      );
    }
  }

  private closeMenus(): void {
    this.menuName = null;
    this.menu.hidden = true;
    for (const button of Object.values(this.menuButtons))
      button.setAttribute("aria-expanded", "false");
    this.scheduleHide();
  }

  private toggleSettings(): void {
    if (this.settingsOpen) {
      this.closeSettings();
      return;
    }
    this.closeMenus();
    this.context.hidden = true;
    this.settingsOpen = true;
    this.settingsPage = "main";
    this.settings.hidden = false;
    this.paintSettings();
    this.wakeControls();
  }

  private closeSettings(): void {
    this.settingsOpen = false;
    this.settings.hidden = true;
    this.scheduleHide();
  }

  private paintSettings(animate = false): void {
    const state = this.state;
    this.settings.replaceChildren();
    if (!state) return;
    if (this.settingsPage === "main") {
      this.settings.append(
        settingsRow("Playback speed", formatRate(state.rate), () => {
          this.settingsPage = "speed";
          this.paintSettings(true);
        }),
        settingsRow("Subtitles", subtitleSummary(state), () => {
          this.settingsPage = "subtitles";
          this.paintSettings(true);
        }),
      );
      this.finishSettingsPaint(animate);
      return;
    }
    const back = document.createElement("button");
    back.type = "button";
    back.className = "settings-back";
    back.innerHTML = icon("back");
    const label = document.createElement("span");
    label.textContent = this.settingsPage === "speed" ? "Playback speed" : "Subtitles";
    back.append(label);
    back.addEventListener("click", () => {
      this.settingsPage = "main";
      this.paintSettings(true);
    });
    this.settings.append(back);
    if (this.settingsPage === "speed") {
      for (const rate of PLAYBACK_RATES) {
        const selected = Math.abs(rate - state.rate) < 0.001;
        this.settings.append(
          settingsCheck(formatRate(rate), selected, () => {
            this.actions.setRate(rate);
          }),
        );
      }
      this.finishSettingsPaint(animate);
      return;
    }
    this.settings.append(
      settingsCheck("Off", !state.captionsOn, () => this.actions.selectTrack(null)),
    );
    for (const track of state.tracks) {
      this.settings.append(
        settingsCheck(track.label, state.captionsOn && state.activeTrackId === track.id, () =>
          this.actions.selectTrack(track.id),
        ),
      );
    }
    const load = document.createElement("button");
    load.type = "button";
    load.className = "settings-row";
    load.textContent = "Load from file…";
    load.addEventListener("click", () => {
      this.closeSettings();
      this.actions.openSubtitle();
    });
    this.settings.append(load);
    this.finishSettingsPaint(animate);
  }

  private finishSettingsPaint(animate: boolean): void {
    if (!animate) return;
    this.settings.dataset.dir = this.settingsPage === "main" ? "back" : "forward";
    this.settings.classList.remove("panel-swap");
    void this.settings.offsetWidth;
    this.settings.classList.add("panel-swap");
  }

  private openContext(x: number, y: number): void {
    this.closeMenus();
    this.closeSettings();
    const state = this.state;
    const run = (fn: () => void) => () => {
      this.context.hidden = true;
      fn();
    };
    this.context.replaceChildren(
      menuItem(
        "Open…",
        "",
        run(() => this.actions.openVideo()),
      ),
      menuItem(
        "Open subtitle…",
        "",
        run(() => this.actions.openSubtitle()),
      ),
      separator(),
      menuItem(
        state?.playing ? "Pause" : "Play",
        "K",
        run(() => this.actions.togglePlay()),
      ),
      menuItem(
        "Fullscreen",
        "F",
        run(() => this.actions.toggleFullscreen()),
      ),
    );
    this.context.hidden = false;
    const rect = this.player.getBoundingClientRect();
    const width = 220;
    const height = 180;
    const left = Math.min(rect.width - width - 8, Math.max(8, x - rect.left));
    const top = Math.min(rect.height - height - 8, Math.max(8, y - rect.top));
    this.context.style.left = `${left}px`;
    this.context.style.top = `${top}px`;
  }

  private onPointerMove(event: PointerEvent): void {
    if (Date.now() < this.suppressPointerUntil) return;
    const dx = event.clientX - this.pointerX;
    const dy = event.clientY - this.pointerY;
    // The progress bar moves under a stationary cursor, and hiding the cursor
    // can emit a pointermove. Neither is the viewer reaching for the controls.
    if (Number.isFinite(this.pointerX) && dx * dx + dy * dy < 4) return;
    this.pointerX = event.clientX;
    this.pointerY = event.clientY;
    this.wakeControls();
  }

  private wakeControls(): void {
    this.setControlsVisible(true);
    this.scheduleHide();
  }

  private scheduleHide(): void {
    window.clearTimeout(this.hideTimer);
    this.hideTimer = window.setTimeout(() => {
      if (!this.state?.playing || this.pointerIdleBlocked() || this.scrubbing) return;
      this.setControlsVisible(false);
    }, 3000);
  }

  private setControlsVisible(visible: boolean): void {
    const hide = !visible && Boolean(this.state?.playing) && !this.pointerIdleBlocked();
    const wasHidden = this.player.classList.contains("controls-hidden");
    this.player.classList.toggle("controls-hidden", hide);
    if (hide && !wasHidden) this.suppressPointerUntil = Date.now() + 200;
  }

  private pointerIdleBlocked(): boolean {
    return this.isOverlayOpen() || this.scrubbing || this.isVolumeDragging();
  }
}

/** Backspace goes back to the home screen, like Back in a browser. */
function isHomeKey(event: KeyboardEvent): boolean {
  return (
    event.key === "Backspace" &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey &&
    !event.shiftKey
  );
}

function subtitleSummary(state: PlayerState): string {
  if (!state.captionsOn) return "Off";
  return state.tracks.find((track) => track.id === state.activeTrackId)?.label ?? "On";
}

function menuChanged(previous: PlayerState | null, state: PlayerState): boolean {
  if (!previous) return true;
  return (
    previous.playing !== state.playing ||
    previous.hasNext !== state.hasNext ||
    previous.muted !== state.muted ||
    previous.theater !== state.theater ||
    previous.fullscreen !== state.fullscreen
  );
}

function settingsChanged(previous: PlayerState | null, state: PlayerState): boolean {
  if (!previous) return true;
  return (
    previous.rate !== state.rate ||
    previous.captionsOn !== state.captionsOn ||
    previous.activeTrackId !== state.activeTrackId ||
    previous.tracks.length !== state.tracks.length
  );
}

function sameRanges(
  a: { start: number; end: number }[],
  b: { start: number; end: number }[],
): boolean {
  if (a.length !== b.length) return false;
  return a.every((range, index) => range.start === b[index].start && range.end === b[index].end);
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

function button(className: string, label: string, glyph: IconName): HTMLButtonElement {
  const node = document.createElement("button");
  node.type = "button";
  node.className = className;
  node.setAttribute("aria-label", label);
  node.innerHTML = icon(glyph);
  return node;
}

function iconButton(glyph: IconName, label: string): HTMLButtonElement {
  const node = button("icon-btn", label, glyph);
  node.dataset.tip = label;
  return node;
}

function menuButton(label: string): HTMLButtonElement {
  const node = document.createElement("button");
  node.type = "button";
  node.className = "menu-btn";
  node.textContent = label;
  node.setAttribute("aria-expanded", "false");
  node.setAttribute("aria-haspopup", "menu");
  return node;
}

function menuItem(
  label: string,
  kbd: string,
  onClick: () => void,
  disabled = false,
): HTMLButtonElement {
  const node = document.createElement("button");
  node.type = "button";
  node.className = "menu-item";
  node.disabled = disabled;
  const text = document.createElement("span");
  text.textContent = label;
  node.append(text);
  if (kbd) {
    const hint = document.createElement("span");
    hint.className = "kbd";
    hint.textContent = kbd;
    node.append(hint);
  }
  node.addEventListener("click", () => onClick());
  return node;
}

function separator(): HTMLElement {
  const node = document.createElement("div");
  node.className = "menu-sep";
  return node;
}

function settingsRow(label: string, value: string, onClick: () => void): HTMLButtonElement {
  const node = document.createElement("button");
  node.type = "button";
  node.className = "settings-row";
  const name = document.createElement("span");
  name.textContent = label;
  const aside = document.createElement("span");
  aside.className = "settings-value";
  aside.textContent = value;
  aside.insertAdjacentHTML("beforeend", icon("chevron"));
  node.append(name, aside);
  node.addEventListener("click", onClick);
  return node;
}

function settingsCheck(label: string, selected: boolean, onClick: () => void): HTMLButtonElement {
  const node = document.createElement("button");
  node.type = "button";
  node.className = "settings-row";
  node.setAttribute("aria-checked", selected ? "true" : "false");
  const mark = document.createElement("span");
  mark.className = "check";
  if (selected) mark.innerHTML = icon("check");
  const text = document.createElement("span");
  text.textContent = label;
  node.append(mark, text);
  node.addEventListener("click", onClick);
  return node;
}

function targetBelongs(target: Node, selector: string): boolean {
  return target instanceof Element && Boolean(target.closest(selector));
}

function isPlainSpace(event: KeyboardEvent): boolean {
  return event.key === " " && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey;
}
