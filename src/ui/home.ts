import type { HistoryEntry } from "../home/history-store";
import { parentName, watchedRatio } from "../home/history-store";
import { badgeTime, extensionLabel, fileSize, relativeTime, titleOf } from "../home/format";
import { collapsedCount, columnsFor, gutterFor } from "../home/layout";
import type { LibraryFolder, LibraryVideo } from "../home/library";
import { pathKey } from "../home/model";
import type { Thumb } from "../home/thumbnails";
import { brandMarkLarge, icon, type IconName } from "./icons";

export interface HomeActions {
  play(path: string, options: { fromStart: boolean }): void;
  openFile(): void;
  addFolder(): void;
  removeFolder(path: string): void;
  removeHistory(id: string): void;
  clearHistory(): void;
}

export interface HomeHistoryItem {
  entry: HistoryEntry;
  /** False once the file is known to be moved or deleted. */
  available: boolean;
}

export interface HomeSection {
  folder: LibraryFolder;
  videos: LibraryVideo[];
  truncated: boolean;
}

export interface HomeModel {
  /** The desktop app, which has folders. The browser preview does not. */
  native: boolean;
  history: HomeHistoryItem[];
  sections: HomeSection[];
  /** The first scan has not answered yet. */
  scanning: boolean;
}

export interface ThumbSource {
  get(path: string): Promise<Thumb>;
}

interface CardData {
  key: string;
  path: string;
  filename: string;
  available: boolean;
  /** Seconds watched and length, when known. */
  position: number;
  duration: number;
  meta: string[];
  historyId: string | null;
}

/**
 * The home screen: "Continue watching" from history, then one shelf per
 * library folder, or the first-run empty state. It owns no data; `render`
 * receives everything and the actions report what the user did.
 */
export class HomeView {
  readonly root: HTMLElement;
  private readonly content: HTMLElement;
  private readonly menu: HTMLElement;
  private dialog: HTMLElement | null = null;
  private model: HomeModel | null = null;
  private columns = 4;
  private expanded = new Set<string>();
  private cards = new Map<string, { node: HTMLElement; signature: string }>();
  private seen = new Set<string>();
  private thumbs = new Map<string, Thumb>();
  private observer: IntersectionObserver | null = null;
  private resize: ResizeObserver | null = null;
  private menuReturnFocus: HTMLElement | null = null;
  private readonly toastEl: HTMLElement;
  private toastTimer = 0;

