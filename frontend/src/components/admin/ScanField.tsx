"use client";

import { useEffect, useRef, useState } from "react";
import { scanFeedback, unlockAudio } from "@/lib/scan-feedback";
import { CameraScanner, type ScanResult } from "./CameraScanner";

export type { ScanResult };

/**
 * Input for a barcode scanner (it types the code and presses Enter, like a keyboard) with a
 * camera button for phones. Scans are handled one by one in order, even when they come fast.
 */
export function ScanField({
  onScan,
  label = "Сканер",
  placeholder = "Отсканируйте штрихкод",
  autoFocus = true,
  compact = false,
}: {
  onScan: (code: string) => Promise<ScanResult>;
  label?: string;
  placeholder?: string;
  autoFocus?: boolean;
  compact?: boolean;
}) {
  const [value, setValue] = useState("");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [camera, setCamera] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());
  // Queued scans run later; they must use the latest handler (it sees the latest state).
  const onScanRef = useRef(onScan);
  useEffect(() => {
    onScanRef.current = onScan;
  });

  const handle = (raw: string) => {
    const code = raw.replace(/\s+/g, "");
    if (!code) return;
    queue.current = queue.current.then(async () => {
      let res: ScanResult;
      try {
        res = await onScanRef.current(code);
      } catch (e) {
        res = { ok: false, text: e instanceof Error ? e.message : String(e) };
      }
      scanFeedback(res.ok);
      setResult(res);
    });
  };

  return (
    <div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          handle(value);
          setValue("");
          inputRef.current?.focus();
        }}
      >
        <label className="min-w-0 flex-1">
          <span className="sr-only">{label}</span>
          <input
            ref={inputRef}
            autoFocus={autoFocus}
            className={compact ? "input py-1.5 text-sm" : "input py-3 text-base"}
            placeholder={placeholder}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoComplete="off"
            enterKeyHint="done"
          />
        </label>
        <button
          type="button"
          className={`btn btn-outline shrink-0 ${compact ? "btn-sm" : ""}`}
          onClick={() => {
            unlockAudio();
            setCamera(true);
          }}
        >
          Камера
        </button>
      </form>
      {result && (
        <p
          className={`mt-1 font-semibold ${compact ? "text-xs" : "text-sm"} ${result.ok ? "text-emerald-700" : "text-red-600"}`}
          aria-live="polite"
        >
          {result.text}
        </p>
      )}
      {camera && (
        <CameraScanner
          onScan={handle}
          result={result}
          onClose={() => {
            setCamera(false);
            inputRef.current?.focus();
          }}
        />
      )}
    </div>
  );
}
