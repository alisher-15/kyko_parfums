import type { DecodeHintType as HintType } from "@zxing/library";

/** Reads a barcode from a canvas; null when there is none. */
export type Decode = (canvas: HTMLCanvasElement) => Promise<string | null>;

// The browser's own detector (Chrome on Android, Samsung Internet…); not in the TS DOM lib yet.
interface NativeDetector {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
}
interface NativeDetectorClass {
  new (options: { formats: string[] }): NativeDetector;
  getSupportedFormats(): Promise<string[]>;
}

const NATIVE_FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "itf"];

/**
 * The fastest decoder this browser has: the built-in BarcodeDetector where it exists (it is
 * much quicker and more tolerant on Android), otherwise ZXing, loaded only when needed (iPhone).
 */
export async function createDecoder(): Promise<{ decode: Decode; engine: "native" | "zxing" }> {
  const Native = (globalThis as { BarcodeDetector?: NativeDetectorClass }).BarcodeDetector;
  if (Native) {
    try {
      const supported = await Native.getSupportedFormats();
      const formats = NATIVE_FORMATS.filter((f) => supported.includes(f));
      if (formats.includes("ean_13")) {
        const detector = new Native({ formats });
        return {
          engine: "native",
          decode: async (canvas) => (await detector.detect(canvas))[0]?.rawValue ?? null,
        };
      }
    } catch {
      // fall back to ZXing
    }
  }

  const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
    import("@zxing/browser"),
    import("@zxing/library"),
  ]);
  const hints = new Map<HintType, unknown>([
    [
      DecodeHintType.POSSIBLE_FORMATS,
      [
        BarcodeFormat.EAN_13,
        BarcodeFormat.EAN_8,
        BarcodeFormat.UPC_A,
        BarcodeFormat.UPC_E,
        BarcodeFormat.CODE_128,
        BarcodeFormat.CODE_39,
        BarcodeFormat.ITF,
      ],
    ],
    // The picture is only the frame area, so the slower, more thorough search is affordable.
    [DecodeHintType.TRY_HARDER, true],
  ]);
  const reader = new BrowserMultiFormatReader(hints);
  return {
    engine: "zxing",
    decode: async (canvas) => {
      try {
        return reader.decodeFromCanvas(canvas).getText();
      } catch {
        return null; // nothing found in this frame
      }
    },
  };
}
