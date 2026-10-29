import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { StreamSource } from "../src/model/media";
import { type FeederDeps, MseFeeder } from "../src/player/mse-feeder";

const INIT = new Uint8Array(readFileSync(join(__dirname, "fixtures", "h264.init.mp4")));

class Ranges {
  constructor(private readonly spans: [number, number][]) {}
  get length(): number {
    return this.spans.length;
  }
  start(i: number): number {
    return this.spans[i][0];
  }
  end(i: number): number {
    return this.spans[i][1];
  }
}

class FakeSourceBuffer extends EventTarget {
  updating = false;
  mode = "";
  timestampOffset = 0;
  spans: [number, number][] = [];
  appended: number[] = [];
  aborts = 0;
  removed: [number, number][] = [];
  /** `perAppend` says what each append adds to the buffered ranges. */
  constructor(
    readonly mime: string,
    private readonly perAppend: () => [number, number] | null,
  ) {
    super();
  }
  get buffered(): Ranges {
    return new Ranges(this.spans);
  }
  appendBuffer(data: Uint8Array): void {
    this.appended.push(data.length);
    this.updating = true;
    const span = this.perAppend();
    queueMicrotask(() => {
      if (span) this.spans.push(span);
      this.updating = false;
      this.dispatchEvent(new Event("updateend"));
    });
  }
  abort(): void {
    this.aborts += 1;
  }
  remove(start: number, end: number): void {
    this.removed.push([start, end]);
    this.updating = true;
    queueMicrotask(() => {
      this.updating = false;
      this.dispatchEvent(new Event("updateend"));
    });
  }
}

class FakeMediaSource extends EventTarget {
  readyState: "closed" | "open" | "ended" = "closed";
  duration = Number.NaN;
  buffers: FakeSourceBuffer[] = [];
  ended = 0;
  constructor(private readonly perAppend: () => [number, number] | null) {
    super();
  }
  open(): void {
    this.readyState = "open";
    this.dispatchEvent(new Event("sourceopen"));
  }
  addSourceBuffer(mime: string): FakeSourceBuffer {
    const buffer = new FakeSourceBuffer(mime, this.perAppend);
    this.buffers.push(buffer);
    return buffer;
  }
  endOfStream(): void {
    this.ended += 1;
    this.readyState = "ended";
  }
}

class FakeVideo extends EventTarget {
  src = "";
  currentTime = 0;
  seek(time: number): void {
    this.currentTime = time;
    this.dispatchEvent(new Event("seeking"));
  }
}

/** A response body the test feeds by hand. */
function controlledBody() {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
  });
  return {
    response: new Response(body),
    push: (bytes: Uint8Array) => controller.enqueue(bytes),
    close: () => controller.close(),
  };
}

const STREAM: StreamSource = {
  url: "http://127.0.0.1:1/stream/abc",
  mode: "audio",
  duration: 120,
  timeOffset: 10,
  hasVideo: true,
};

function setup(perAppend: () => [number, number] | null = () => null) {
  const source = new FakeMediaSource(perAppend);
  const requests: { url: string; signal: AbortSignal }[] = [];
  const bodies: ReturnType<typeof controlledBody>[] = [];
  const revoked: string[] = [];
  const deps: FeederDeps = {
    fetch: async (url, init) => {
      requests.push({ url, signal: init.signal });
      const body = controlledBody();
      bodies.push(body);
      return body.response;
    },
    createMediaSource: () => source as unknown as MediaSource,
    createObjectURL: () => "blob:glint/1",
    revokeObjectURL: (url) => void revoked.push(url),
    delay: () => new Promise((resolve) => setTimeout(resolve, 0)),
  };
  const video = new FakeVideo();
  const feeder = new MseFeeder(video as unknown as HTMLVideoElement, STREAM, deps);
  const failures: string[] = [];
  feeder.onFailure = (message) => void failures.push(message);
  return { source, requests, bodies, revoked, video, feeder, failures };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 5));

describe("MseFeeder", () => {
  it("streams ffmpeg's output into one SourceBuffer on the file's timeline", async () => {
    const t = setup(() => [0, 4]);
    t.feeder.attach();
    expect(t.video.src).toBe("blob:glint/1");
    t.source.open();
    await settle();
    expect(t.source.duration).toBe(120);
    expect(t.requests.map((r) => r.url)).toEqual([`${STREAM.url}?t=0.000`]);

    // The init segment arrives split across reads.
    t.bodies[0].push(INIT.subarray(0, 100));
    t.bodies[0].push(INIT.subarray(100));
    t.bodies[0].push(new Uint8Array(500));
    t.bodies[0].close();
    await settle();

    const buffer = t.source.buffers[0];
    expect(buffer.mime).toBe('video/mp4; codecs="avc1.64000c,mp4a.40.2"');
    expect(buffer.mode).toBe("segments");
    expect(buffer.timestampOffset).toBe(-10);
    expect(buffer.appended).toEqual([INIT.length, 500]);
    expect(t.source.ended).toBe(1);
    expect(t.failures).toEqual([]);
  });

  it("restarts ffmpeg for seeks outside the buffer, not inside it", async () => {
    const t = setup(() => [0, 30]);
    t.feeder.attach();
    t.source.open();
    await settle();
    t.bodies[0].push(INIT);
    t.bodies[0].push(new Uint8Array(100));
    await settle();

    t.video.seek(12);
    await settle();
    expect(t.requests).toHaveLength(1);

    t.video.seek(80);
    await settle();
    expect(t.requests).toHaveLength(2);
    expect(t.requests[0].signal.aborted).toBe(true);
    expect(t.requests[1].url).toBe(`${STREAM.url}?t=79.750`);
    const buffer = t.source.buffers[0];
    // The half-read fragment is dropped and the offset reset for the new session.
    expect(buffer.aborts).toBe(1);
    expect(buffer.timestampOffset).toBe(-10);

    // The new session's init segment reuses the same SourceBuffer.
    t.bodies[1].push(INIT);
    t.bodies[1].push(new Uint8Array(200));
    await settle();
    expect(t.source.buffers).toHaveLength(1);
    expect(buffer.appended).toEqual([INIT.length, 100, INIT.length, 200]);
  });

  it("frees media far behind the playhead", async () => {
    let next = 0;
    const t = setup(() => {
      next += 20;
      return [0, next];
    });
    t.feeder.attach();
    t.source.open();
    await settle();
    t.bodies[0].push(INIT);
    await settle();
    t.video.currentTime = 50;
    t.source.buffers[0].spans = [[0, 60]];
    t.bodies[0].push(new Uint8Array(10));
    await settle();
    expect(t.source.buffers[0].removed).toEqual([[0, 20]]);
  });

  it("reports a stream that never produced video", async () => {
    const t = setup();
    t.feeder.attach();
    t.source.open();
    await settle();
    t.bodies[0].close();
    await settle();
    expect(t.failures).toEqual(["Glint couldn't convert this file."]);
    expect(t.source.ended).toBe(0);
  });

  it("stops reading and releases the blob when disposed", async () => {
    const t = setup();
    t.feeder.attach();
    t.source.open();
    await settle();
    t.feeder.dispose();
    expect(t.requests[0].signal.aborted).toBe(true);
    expect(t.revoked).toEqual(["blob:glint/1"]);
    t.video.seek(90);
    await settle();
    expect(t.requests).toHaveLength(1);
    expect(t.failures).toEqual([]);
  });
});
