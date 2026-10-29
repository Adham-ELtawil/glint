/**
 * Just enough ISO-BMFF parsing for Media Source Extensions: where the init
 * segment (ftyp + moov) ends, and the RFC 6381 codec string to pass to
 * `addSourceBuffer`.
 */

interface Box {
  type: string;
  start: number;
  /** First byte of the payload. */
  body: number;
  end: number;
}

function* boxes(data: Uint8Array, start: number, end: number): Generator<Box> {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let offset = start;
  while (offset + 8 <= end) {
    let size = view.getUint32(offset);
    let header = 8;
    if (size === 1) {
      if (offset + 16 > end) return;
      size = Number(view.getBigUint64(offset + 8));
      header = 16;
    } else if (size === 0) {
      size = end - offset;
    }
    if (size < header) return;
    const type = String.fromCharCode(
      data[offset + 4],
      data[offset + 5],
      data[offset + 6],
      data[offset + 7],
    );
    yield { type, start: offset, body: offset + header, end: offset + size };
    offset += size;
  }
}

function child(data: Uint8Array, parent: Box, type: string): Box | null {
  for (const box of boxes(data, parent.body, Math.min(parent.end, data.length))) {
    if (box.type === type) return box;
  }
  return null;
}

/** Byte length of the init segment once `ftyp` and a complete `moov` are in, else -1. */
export function initSegmentEnd(data: Uint8Array): number {
  for (const box of boxes(data, 0, data.length)) {
    if (box.end > data.length) return -1;
    if (box.type === "moov") return box.end;
  }
  return -1;
}

interface Track {
  handler: string;
  entry: Box | null;
}

function tracks(data: Uint8Array): Track[] {
  const end = initSegmentEnd(data);
  if (end < 0) return [];
  const moov = [...boxes(data, 0, end)].find((box) => box.type === "moov");
  if (!moov) return [];
  const found: Track[] = [];
  for (const trak of boxes(data, moov.body, moov.end)) {
    if (trak.type !== "trak") continue;
    const mdia = child(data, trak, "mdia");
    if (!mdia) continue;
    const hdlr = child(data, mdia, "hdlr");
    const handler = hdlr
      ? String.fromCharCode(...data.subarray(hdlr.body + 8, hdlr.body + 12))
      : "";
    const minf = child(data, mdia, "minf");
    const stbl = minf ? child(data, minf, "stbl") : null;
    const stsd = stbl ? child(data, stbl, "stsd") : null;
    let entry: Box | null = null;
    if (stsd) {
      // Full box header (4) + entry count (4), then the sample entries.
      for (const box of boxes(data, stsd.body + 8, stsd.end)) {
        entry = box;
        break;
      }
    }
    found.push({ handler, entry });
  }
  return found;
}

const hex = (value: number) => value.toString(16).padStart(2, "0");

function visualChild(data: Uint8Array, entry: Box, type: string): Uint8Array | null {
  // A visual sample entry has 78 bytes of fixed fields before its child boxes.
  for (const box of boxes(data, entry.body + 78, entry.end)) {
    if (box.type === type) return data.subarray(box.body, box.end);
  }
  return null;
}

function avcCodec(type: string, avcC: Uint8Array): string {
  return `${type}.${hex(avcC[1])}${hex(avcC[2])}${hex(avcC[3])}`;
}

function hevcCodec(type: string, hvcC: Uint8Array): string {
  const space = hvcC[1] >> 6;
  const tier = (hvcC[1] >> 5) & 1;
  const profile = hvcC[1] & 0x1f;
  let flags = ((hvcC[2] << 24) | (hvcC[3] << 16) | (hvcC[4] << 8) | hvcC[5]) >>> 0;
  let reversed = 0;
  for (let bit = 0; bit < 32; bit += 1) {
    reversed = ((reversed << 1) | (flags & 1)) >>> 0;
    flags >>>= 1;
  }
  const constraints = [...hvcC.subarray(6, 12)];
  while (constraints.length > 0 && constraints[constraints.length - 1] === 0) constraints.pop();
  const spacePrefix = space ? String.fromCharCode(64 + space) : "";
  const tail = constraints.length ? `.${constraints.map((b) => b.toString(16)).join(".")}` : "";
  return `${type}.${spacePrefix}${profile}.${reversed.toString(16)}.${tier ? "H" : "L"}${hvcC[12]}${tail}`;
}

function av1Codec(av1C: Uint8Array): string {
  const profile = av1C[1] >> 5;
  const level = av1C[1] & 0x1f;
  const tier = av1C[2] >> 7;
  const high = (av1C[2] >> 6) & 1;
  const twelve = (av1C[2] >> 5) & 1;
  const depth = high ? (twelve ? 12 : 10) : 8;
  return `av01.${profile}.${String(level).padStart(2, "0")}${tier ? "H" : "M"}.${String(depth).padStart(2, "0")}`;
}

function vp9Codec(vpcC: Uint8Array): string {
  // Full box: version + flags, then profile, level, bitDepth (4 bits)...
  const profile = vpcC[4];
  const level = vpcC[5];
  const depth = vpcC[6] >> 4;
  const two = (n: number) => String(n).padStart(2, "0");
  return `vp09.${two(profile)}.${two(level)}.${two(depth)}`;
}

/** RFC 6381 codec of the first video track, or null. */
export function videoCodec(init: Uint8Array): string | null {
  const track = tracks(init).find((t) => t.handler === "vide");
  const entry = track?.entry;
  if (!entry) return null;
  switch (entry.type) {
    case "avc1":
    case "avc3": {
      const avcC = visualChild(init, entry, "avcC");
      return avcC ? avcCodec(entry.type, avcC) : entry.type;
    }
    case "hvc1":
    case "hev1": {
      const hvcC = visualChild(init, entry, "hvcC");
      return hvcC ? hevcCodec(entry.type, hvcC) : entry.type;
    }
    case "av01": {
      const av1C = visualChild(init, entry, "av1C");
      return av1C ? av1Codec(av1C) : "av01";
    }
    case "vp09": {
      const vpcC = visualChild(init, entry, "vpcC");
      return vpcC ? vp9Codec(vpcC) : "vp09";
    }
    default:
      return entry.type;
  }
}

export function hasAudio(init: Uint8Array): boolean {
  return tracks(init).some((t) => t.handler === "soun");
}

/** MIME type for `addSourceBuffer`. Glint's streams only carry AAC audio. */
export function mimeFor(init: Uint8Array): string | null {
  const video = videoCodec(init);
  const audio = hasAudio(init) ? "mp4a.40.2" : null;
  const codecs = [video, audio].filter(Boolean).join(",");
  if (!codecs) return null;
  return `${video ? "video" : "audio"}/mp4; codecs="${codecs}"`;
}
