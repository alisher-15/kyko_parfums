"use client";

import { useEffect, useRef, type RefObject } from "react";

// A barcode scanner "types" a whole code in a few milliseconds per key and presses Enter;
// a person needs far more than this between keys.
const MAX_KEY_GAP_MS = 40;
// Some scanners pause a little before the final Enter.
const MAX_ENTER_GAP_MS = 150;
const MIN_LENGTH = 4;

type TextField = HTMLInputElement | HTMLTextAreaElement;

const NOT_TEXT = new Set(["checkbox", "radio", "button", "submit", "reset", "file", "range", "color"]);

function textField(el: Element | null): TextField | null {
  if (el instanceof HTMLTextAreaElement) return el;
  if (el instanceof HTMLInputElement && !NOT_TEXT.has(el.type)) return el;
  return null;
}

/** The character of the physical key, so a Russian layout does not turn letters into Cyrillic. */
function keyChar(e: KeyboardEvent): string | null {
  const letter = /^Key([A-Z])$/.exec(e.code);
  if (letter) {
    const upper = e.shiftKey !== e.getModifierState("CapsLock");
    return upper ? letter[1] : letter[1].toLowerCase();
  }
  const digit = /^(?:Digit|Numpad)([0-9])$/.exec(e.code);
  if (digit) return digit[1];
  return e.key.length === 1 ? e.key : null;
}

/** Put a field back to the value it had before the scanner typed into it (React sees it). */
function restore(field: TextField, value: string) {
  const proto = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(field, value);
  field.dispatchEvent(new Event("input", { bubbles: true }));
}

/**
 * Catch a barcode scanner wherever the cursor is. A burst of very fast keys ending with Enter is
 * a scan: whatever field it landed in (a quantity, a price, a search box) gets its old value
 * back, the Enter does not reach the page, and `onScan` gets the code. Scans typed into
 * `ownInput` (the page's scan field) are left to that field.
 */
export function useScannerCapture(
  onScan: (code: string) => void,
  { enabled = true, ownInput }: { enabled?: boolean; ownInput?: RefObject<HTMLInputElement | null> },
) {
  const handler = useRef(onScan);
  useEffect(() => {
    handler.current = onScan;
  });

  useEffect(() => {
    if (!enabled) return;
    let buffer = "";
    let last = 0;
    let field: TextField | null = null;
    let before = "";
    const reset = () => {
      buffer = "";
      field = null;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (["Shift", "CapsLock"].includes(e.key)) return; // scanners hold Shift for capitals
      const now = performance.now();
      const gap = now - last;
      last = now;
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return reset();
      if (ownInput?.current && document.activeElement === ownInput.current) return reset();

      if (e.key === "Enter") {
        if (buffer.length >= MIN_LENGTH && gap <= MAX_ENTER_GAP_MS) {
          e.preventDefault();
          e.stopPropagation();
          if (field) restore(field, before);
          const code = buffer;
          reset();
          handler.current(code);
          return;
        }
        return reset();
      }

      const ch = keyChar(e);
      if (ch === null) return reset();
      if (buffer && gap > MAX_KEY_GAP_MS) reset(); // a person typing: start over
      if (!buffer) {
        field = textField(document.activeElement);
        before = field?.value ?? "";
      }
      buffer += ch;
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [enabled, ownInput]);
}
