import { describe, expect, it } from "vitest";
import { STREAM_ERROR } from "../src/player/backend";
import {
  codecLabel,
  describeMediaError,
  describeUnsupported,
  droppedAudioNote,
} from "../src/player/errors";

describe("unsupported formats", () => {
  it("names common recorder codecs", () => {
    expect(codecLabel("adpcm_ima_wav")).toBe("IMA ADPCM");
    expect(codecLabel("pcm_alaw")).toBe("A-law");
    expect(codecLabel("some_codec")).toBe("SOME CODEC");
    expect(codecLabel("")).toBe("an unknown");
  });

  it("explains audio and video separately", () => {
    const audio = describeUnsupported("rec.avi", { kind: "audio", codec: "adpcm_yamaha" });
    expect(audio.title).toBe("This audio format isn't supported");
    expect(audio.body).toBe(
      "rec.avi uses Yamaha ADPCM audio, which Glint can't play yet. Converting it to MP3 or WAV with another app will make it play.",
    );
    const video = describeUnsupported("old.avi", { kind: "video", codec: "cinepak" });
    expect(video.title).toBe("This video format isn't supported");
    expect(video.body).toContain("Cinepak video");
    expect(droppedAudioNote("gsm_ms")).toContain("GSM audio isn't supported");
  });

  it("keeps the generic converter message for other failures", () => {
    const copy = describeMediaError({
      filename: "a.mkv",
      code: STREAM_ERROR,
      extension: "mkv",
      detail: null,
    });
    expect(copy.title).toBe("This file can't be played");
  });
});
