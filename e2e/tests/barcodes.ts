import fs from "node:fs";
import path from "node:path";

// EAN-13 encoding tables: left odd (L), left even (G) and right (R) digit patterns.
const L = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
const R = L.map((p) => [...p].map((b) => (b === "0" ? "1" : "0")).join(""));
const G = R.map((p) => [...p].reverse().join(""));
const PARITY = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];

/** A valid EAN-13 from its first 12 digits. */
export function ean13(first12: string): string {
  const sum = [...first12].reduce((s, d, i) => s + Number(d) * (i % 2 === 0 ? 1 : 3), 0);
  return first12 + ((10 - (sum % 10)) % 10);
}

/** A random valid EAN-13 in the in-store range (prefix 2), so it never clashes with the demo data. */
export function randomEan(): string {
  let digits = "2";
  for (let i = 0; i < 11; i++) digits += Math.floor(Math.random() * 10);
  return ean13(digits);
}

function modules(code: string): string {
  let bits = "101";
  [...code.slice(1, 7)].forEach((d, i) => {
    bits += (PARITY[Number(code[0])][i] === "L" ? L : G)[Number(d)];
  });
  bits += "01010";
  for (const d of code.slice(7)) bits += R[Number(d)];
  return bits + "101";
}

/** The two codes the fake camera shows, one after the other. */
export const CAMERA_CODES = [ean13("460123456789"), ean13("460987654321")] as const;
export const CAMERA_VIDEO = path.join(__dirname, "..", ".cache", "barcodes.y4m");

/**
 * A Y4M video for Chromium's fake camera: each code in turn, 3 s each, on a portrait
 * 480×640 frame (phones crop landscape video to the middle).
 */
export function writeBarcodeVideo(file: string, codes: readonly string[], w = 480, h = 640): void {
  const frameFor = (code: string) => {
    const bits = modules(code);
    const module = 4;
    const x0 = Math.floor((w - bits.length * module) / 2);
    const barTop = Math.floor((h - 220) / 2);
    const row = Buffer.alloc(w, 235);
    [...bits].forEach((b, i) => {
      if (b === "1") row.fill(16, x0 + i * module, x0 + (i + 1) * module);
    });
    const white = Buffer.alloc(w, 235);
    const luma = Buffer.concat(Array.from({ length: h }, (_, y) => (y >= barTop && y < barTop + 220 ? row : white)));
    const chroma = Buffer.alloc((w / 2) * (h / 2), 128);
    return Buffer.concat([Buffer.from("FRAME\n"), luma, chroma, chroma]);
  };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const out = fs.openSync(file, "w");
  fs.writeSync(out, `YUV4MPEG2 W${w} H${h} F10:1 Ip A1:1 C420jpeg\n`);
  for (const code of codes) {
    const frame = frameFor(code);
    for (let i = 0; i < 30; i++) fs.writeSync(out, frame);
  }
  fs.closeSync(out);
}
