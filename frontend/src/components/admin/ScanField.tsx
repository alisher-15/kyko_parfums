"use client";

import { useEffect, useRef, useState } from "react";
import { normalizeScan } from "@/lib/scan-code";
import { scanFeedback, unlockAudio } from "@/lib/scan-feedback";
import { useMedia } from "@/lib/use-media";
import { useScannerCapture } from "@/lib/use-scanner-capture";
import { CameraScanner } from "./CameraScanner";
import { ScanResultCard, type ScanResult } from "./ScanResultCard";

export type { ScanResult };

/**
 * Scanning with a barcode scanner (it types the code and presses Enter, like a keyboard) or the
 * phone camera. On phones the camera button comes first and the field is for typing a code by
 * hand. The last scan is shown under the field with −/+ and undo. Scans are handled one by one.
 *
 * The main (non-compact) field also catches a scanner wherever the cursor is, and codes typed
 * in the Russian keyboard layout are read as Latin.
 */
export function ScanField({
  onScan,
  placeholder = "Отсканируйте штрихкод",
  cameraTitle,
  autoFocus = true,
  compact = false,
  single = false,
}: {
  onScan: (code: string) => Promise<ScanResult>;
  placeholder?: string;
  /** Shown at the top of the camera screen, e.g. «Приёмка № 12». */
  cameraTitle?: string;
  autoFocus?: boolean;
  /** Small inline variant (a barcode list in the product card). */
  compact?: boolean;
  /** The camera closes after the first successful scan. */
  single?: boolean;
}) {
  const phone = useMedia("(pointer: coarse)");
  const [value, setValue] = useState("");
  const [result, setResult] = useState<{ seq: number; value: ScanResult } | null>(null);
  const [camera, setCamera] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const seq = useRef(0);
  // Queued scans run later; they must use the latest handler (it sees the latest state).
  const onScanRef = useRef(onScan);
  useEffect(() => {
    onScanRef.current = onScan;
  });

  /** Run a scan after the ones already queued; the result is also shown under the field. */
  const run = (raw: string): Promise<ScanResult> => {
    const code = normalizeScan(raw);
    const next = queue.current.then(async () => {
      let res: ScanResult;
      try {
        res = code ? await onScanRef.current(code) : { ok: false, title: "Пустой код" };
      } catch (e) {
        res = { ok: false, title: e instanceof Error ? e.message : String(e) };
      }
      seq.current += 1;
      setResult({ seq: seq.current, value: res });
      return res;
    });
    queue.current = next;
    return next;
  };

  useScannerCapture(
    (code) => {
      void run(code).then((res) => scanFeedback(res.ok));
      if (!phone) inputRef.current?.focus(); // the next scans go straight to the field
    },
    { enabled: !compact && !camera, ownInput: inputRef },
  );

  const openCamera = () => {
    unlockAudio(); // iPhone plays sounds only after a tap
    setCamera(true);
  };

  const cameraFirst = phone && !compact;
  const input = (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const code = value;
        setValue("");
        if (!cameraFirst) inputRef.current?.focus();
        void run(code).then((res) => scanFeedback(res.ok));
      }}
    >
      <input
        ref={inputRef}
        autoFocus={autoFocus && !phone}
        className={compact ? "input py-1.5 text-sm" : cameraFirst ? "input" : "input py-3 text-base"}
        placeholder={cameraFirst ? "или введите код вручную" : placeholder}
        aria-label={placeholder}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        autoComplete="off"
        inputMode={cameraFirst ? "numeric" : undefined}
        enterKeyHint="done"
      />
      {cameraFirst ? (
        <button type="submit" className="btn btn-outline shrink-0" disabled={!value.trim()}>
          OK
        </button>
      ) : (
        <button
          type="button"
          className={`btn btn-outline shrink-0 ${compact ? "btn-sm" : ""}`}
          onClick={openCamera}
        >
          Камера
        </button>
      )}
    </form>
  );

  return (
    <div className="space-y-2">
      {cameraFirst && (
        <button type="button" className="btn btn-primary w-full py-4 text-base" onClick={openCamera}>
          Сканировать камерой
        </button>
      )}
      {input}
      {result && (
        <ScanResultCard
          key={result.seq}
          result={result.value}
          compact={compact}
          onAction={(action) => action.run()}
        />
      )}
      {camera && (
        <CameraScanner
          title={cameraTitle}
          single={single}
          onScan={run}
          onClose={() => {
            setCamera(false);
            if (!phone) inputRef.current?.focus();
          }}
        />
      )}
    </div>
  );
}
