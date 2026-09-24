"use client";

import type { DecodeHintType as HintType } from "@zxing/library";
import { useEffect, useEffectEvent, useRef, useState } from "react";

export interface ScanResult {
  ok: boolean;
  text: string;
}

function cameraError(e: unknown): string {
  const name = e instanceof Error ? e.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Нет доступа к камере. Разрешите его в настройках браузера для этого сайта.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") return "Камера не найдена.";
  if (name === "NotReadableError") return "Камера занята другим приложением.";
  if (typeof window !== "undefined" && !window.isSecureContext) {
    return "Камера работает только на сайте с https.";
  }
  return e instanceof Error ? e.message : String(e);
}

/**
 * Full-screen camera that keeps reading barcodes until it is closed. Each code is passed to
 * `onScan` once per appearance: to add the same product again, move the camera away and back.
 * The decoder (ZXing) is loaded only when the camera is opened.
 */
export function CameraScanner({
  onScan,
  onClose,
  result,
}: {
  onScan: (code: string) => void;
  onClose: () => void;
  result: ScanResult | null;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const handle = useEffectEvent((code: string) => onScan(code));

  useEffect(() => {
    let stop: (() => void) | undefined;
    let cancelled = false;
    let last = { code: "", at: 0 };
    (async () => {
      try {
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
        ]);
        const reader = new BrowserMultiFormatReader(hints, {
          delayBetweenScanAttempts: 120,
        });
        if (cancelled || !videoRef.current) return;
        const controls = await reader.decodeFromConstraints(
          { audio: false, video: { facingMode: { ideal: "environment" } } },
          videoRef.current,
          (res) => {
            if (!res) return;
            const code = res.getText();
            const now = Date.now();
            // A code held in front of the lens is read every few frames: count it once, and
            // again only after it has been out of view for a second (the next box).
            const stillInView = code === last.code && now - last.at < 1000;
            last = { code, at: now };
            if (!stillInView) handle(code);
          },
        );
        if (cancelled) controls.stop();
        else {
          stop = () => controls.stop();
          setReady(true);
        }
      } catch (e) {
        if (!cancelled) setError(cameraError(e));
      }
    })();
    return () => {
      cancelled = true;
      stop?.();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black text-white" role="dialog" aria-label="Сканер">
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-sm text-stone-300">Наведите камеру на штрихкод</span>
        <button className="btn btn-sm bg-white text-ink" onClick={onClose}>
          Готово
        </button>
      </div>
      <div className="relative flex-1 overflow-hidden">
        <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
        {ready && (
          <div className="pointer-events-none absolute inset-x-8 top-1/2 h-32 -translate-y-1/2 rounded-xl border-2 border-gold/80">
            <div className="absolute inset-x-3 top-1/2 h-0.5 bg-red-500/70" />
          </div>
        )}
        {!ready && !error && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-stone-300">
            Включаем камеру…
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm">
            {error}
          </div>
        )}
      </div>
      <div
        className={`min-h-16 px-4 py-4 text-center text-sm font-semibold ${
          result ? (result.ok ? "bg-emerald-700" : "bg-red-700") : "bg-stone-900 text-stone-400"
        }`}
        aria-live="polite"
      >
        {result?.text ?? "Штрихкод добавляется, как только камера его прочитает"}
        <div className="mt-1 text-xs font-normal opacity-80">
          Ещё одна такая же коробка — уберите камеру и наведите снова
        </div>
      </div>
    </div>
  );
}
