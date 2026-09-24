"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { createDecoder } from "@/lib/barcode-decoder";
import { scanFeedback } from "@/lib/scan-feedback";
import { ScanResultCard, type ScanResult } from "./ScanResultCard";

export type { ScanResult };

type Phase = "starting" | "scanning" | "processing" | "result";

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
 * Full-screen camera scanner. One read = one action:
 *
 * 1. only a barcode inside the frame is read (not the neighbouring boxes on the shelf);
 * 2. the moment it is read the picture freezes and the phone vibrates, so it is clear the code
 *    was caught while the product is looked up;
 * 3. the result stays on screen (with −/+ and undo) until «Следующий товар» is tapped, and
 *    nothing else is read meanwhile; right after that the same code is ignored until it leaves
 *    the frame, so a box still in front of the lens is not counted twice.
 *
 * `single`: close as soon as a scan succeeds (e.g. adding a barcode to a product).
 */
export function CameraScanner({
  onScan,
  onClose,
  title = "Сканер",
  single = false,
}: {
  onScan: (code: string) => Promise<ScanResult>;
  onClose: () => void;
  title?: string;
  single?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const resumeRef = useRef<(() => void) | null>(null);
  const scanning = useRef(false);
  const ignore = useRef({ code: "", seenAt: 0 });
  const seq = useRef(0);
  const [phase, setPhase] = useState<Phase>("starting");
  const [code, setCode] = useState<string | null>(null);
  const [result, setResult] = useState<{ seq: number; value: ScanResult } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [torch, setTorch] = useState<boolean | null>(null); // null: the camera has no torch

  const detected = useEffectEvent(async (text: string) => {
    videoRef.current?.pause();
    try {
      navigator.vibrate?.(30);
    } catch {
      // no vibration (iPhone)
    }
    setCode(text);
    setResult(null);
    setPhase("processing");
    let res: ScanResult;
    try {
      res = await onScan(text);
    } catch (e) {
      res = { ok: false, title: e instanceof Error ? e.message : String(e) };
    }
    scanFeedback(res.ok);
    ignore.current = { code: text, seenAt: Date.now() };
    if (single && res.ok) {
      onClose();
      return;
    }
    seq.current += 1;
    setResult({ seq: seq.current, value: res });
    setPhase("result");
  });

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    /** Copy the part of the picture inside the frame (with some slack) to the canvas. */
    const grab = (): boolean => {
      const video = videoRef.current;
      const frame = frameRef.current;
      if (!video || !frame || !ctx || !video.videoWidth) return false;
      const vr = video.getBoundingClientRect();
      const fr = frame.getBoundingClientRect();
      // The video is shown with object-cover: find which part of it is on screen.
      const scale = Math.max(vr.width / video.videoWidth, vr.height / video.videoHeight);
      const offX = (video.videoWidth - vr.width / scale) / 2;
      const offY = (video.videoHeight - vr.height / scale) / 2;
      const slack = 0.15;
      const sw = (fr.width / scale) * (1 + slack);
      const sh = (fr.height / scale) * (1 + 2 * slack);
      const sx = Math.max(0, offX + (fr.left - vr.left) / scale - (sw - fr.width / scale) / 2);
      const sy = Math.max(0, offY + (fr.top - vr.top) / scale - (sh - fr.height / scale) / 2);
      const w = Math.min(sw, video.videoWidth - sx);
      const h = Math.min(sh, video.videoHeight - sy);
      const k = Math.min(1, 960 / w); // small enough to decode fast
      canvas.width = Math.round(w * k);
      canvas.height = Math.round(h * k);
      ctx.drawImage(video, sx, sy, w, h, 0, 0, canvas.width, canvas.height);
      return true;
    };

    (async () => {
      try {
        const [media, decoder] = await Promise.all([
          navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
              facingMode: { ideal: "environment" },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
          }),
          createDecoder(),
        ]);
        stream = media;
        const video = videoRef.current;
        if (cancelled || !video) {
          media.getTracks().forEach((t) => t.stop());
          return;
        }
        video.srcObject = media;
        await video.play();
        const track = media.getVideoTracks()[0];
        trackRef.current = track;
        const caps = track.getCapabilities?.() as { torch?: boolean } | undefined;
        if (caps?.torch) setTorch(false);

        const tick = async () => {
          if (cancelled || !scanning.current) return;
          const text = grab() ? await decoder.decode(canvas) : null;
          if (cancelled || !scanning.current) return;
          if (text) {
            const now = Date.now();
            const last = ignore.current;
            if (text === last.code && now - last.seenAt < 800) {
              last.seenAt = now; // the previous box is still in the frame
            } else {
              scanning.current = false;
              void detected(text);
              return;
            }
          }
          timer = setTimeout(tick, 100);
        };
        resumeRef.current = () => {
          clearTimeout(timer);
          scanning.current = true;
          void video.play();
          void tick();
        };
        setPhase("scanning");
        resumeRef.current();
      } catch (e) {
        if (!cancelled) setError(cameraError(e));
      }
    })();

    return () => {
      cancelled = true;
      scanning.current = false;
      clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const next = () => {
    setResult(null);
    setCode(null);
    setPhase("scanning");
    ignore.current.seenAt = Date.now();
    resumeRef.current?.();
  };

  const toggleTorch = async () => {
    const track = trackRef.current;
    if (!track || torch === null) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torch } as MediaTrackConstraintSet] });
      setTorch(!torch);
    } catch {
      setTorch(null);
    }
  };

  const res = result?.value;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black text-white"
      role="dialog"
      aria-label="Сканер штрихкодов"
    >
      <div className="flex items-center gap-2 px-4 py-3">
        <span className="min-w-0 flex-1 truncate text-sm text-stone-300">{title}</span>
        {torch !== null && (
          <button
            type="button"
            className={`btn btn-sm ${torch ? "bg-gold text-white" : "bg-white/15 text-white"}`}
            onClick={toggleTorch}
            aria-pressed={torch}
          >
            Фонарик
          </button>
        )}
        <button type="button" className="btn btn-sm bg-white text-ink" onClick={onClose}>
          Закрыть
        </button>
      </div>

      <div
        className="relative flex-1 overflow-hidden"
        onClick={phase === "result" ? next : undefined}
      >
        <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
        <div
          ref={frameRef}
          className={`pointer-events-none absolute inset-x-6 top-1/2 h-40 -translate-y-1/2 rounded-2xl border-2 transition-colors ${
            phase === "scanning"
              ? "border-white/90"
              : phase === "processing" || res?.ok
                ? "border-emerald-400"
                : phase === "result"
                  ? "border-red-400"
                  : "border-transparent"
          }`}
        >
          {phase === "scanning" && (
            <div className="absolute inset-x-4 top-1/2 h-0.5 animate-pulse bg-red-500/80" />
          )}
        </div>
        {phase === "scanning" && (
          <div className="pointer-events-none absolute inset-x-0 top-[calc(50%-7rem)] text-center text-sm text-white drop-shadow">
            Штрихкод — в рамку, горизонтально
          </div>
        )}
        {phase === "starting" && !error && (
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

      <div className="bg-stone-900 px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {phase === "scanning" && (
          <p className="py-2 text-center text-sm text-stone-300">
            Код прочитается сам. После каждого товара нажмите «Следующий товар».
          </p>
        )}
        {phase === "processing" && (
          <div className="flex items-center justify-center gap-3 py-2 text-sm" role="status">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            <span>
              Код <span className="font-mono">{code}</span> прочитан · ищем товар…
            </span>
          </div>
        )}
        {phase === "result" && res && result && (
          <>
            <ScanResultCard
              key={result.seq}
              result={res}
              dark
              onAction={(action) => {
                action.run();
                onClose();
              }}
            />
            <button
              type="button"
              className="btn mt-3 w-full bg-white py-4 text-base text-ink"
              onClick={next}
            >
              {res.ok ? "Следующий товар" : "Сканировать снова"}
            </button>
          </>
        )}
        {phase === "starting" && <div className="h-10" />}
      </div>
    </div>
  );
}
