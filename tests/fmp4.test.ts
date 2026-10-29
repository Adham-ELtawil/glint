import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { hasAudio, initSegmentEnd, mimeFor, videoCodec } from "../src/player/fmp4";

function fixture(name: string): Uint8Array {
  return new Uint8Array(readFileSync(join(__dirname, "fixtures", name)));
}

describe("fragmented MP4 init segments", () => {
  it("finds the end of ftyp+moov and nothing before it is complete", () => {
    const init = fixture("h264.init.mp4");
    expect(initSegmentEnd(init)).toBe(init.length);
    expect(initSegmentEnd(init.subarray(0, init.length - 1))).toBe(-1);
    expect(initSegmentEnd(new Uint8Array(0))).toBe(-1);
  });

  it("reads the codec string for each video codec ffmpeg can pass through", () => {
    expect(videoCodec(fixture("h264.init.mp4"))).toBe("avc1.64000c");
    expect(videoCodec(fixture("hevc.init.mp4"))).toBe("hvc1.1.6.L60.90");
    expect(videoCodec(fixture("av1.init.mp4"))).toBe("av01.0.00M.08");
    expect(videoCodec(fixture("vp9.init.mp4"))).toBe("vp09.00.11.08");
    expect(videoCodec(fixture("audio.init.mp4"))).toBeNull();
  });

  it("builds the SourceBuffer type, audio-only included", () => {
    expect(hasAudio(fixture("h264.init.mp4"))).toBe(true);
    expect(mimeFor(fixture("h264.init.mp4"))).toBe('video/mp4; codecs="avc1.64000c,mp4a.40.2"');
    expect(mimeFor(fixture("audio.init.mp4"))).toBe('audio/mp4; codecs="mp4a.40.2"');
  });
});