  constructor(
    private readonly actions: HomeActions,
    private readonly source: ThumbSource,
  ) {
    this.root = el("div", "home");
    this.root.hidden = true;
    this.root.setAttribute("aria-label", "Home");
    this.content = el("div", "home-content");
    this.root.append(this.content);
    this.menu = el("div", "context home-menu");
    this.menu.hidden = true;
    this.menu.setAttribute("role", "menu");
    this.root.append(this.menu);
    this.toastEl = el("div", "home-toast");
    this.toastEl.hidden = true;
    this.toastEl.setAttribute("role", "status");
    this.root.append(this.toastEl);

    if (typeof IntersectionObserver !== "undefined") {
      this.observer = new IntersectionObserver((entries) => this.onVisible(entries), {
        root: this.root,
        rootMargin: "240px 0px",
      });
    }
    if (typeof ResizeObserver !== "undefined") {
      this.resize = new ResizeObserver(() => this.measure());
      this.resize.observe(this.root);
    }
    this.root.addEventListener("keydown", (event) => this.onKey(event));
    this.root.addEventListener("scroll", () => this.closeMenu(), { passive: true });
    this.root.addEventListener("contextmenu", (event) => {
      // No browser menu on the home screen; cards open their own.
      if (!(event.target instanceof Element) || !event.target.closest(".card")) {
        event.preventDefault();
      }
    });
    document.addEventListener("pointerdown", (event) => {
      const target = event.target;
      if (
        !this.menu.hidden &&
        target instanceof Node &&
        !this.menu.contains(target) &&
        !this.menuReturnFocus?.contains(target)
      ) {
        this.closeMenu(false);
      }
    });
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  show(): void {
    if (!this.root.hidden) return;
    this.root.hidden = false;
    this.root.classList.remove("is-arriving");
    void this.root.offsetWidth;
    this.root.classList.add("is-arriving");
    this.measure();
  }

  hide(): void {
    this.root.hidden = true;
    this.closeMenu();
    this.closeDialog();
    this.hideToast();
  }

  /** True while a home menu or dialog is open (Esc closes it). */
  isOverlayOpen(): boolean {
    return !this.menu.hidden || this.dialog != null;
  }

  closeOverlays(): void {
    this.closeMenu();
    this.closeDialog();
  }

  /** A YouTube-style snackbar in the bottom-left corner, with an optional action. */
  toast(message: string, action?: { label: string; run: () => void }): void {
    window.clearTimeout(this.toastTimer);
    const text = el("span", "home-toast-text");
    text.textContent = message;
    this.toastEl.replaceChildren(text);
    if (action) {
      const button = textButton(action.label, "home-toast-action");
      button.addEventListener("click", () => {
        this.hideToast();
        action.run();
      });
      this.toastEl.append(button);
    }
    this.toastEl.hidden = false;
    this.toastEl.classList.remove("is-showing");
    void this.toastEl.offsetWidth;
    this.toastEl.classList.add("is-showing");
    this.toastTimer = window.setTimeout(() => this.hideToast(), action ? 6000 : 4000);
  }

  private hideToast(): void {
    window.clearTimeout(this.toastTimer);
    this.toastEl.hidden = true;
    this.toastEl.classList.remove("is-showing");
  }

  /** Ask before wiping history. */
  confirmClearHistory(): void {
    this.closeMenu();
    if (this.dialog) return;
    const returnFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const scrim = el("div", "home-dialog");
    const panel = el("div", "home-dialog-panel");
    panel.setAttribute("role", "alertdialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-labelledby", "home-dialog-title");
    const title = el("h2");
    title.id = "home-dialog-title";
    title.textContent = "Clear watch history?";
    const body = el("p");
    body.textContent =
      "Continue watching and saved positions will be removed from this PC. Your video files aren't touched.";
    const row = el("div", "home-dialog-actions");
    const cancel = textButton("Cancel", "home-btn is-ghost");
    const confirm = textButton("Clear history", "home-btn is-primary");
    row.append(cancel, confirm);
    panel.append(title, body, row);
    scrim.append(panel);
    const close = () => {
      this.closeDialog();
      returnFocus?.focus({ preventScroll: true });
    };
    cancel.addEventListener("click", close);
    confirm.addEventListener("click", () => {
      this.closeDialog();
      this.actions.clearHistory();
    });
    scrim.addEventListener("pointerdown", (event) => {
      if (event.target === scrim) close();
    });
    panel.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close();
      } else if (event.key === "Tab") {
        // Keep focus inside the two buttons.
        event.preventDefault();
        (document.activeElement === cancel ? confirm : cancel).focus();
      }
    });
    this.dialog = scrim;
    this.root.append(scrim);
    cancel.focus({ preventScroll: true });
  }

  render(model: HomeModel): void {
    this.model = model;
    this.closeMenu();
    const blocks: HTMLElement[] = [];
    const hasHistory = model.history.length > 0;
    const libraryCount = model.sections.reduce((sum, section) => sum + section.videos.length, 0);
    const isEmpty = !hasHistory && libraryCount === 0 && !model.scanning;
    this.root.classList.toggle("is-empty", isEmpty);
    const live = new Set<string>();

    if (isEmpty) {
      blocks.push(this.buildEmpty(model));
    } else {
      if (hasHistory) blocks.push(this.buildHistory(model, live));
      if (model.scanning && model.sections.length === 0) blocks.push(skeletonShelf(this.columns));
      for (const section of model.sections) blocks.push(this.buildSection(model, section, live));
      if (model.native) blocks.push(this.buildAddFolder());
    }
    this.content.replaceChildren(...blocks);
    for (const key of [...this.cards.keys()]) {
      if (!live.has(key)) this.cards.delete(key);
    }
  }

  /** Focus the first card, e.g. after arriving with the keyboard. */
  focusFirst(): void {
    this.root.querySelector<HTMLElement>(".card-main")?.focus({ preventScroll: true });
  }

  private measure(): void {
    const width = this.root.clientWidth;
    if (width <= 0) return;
    const gutter = gutterFor(width);
    this.root.style.setProperty("--home-gutter", `${gutter}px`);
    const columns = columnsFor(width - gutter * 2);
    this.root.style.setProperty("--home-cols", String(columns));
    if (columns !== this.columns) {
      this.columns = columns;
      if (this.model && !this.root.hidden) this.render(this.model);
    }
  }

  private buildHistory(model: HomeModel, live: Set<string>): HTMLElement {
    const now = Date.now();
    const cards = model.history.map((item) => {
      const { entry } = item;
      const folder = parentName(entry.path);
      const when = relativeTime(entry.watchedAt, now);
      const meta = [
        folder,
        item.available ? (when ? `Watched ${when.toLowerCase()}` : "") : "File moved or deleted",
      ].filter(Boolean);
      return {
        key: `h:${entry.id}`,
        path: entry.path,
        filename: entry.filename,
        available: item.available,
        position: entry.position,
        duration: entry.duration,
        meta,
        historyId: entry.id,
      } satisfies CardData;
    });
    const clear = textButton("Clear history", "home-btn is-text");
    clear.addEventListener("click", () => this.confirmClearHistory());
    return this.buildShelf({
      id: "history",
      title: "Continue watching",
      subtitle: "",
      titleAttr: "",
      actions: [clear],
      cards,
      live,
      note: null,
    });
  }

  private buildSection(model: HomeModel, section: HomeSection, live: Set<string>): HTMLElement {
    const history = new Map(model.history.map((item) => [pathKey(item.entry.path), item.entry]));
    const now = Date.now();
    const cards = section.videos.map((video) => {
      const watched = history.get(pathKey(video.path));
      const kind = [video.subfolder, extensionLabel(video.filename), fileSize(video.size)]
        .filter(Boolean)
        .join(" · ");
      return {
        key: `l:${section.folder.path}:${video.path}`,
        path: video.path,
        filename: video.filename,
        available: true,
        position: watched?.position ?? 0,
        duration: watched?.duration ?? 0,
        meta: [kind, relativeTime(video.modifiedMs, now)].filter(Boolean),
        historyId: null,
      } satisfies CardData;
    });
    const more = iconButton("more", "Folder options", "home-icon-btn");
    more.setAttribute("aria-haspopup", "menu");
    more.addEventListener("click", (event) => {
      event.stopPropagation();
      if (!this.menu.hidden && this.menuReturnFocus === more) {
        this.closeMenu();
        return;
      }
      const rect = more.getBoundingClientRect();
      const name = section.folder.name;
      this.showMenu(
        [
          menuItem(`Remove ${name} from Home`, () => {
            this.closeMenu(false);
            this.actions.removeFolder(section.folder.path);
          }),
        ],
        rect.right,
        rect.bottom + 4,
        more,
        "end",
      );
    });
    const count = section.videos.length;
    const subtitle = section.folder.exists
      ? `${count} video${count === 1 ? "" : "s"}${section.truncated ? " · newest shown" : ""}`
      : "Folder not found";
    let note: string | null = null;
    if (!section.folder.exists) {
      note =
        "This folder isn't available. It may have been moved, or be on a drive that isn't connected.";
    } else if (count === 0) {
      note = "No videos here yet.";
    }
    return this.buildShelf({
      id: `folder:${section.folder.path}`,
      title: `From ${section.folder.name}`,
      subtitle,
      titleAttr: section.folder.path,
      actions: [more],
      cards,
      live,
      note,
    });
  }

  private buildShelf(options: {
    id: string;
    title: string;
    subtitle: string;
    titleAttr: string;
    actions: HTMLElement[];
    cards: CardData[];
    live: Set<string>;
    note: string | null;
  }): HTMLElement {
    const shelf = el("section", "shelf");
    shelf.dataset.shelf = options.id;
    const head = el("header", "shelf-head");
    const titles = el("div", "shelf-titles");
    const title = el("h2", "shelf-title");
    title.textContent = options.title;
    title.dir = "auto";
    if (options.titleAttr) title.title = options.titleAttr;
    titles.append(title);
    if (options.subtitle) {
      const sub = el("span", "shelf-sub");
      sub.textContent = options.subtitle;
      if (options.titleAttr) sub.title = options.titleAttr;
      titles.append(sub);
    }
    const actions = el("div", "shelf-actions");
    actions.append(...options.actions);
    head.append(titles, actions);
    shelf.append(head);

    if (options.note) {
      const note = el("p", "shelf-note");
      note.textContent = options.note;
      shelf.append(note);
    }
    if (options.cards.length === 0) return shelf;

    const limit = collapsedCount(this.columns);
    const open = this.expanded.has(options.id);
    const shown = open ? options.cards : options.cards.slice(0, limit);
    const grid = el("div", "grid");
    grid.setAttribute("role", "list");
    grid.setAttribute("aria-label", options.title);
    let fresh = 0;
    for (const data of shown) {
      options.live.add(data.key);
      const isNew = !this.seen.has(data.key);
      const node = this.cardFor(data);
      if (isNew) {
        this.seen.add(data.key);
        node.classList.remove("is-entering");
        void node.offsetWidth;
        node.style.setProperty("--enter-delay", `${Math.min(fresh, 11) * 28}ms`);
        node.classList.add("is-entering");
        fresh += 1;
      }
      grid.append(node);
    }
    shelf.append(grid);

    if (options.cards.length > limit) {
      const more = el("div", "shelf-more");
      const toggle = el("button", "home-btn is-more");
      toggle.type = "button";
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      const label = el("span");
      label.textContent = open ? "Show less" : `Show all ${options.cards.length}`;
      toggle.append(label);
      toggle.insertAdjacentHTML("beforeend", icon("expand"));
      toggle.addEventListener("click", () => {
        if (this.expanded.has(options.id)) this.expanded.delete(options.id);
        else this.expanded.add(options.id);
        if (this.model) this.render(this.model);
        const again = this.root.querySelector<HTMLElement>(
          `[data-shelf="${cssEscape(options.id)}"] .shelf-more button`,
        );
        again?.focus({ preventScroll: true });
      });
      more.append(toggle);
      shelf.append(more);
    }
    return shelf;
  }

  private cardFor(data: CardData): HTMLElement {
    const signature = JSON.stringify([
      data.filename,
      data.available,
      Math.round(watchedRatio(data.position, data.duration) * 1000),
      data.duration > 0 ? Math.round(data.duration) : 0,
      data.meta,
    ]);
    const cached = this.cards.get(data.key);
    if (cached && cached.signature === signature) return cached.node;
    const node = this.buildCard(data);
    this.cards.set(data.key, { node, signature });
    return node;
  }

  private buildCard(data: CardData): HTMLElement {
    const card = el("div", "card");
    card.setAttribute("role", "listitem");
    card.dataset.path = data.path;
    if (!data.available) card.classList.add("is-unavailable");
    const title = titleOf(data.filename);

    const main = el("button", "card-main");
    main.type = "button";
    const ratio = watchedRatio(data.position, data.duration);
    const resumable = ratio > 0 && ratio < 1;
    main.setAttribute(
      "aria-label",
      `${title}. ${data.meta.join(". ")}${resumable ? `. ${Math.round(ratio * 100)}% watched` : ""}`,
    );
    if (!data.available) main.setAttribute("aria-disabled", "true");

    const thumb = el("div", "thumb");
    thumb.dataset.path = data.path;
    thumb.dataset.ext = extensionLabel(data.filename);
    const image = el("img", "thumb-img");
    image.alt = "";
    image.decoding = "async";
    image.draggable = false;
    thumb.append(image);
    const fallback = el("div", "thumb-fallback");
    fallback.innerHTML = icon(data.available ? "film" : "close");
    const ext = el("span", "thumb-ext");
    ext.textContent = data.available ? extensionLabel(data.filename) : "Unavailable";
    fallback.append(ext);
    thumb.append(fallback);
    const badge = el("span", "thumb-badge");
    badge.textContent = badgeTime(data.duration);
    badge.hidden = !badge.textContent;
    thumb.append(badge);
    if (ratio > 0) {
      const bar = el("div", "thumb-progress");
      const fill = el("div", "thumb-progress-fill");
      fill.style.width = `${(ratio * 100).toFixed(2)}%`;
      bar.append(fill);
      thumb.append(bar);
    }
    const play = el("span", "thumb-play");
    play.innerHTML = icon("play");
    thumb.append(play);

    const text = el("div", "card-text");
    const heading = el("h3", "card-title");
    heading.textContent = title;
    heading.title = data.filename;
    heading.dir = "auto";
    text.append(heading);
    for (const line of data.meta) {
      const meta = el("p", "card-meta");
      meta.textContent = line;
      meta.dir = "auto";
      text.append(meta);
    }
    main.append(thumb, text);
    card.append(main);

    if (data.historyId) {
      const remove = iconButton("close", "Remove from history", "card-remove");
      remove.addEventListener("click", (event) => {
        event.stopPropagation();
        this.actions.removeHistory(data.historyId!);
      });
      card.append(remove);
    }

    main.addEventListener("click", () => {
      if (!data.available) return;
      this.actions.play(data.path, { fromStart: false });
    });
    card.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      this.openMenu(data, event.clientX, event.clientY, main);
    });

    const known = this.thumbs.get(data.path);
    if (known) this.applyThumb(thumb, known);
    else if (!data.available)
      this.applyThumb(thumb, { kind: "fallback", duration: null, missing: true });
    else if (this.observer) this.observer.observe(thumb);
    else void this.load(thumb);
    return card;
  }

  private onVisible(entries: IntersectionObserverEntry[]): void {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      this.observer?.unobserve(entry.target);
      void this.load(entry.target as HTMLElement);
    }
  }

  private async load(thumb: HTMLElement): Promise<void> {
    const path = thumb.dataset.path;
    if (!path) return;
    thumb.classList.add("is-loading");
    let result: Thumb;
    try {
      result = await this.source.get(path);
    } catch {
      result = { kind: "fallback", duration: null, missing: false };
    }
    if (result.kind === "image") this.thumbs.set(path, result);
    // Cards for the same file (history and a folder shelf) share the result.
    for (const node of this.root.querySelectorAll<HTMLElement>(".thumb")) {
      if (node.dataset.path === path) this.applyThumb(node, result);
    }
    if (thumb.isConnected === false) this.applyThumb(thumb, result);
  }

  private applyThumb(thumb: HTMLElement, result: Thumb): void {
    thumb.classList.remove("is-loading");
    const badge = thumb.querySelector<HTMLElement>(".thumb-badge");
    if (badge && badge.hidden && result.duration) {
      badge.textContent = badgeTime(result.duration);
      badge.hidden = !badge.textContent;
    }
    if (result.kind === "image") {
      const image = thumb.querySelector<HTMLImageElement>(".thumb-img");
      if (!image || thumb.classList.contains("is-loaded")) return;
      const reveal = () => thumb.classList.add("is-loaded");
      image.addEventListener("load", reveal, { once: true });
      image.addEventListener("error", () => thumb.classList.add("is-fallback"), { once: true });
      image.src = result.url;
      if (image.complete && image.naturalWidth > 0) reveal();
    } else {
      thumb.classList.add("is-fallback");
    }
  }

  private buildEmpty(model: HomeModel): HTMLElement {
    const wrap = el("div", "home-empty");
    const mark = el("div", "home-empty-mark");
    mark.innerHTML = brandMarkLarge("glint-home-empty");
    const title = el("h1");
    title.textContent = "Drop a video to play";
    const copy = el("p");
    copy.textContent =
      "Open a file or drop one anywhere on this window. Plays MP4, MKV, AVI, MOV and more.";
    const buttons = el("div", "home-empty-actions");
    const open = textButton("Open file", "open-btn");
    open.addEventListener("click", () => this.actions.openFile());
    buttons.append(open);
    if (model.native) {
      const add = el("button", "home-btn is-outline");
      add.type = "button";
      add.innerHTML = icon("folder");
      const label = el("span");
      label.textContent = "Add a folder";
      add.append(label);
      add.addEventListener("click", () => this.actions.addFolder());
      buttons.append(add);
    }
    wrap.append(mark, title, copy, buttons);
    const watched = model.sections.filter((section) => section.folder.exists);
    if (model.native && watched.length > 0) {
      const note = el("p", "home-empty-note");
      const names = watched.map((section) => section.folder.name).join(", ");
      note.textContent = `Anything new in ${names} will show up here.`;
      wrap.append(note);
    }
    const hints = el("p", "hints");
    hints.textContent =
      "Space play  ·  Hold Space 2x  ·  J / L seek  ·  ← → 5 seconds  ·  F fullscreen  ·  M mute";
    wrap.append(hints);
    return wrap;
  }

  private buildAddFolder(): HTMLElement {
    const row = el("div", "home-add");
    const add = el("button", "home-btn is-dashed");
    add.type = "button";
    add.innerHTML = icon("plus");
    const label = el("span");
    label.textContent = "Add a folder";
    add.append(label);
    add.addEventListener("click", () => this.actions.addFolder());
    row.append(add);
    return row;
  }

  private openMenu(data: CardData, x: number, y: number, returnFocus: HTMLElement): void {
    const ratio = watchedRatio(data.position, data.duration);
    const items: HTMLElement[] = [];
    const run = (fn: () => void) => () => {
      this.closeMenu(false);
      fn();
    };
    if (data.available) {
      items.push(
        menuItem(
          ratio > 0 && ratio < 1 ? "Resume" : "Play",
          run(() => this.actions.play(data.path, { fromStart: false })),
        ),
      );
      if (ratio > 0) {
        items.push(
          menuItem(
            "Play from the beginning",
            run(() => this.actions.play(data.path, { fromStart: true })),
          ),
        );
      }
    }
    if (data.historyId) {
      if (items.length > 0) items.push(separator());
      items.push(
        menuItem(
          "Remove from history",
          run(() => this.actions.removeHistory(data.historyId!)),
        ),
      );
    }
    this.showMenu(items, x, y, returnFocus);
  }

  /** Open the shared menu at a point; `end` aligns its right edge to x. */
  private showMenu(
    items: HTMLElement[],
    x: number,
    y: number,
    returnFocus: HTMLElement,
    align: "start" | "end" = "start",
  ): void {
    if (items.length === 0) return;
    this.menuReturnFocus = returnFocus;
    this.menu.replaceChildren(...items);
    this.menu.hidden = false;
    this.root.classList.add("menu-open");
    const width = this.menu.offsetWidth || 240;
    const height = this.menu.offsetHeight || 120;
    const anchor = align === "end" ? x - width : x;
    const left = Math.min(window.innerWidth - width - 8, Math.max(8, anchor));
    const top = Math.min(window.innerHeight - height - 8, Math.max(8, y));
    this.menu.style.left = `${left}px`;
    this.menu.style.top = `${top}px`;
    this.menu.querySelector<HTMLElement>(".menu-item")?.focus({ preventScroll: true });
  }

  private closeMenu(restoreFocus = true): void {
    if (this.menu.hidden) return;
    this.menu.hidden = true;
    this.root.classList.remove("menu-open");
    if (restoreFocus) this.menuReturnFocus?.focus({ preventScroll: true });
    this.menuReturnFocus = null;
  }

  private closeDialog(): void {
    this.dialog?.remove();
    this.dialog = null;
  }

  private onKey(event: KeyboardEvent): void {
    if (event.key === "Escape" && !this.menu.hidden) {
      event.preventDefault();
      event.stopPropagation();
      this.closeMenu();
      return;
    }
    if (!this.menu.hidden) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const items = [...this.menu.querySelectorAll<HTMLElement>(".menu-item")];
        const index = items.indexOf(document.activeElement as HTMLElement);
        const step = event.key === "ArrowDown" ? 1 : -1;
        items[(index + step + items.length) % items.length]?.focus();
      }
      return;
    }
    const target = event.target;
    if (!(target instanceof HTMLElement) || !target.classList.contains("card-main")) return;
    const card = target.closest<HTMLElement>(".card");
    if (!card) return;
    if (event.key === "Delete") {
      const remove = card.querySelector<HTMLButtonElement>(".card-remove");
      if (remove) {
        event.preventDefault();
        const next = neighbour(this.root, target, "right") ?? neighbour(this.root, target, "left");
        remove.click();
        next?.focus({ preventScroll: false });
      }
      return;
    }
    if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
      event.preventDefault();
      const rect = target.getBoundingClientRect();
      card.dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          clientX: rect.left + 24,
          clientY: rect.top + 24,
        }),
      );
      return;
    }
    const direction =
      event.key === "ArrowRight"
        ? "right"
        : event.key === "ArrowLeft"
          ? "left"
          : event.key === "ArrowDown"
            ? "down"
            : event.key === "ArrowUp"
              ? "up"
              : null;
    if (!direction) return;
    event.preventDefault();
    neighbour(this.root, target, direction)?.focus();
  }
}

