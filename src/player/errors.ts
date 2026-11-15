import type { UnsupportedFormat } from "../model/media";
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

/** Readable names for the codecs people meet in old recordings and videos. */
const CODEC_NAMES: Record<string, string> = {
  adpcm_ima_wav: "IMA ADPCM",
  adpcm_ms: "Microsoft ADPCM",
  adpcm_g726: "G.726",
  adpcm_g726le: "G.726",
  adpcm_yamaha: "Yamaha ADPCM",
  gsm_ms: "GSM",
  truespeech: "TrueSpeech",
  pcm_alaw: "A-law",
  pcm_mulaw: "\u00b5-law",
  amr_nb: "AMR",
  amr_wb: "AMR-WB",
  wmavoice: "Windows Media Voice",
  cinepak: "Cinepak",
  indeo3: "Indeo",
  indeo5: "Indeo",
  msvideo1: "Microsoft Video 1",
  mjpeg: "Motion JPEG",
  prores: "ProRes",
};

/** "adpcm_yamaha" -> "Yamaha ADPCM"; unknown codecs are shown in capitals. */
export function codecLabel(codec: string): string {
  const known = CODEC_NAMES[codec.toLowerCase()];
  if (known) return known;
  const plain = codec.replace(/_/g, " ").trim();
  return plain ? plain.toUpperCase() : "an unknown";
}

/** The message for a file Glint has no decoder for, instead of a generic failure. */
export function describeUnsupported(filename: string, format: UnsupportedFormat): MediaErrorCopy {
  const codec = codecLabel(format.codec);
  if (format.kind === "audio") {
    return {
      title: "This audio format isn't supported",
      body: `${filename} uses ${codec} audio, which Glint can't play yet. Converting it to MP3 or WAV with another app will make it play.`,
    };
  }
  return {
    title: "This video format isn't supported",
    body: `${filename} uses ${codec} video, which Glint can't play yet.`,
  };
}

/** The brief note for a video that plays without its (undecodable) audio. */
export function droppedAudioNote(codec: string): string {
  return `${codecLabel(codec)} audio isn't supported \u2014 playing without sound`;
}
