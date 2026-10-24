// Reads the PNGs that page.screenshot() returns: 8-bit RGB or RGBA, not interlaced. Enough for the
// capture's frames, not a general decoder.

import { inflateSync } from "node:zlib";

/** A picture's pixels, three bytes each (red, green, blue), row by row from the top left. */
export interface Picture {
  readonly width: number;
  readonly height: number;
  readonly rgb: Uint8Array;
}

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

export function readPng(png: Uint8Array): Picture {
  if (SIGNATURE.some((byte, i) => png[i] !== byte)) throw new Error("Not a PNG.");
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  let width = 0;
  let height = 0;
  let channels = 0;
  const chunks: Uint8Array[] = [];
  for (let at = SIGNATURE.length; at < png.length; ) {
    const length = view.getUint32(at);
    const type = String.fromCharCode(...png.subarray(at + 4, at + 8));
    const data = png.subarray(at + 8, at + 8 + length);
    if (type === "IHDR") {
      width = view.getUint32(at + 8);
      height = view.getUint32(at + 12);
      const [depth, colour, , , interlace] = data.subarray(8);
      if (depth !== 8 || interlace !== 0 || (colour !== 2 && colour !== 6)) {
        throw new Error(`Only 8-bit RGB or RGBA PNGs without interlacing are read (depth ${depth}, colour type ${colour}).`);
      }
      channels = colour === 2 ? 3 : 4;
    } else if (type === "IDAT") {
      chunks.push(data);
    } else if (type === "IEND") {
      break;
    }
    at += 12 + length;
  }

  const compressed = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
  chunks.reduce((at, chunk) => (compressed.set(chunk, at), at + chunk.length), 0);
  const filtered = inflateSync(compressed);

  // Each row starts with its filter type; undo it against the row above and the pixel to the left.
  const stride = width * channels;
  const pixels = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = filtered[y * (stride + 1)]!;
    if (filter > 4) throw new Error(`Unknown PNG filter ${filter} on row ${y}.`);
    const from = y * (stride + 1) + 1;
    const row = y * stride;
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? pixels[row + x - channels]! : 0;
      const up = y > 0 ? pixels[row - stride + x]! : 0;
      const upLeft = x >= channels && y > 0 ? pixels[row - stride + x - channels]! : 0;
      // Filters 0 to 4: none, the left, the one above, their average, Paeth's predictor.
      const predicted = filter === 1 ? left : filter === 2 ? up : filter === 3 ? (left + up) >> 1 : filter === 4 ? paeth(left, up, upLeft) : 0;
      pixels[row + x] = (filtered[from + x]! + predicted) & 0xff;
    }
  }

  if (channels === 3) return { width, height, rgb: pixels };
  // A screenshot is opaque, so the alpha byte is dropped.
  const rgb = new Uint8Array(width * height * 3);
  for (let i = 0, j = 0; i < pixels.length; i += 4, j += 3) rgb.set(pixels.subarray(i, i + 3), j);
  return { width, height, rgb };
}

function paeth(left: number, up: number, upLeft: number): number {
  const p = left + up - upLeft;
  const toLeft = Math.abs(p - left);
  const toUp = Math.abs(p - up);
  const toUpLeft = Math.abs(p - upLeft);
  if (toLeft <= toUp && toLeft <= toUpLeft) return left;
  return toUp <= toUpLeft ? up : upLeft;
}