type Direction = "left" | "right" | "up" | "down";

/** The nearest card in a direction, judged by on-screen position. */
function neighbour(root: HTMLElement, from: HTMLElement, direction: Direction): HTMLElement | null {
  const origin = from.getBoundingClientRect();
  const ox = origin.left + origin.width / 2;
  const oy = origin.top + origin.height / 2;
  let best: HTMLElement | null = null;
  let bestScore = Infinity;
  for (const node of root.querySelectorAll<HTMLElement>(".card-main")) {
    if (node === from) continue;
    const rect = node.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const dx = x - ox;
    const dy = y - oy;
    const along =
      direction === "left" ? -dx : direction === "right" ? dx : direction === "up" ? -dy : dy;
    const across = direction === "left" || direction === "right" ? Math.abs(dy) : Math.abs(dx);
    if (along <= 1) continue;
    // Stay in the row (or column) first; prefer the closest.
    const score = across * 4 + along;
    if (score < bestScore) {
      bestScore = score;
      best = node;
    }
  }
  return best;
}

function skeletonShelf(columns: number): HTMLElement {
  const shelf = el("section", "shelf is-skeleton");
  shelf.setAttribute("aria-busy", "true");
  shelf.setAttribute("aria-label", "Loading your videos");
  const head = el("header", "shelf-head");
  head.append(el("div", "skeleton-line is-title"));
  const grid = el("div", "grid");
  for (let index = 0; index < Math.max(2, columns); index++) {
    const card = el("div", "card is-skeleton");
    const thumb = el("div", "thumb is-loading");
    const lines = el("div", "card-text");
    lines.append(el("div", "skeleton-line"), el("div", "skeleton-line is-short"));
    card.append(thumb, lines);
    grid.append(card);
  }
  shelf.append(head, grid);
  return shelf;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

function textButton(label: string, className: string): HTMLButtonElement {
  const node = el("button", className);
  node.type = "button";
  node.textContent = label;
  return node;
}

function iconButton(glyph: IconName, label: string, className: string): HTMLButtonElement {
  const node = el("button", className);
  node.type = "button";
  node.setAttribute("aria-label", label);
  node.dataset.tip = label;
  node.innerHTML = icon(glyph);
  return node;
}

function menuItem(label: string, onClick: () => void): HTMLButtonElement {
  const node = el("button", "menu-item");
  node.type = "button";
  node.setAttribute("role", "menuitem");
  const text = el("span");
  text.textContent = label;
  node.append(text);
  node.addEventListener("click", onClick);
  return node;
}

function separator(): HTMLElement {
  return el("div", "menu-sep");
}

function cssEscape(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(value);
  return value.replace(/["\\]/g, "\\$&");
}
