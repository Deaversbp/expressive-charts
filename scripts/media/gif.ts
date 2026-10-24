// Writes an animated GIF that plays once. It has no loop extension (NETSCAPE2.0), so every browser
// shows each frame once and stops on the last, which the capture makes the effect's end state.
//
// One palette for every frame, so a colour can't shift between frames: the colours themselves when
// there are 255 or fewer, or else 255 chosen by median cut. After the first frame, each frame holds
// only the box of pixels that changed, with the unchanged ones inside it transparent, and a frame
// with no change adds its time to the frame before.

import type { Picture } from "./png";

export interface Frame extends Picture {
  /** How long the frame shows, in ms. GIF keeps hundredths of a second. */
  readonly delay: number;
}

/** The palette index of a pixel that didn't change since the frame before. */
const UNCHANGED = 255;

/** The GIF's bytes, and how long it plays: every frame's time but the last, which stays. */
export function writeGif(frames: readonly Frame[]): { readonly bytes: Uint8Array; readonly playsFor: number } {
  const first = frames[0];
  if (!first) throw new Error("A GIF needs a frame.");
  const { width, height } = first;
  for (const frame of frames) {
    if (frame.width !== width || frame.height !== height) throw new Error("Every frame must be the same size.");
  }

  const palette = paletteOf(frames);
  const indexOf = nearest(palette);
  const pixels = width * height;

  // Each frame as palette indices, then only what changed from the frame shown before it.
  const shown: { left: number; top: number; width: number; height: number; indices: Uint8Array; delay: number }[] = [];
  let previous: Uint8Array | undefined;
  for (const frame of frames) {
    const indices = new Uint8Array(pixels);
    for (let i = 0; i < pixels; i++) {
      indices[i] = indexOf((frame.rgb[i * 3]! << 16) | (frame.rgb[i * 3 + 1]! << 8) | frame.rgb[i * 3 + 2]!);
    }
    if (!previous) {
      shown.push({ left: 0, top: 0, width, height, indices, delay: frame.delay });
      previous = indices;
      continue;
    }
    let [left, top, right, bottom] = [width, height, -1, -1];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (indices[y * width + x] === previous[y * width + x]) continue;
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
    }
    if (right < 0) {
      shown[shown.length - 1]!.delay += frame.delay;
      continue;
    }
    const box = { left, top, width: right - left + 1, height: bottom - top + 1 };
    const changed = new Uint8Array(box.width * box.height);
    for (let y = 0; y < box.height; y++) {
      for (let x = 0; x < box.width; x++) {
        const i = (top + y) * width + left + x;
        changed[y * box.width + x] = indices[i] === previous[i] ? UNCHANGED : indices[i]!;
      }
    }
    shown.push({ ...box, indices: changed, delay: frame.delay });
    previous = indices;
  }

  const out: number[] = [];
  const u16 = (value: number): void => void out.push(value & 0xff, value >> 8);
  out.push(..."GIF89a".split("").map((c) => c.charCodeAt(0)));
  u16(width);
  u16(height);
  // A global colour table of 256 entries, 8 bits a channel; background 0; square pixels.
  out.push(0xf7, 0, 0);
  for (let i = 0; i < 256; i++) {
    const colour = palette[i] ?? 0;
    out.push(colour >> 16, (colour >> 8) & 0xff, colour & 0xff);
  }
  shown.forEach((frame, n) => {
    // Graphic control: keep this frame under the next (disposal 1), and after the first, UNCHANGED is transparent.
    out.push(0x21, 0xf9, 4, (1 << 2) | (n > 0 ? 1 : 0));
    u16(Math.round(frame.delay / 10));
    out.push(UNCHANGED, 0);
    out.push(0x2c);
    u16(frame.left);
    u16(frame.top);
    u16(frame.width);
    u16(frame.height);
    out.push(0);
    out.push(8);
    const data = lzw(frame.indices);
    for (let at = 0; at < data.length; at += 255) {
      const block = data.slice(at, at + 255);
      out.push(block.length, ...block);
    }
    out.push(0);
  });
  out.push(0x3b);

  const playsFor = shown.slice(0, -1).reduce((sum, frame) => sum + Math.round(frame.delay / 10) * 10, 0);
  return { bytes: Uint8Array.from(out), playsFor };
}

/** Up to 255 colours as 0xRRGGBB, from every pixel of the first frame and every changed pixel after it. */
function paletteOf(frames: readonly Frame[]): number[] {
  const counts = new Map<number, number>();
  frames.forEach((frame, n) => {
    const before = frames[n - 1];
    for (let i = 0; i < frame.rgb.length; i += 3) {
      if (before && before.rgb[i] === frame.rgb[i] && before.rgb[i + 1] === frame.rgb[i + 1] && before.rgb[i + 2] === frame.rgb[i + 2]) continue;
      const colour = (frame.rgb[i]! << 16) | (frame.rgb[i + 1]! << 8) | frame.rgb[i + 2]!;
      counts.set(colour, (counts.get(colour) ?? 0) + 1);
    }
  });
  const colours = [...counts].map(([colour, count]) => ({ rgb: [colour >> 16, (colour >> 8) & 0xff, colour & 0xff] as const, count }));
  if (colours.length <= UNCHANGED) return colours.map(({ rgb }) => (rgb[0] << 16) | (rgb[1] << 8) | rgb[2]);

  // Median cut: split the box whose pixels spread furthest (its count times its widest channel's
  // range) at the median pixel along that channel, until there are 255. Each colour is its box's mean.
  type Colour = (typeof colours)[number];
  interface Box {
    readonly colours: Colour[];
    readonly total: number;
    readonly channel: 0 | 1 | 2;
    readonly score: number;
  }
  const boxOf = (box: Colour[]): Box => {
    let total = 0;
    const low = [255, 255, 255];
    const high = [0, 0, 0];
    for (const { rgb, count } of box) {
      total += count;
      for (const channel of [0, 1, 2] as const) {
        low[channel] = Math.min(low[channel]!, rgb[channel]);
        high[channel] = Math.max(high[channel]!, rgb[channel]);
      }
    }
    const ranges = [0, 1, 2].map((channel) => high[channel]! - low[channel]!);
    const channel = ranges.indexOf(Math.max(...ranges)) as 0 | 1 | 2;
    return { colours: box, total, channel, score: box.length < 2 ? 0 : ranges[channel]! * total };
  };
  const boxes = [boxOf(colours)];
  while (boxes.length < UNCHANGED) {
    const pick = boxes.reduce((best, box, i) => (box.score > (boxes[best]?.score ?? 0) ? i : best), -1);
    if (pick < 0) break;
    const { colours: box, total, channel } = boxes[pick]!;
    box.sort((a, b) => a.rgb[channel] - b.rgb[channel]);
    let split = 0;
    for (let seen = 0; split < box.length - 1 && seen + box[split]!.count <= total / 2; split++) seen += box[split]!.count;
    split = Math.min(Math.max(split, 1), box.length - 1);
    boxes.splice(pick, 1, boxOf(box.slice(0, split)), boxOf(box.slice(split)));
  }
  return boxes.map(({ colours: box, total }) => {
    const mean = ([0, 1, 2] as const).map((channel) => Math.round(box.reduce((sum, c) => sum + c.rgb[channel] * c.count, 0) / total));
    return (mean[0]! << 16) | (mean[1]! << 8) | mean[2]!;
  });
}

/** A colour's nearest palette index, by distance weighted towards green, as the eye is. */
function nearest(palette: readonly number[]): (colour: number) => number {
  const found = new Map<number, number>();
  return (colour) => {
    const known = found.get(colour);
    if (known !== undefined) return known;
    const [r, g, b] = [colour >> 16, (colour >> 8) & 0xff, colour & 0xff];
    let best = 0;
    let bestDistance = Infinity;
    palette.forEach((entry, i) => {
      const distance = 2 * (r - (entry >> 16)) ** 2 + 4 * (g - ((entry >> 8) & 0xff)) ** 2 + 3 * (b - (entry & 0xff)) ** 2;
      if (distance < bestDistance) [best, bestDistance] = [i, distance];
    });
    found.set(colour, best);
    return best;
  };
}

/** GIF's variable-length LZW for 8-bit indices: codes from 9 to 12 bits, cleared when the table is full. */
function lzw(indices: Uint8Array): number[] {
  const CLEAR = 256;
  const END = 257;
  const out: number[] = [];
  let bits = 0;
  let held = 0;
  let size = 9;
  const emit = (code: number): void => {
    held |= code << bits;
    bits += size;
    while (bits >= 8) {
      out.push(held & 0xff);
      held >>>= 8;
      bits -= 8;
    }
  };
  let table = new Map<number, number>();
  let next = END + 1;
  emit(CLEAR);
  let prefix = indices[0]!;
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i]!;
    const key = (prefix << 8) | k;
    const code = table.get(key);
    if (code !== undefined) {
      prefix = code;
      continue;
    }
    emit(prefix);
    if (next === 4096) {
      emit(CLEAR);
      table = new Map();
      next = END + 1;
      size = 9;
    } else {
      if (next >= 1 << size) size++;
      table.set(key, next++);
    }
    prefix = k;
  }
  emit(prefix);
  emit(END);
  if (bits > 0) out.push(held & 0xff);
  return out;
}
