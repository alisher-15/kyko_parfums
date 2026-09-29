"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "./icons";

const ARROW =
  "absolute top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-white shadow-md hover:border-ink md:flex";

/** A row of cards that scrolls sideways: swipe on phones, arrows on computers. */
export function Rail({ label, children }: { label: string; children: ReactNode }) {
  const track = useRef<HTMLDivElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  const measure = () => {
    const el = track.current;
    if (!el) return;
    setAtStart(el.scrollLeft <= 4);
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 4);
  };

  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const page = (direction: number) => {
    const el = track.current;
    if (el) el.scrollBy({ left: direction * el.clientWidth * 0.9, behavior: "smooth" });
  };

  return (
    <div className="relative">
      <div
        ref={track}
        onScroll={measure}
        role="region"
        aria-label={label}
        className="rail -mx-4 flex snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:scroll-px-6 sm:px-6"
      >
        {children}
      </div>
      {!atStart && (
        <button type="button" className={`${ARROW} -left-3`} onClick={() => page(-1)} aria-label="Назад">
          <ChevronLeftIcon />
        </button>
      )}
      {!atEnd && (
        <button type="button" className={`${ARROW} -right-3`} onClick={() => page(1)} aria-label="Дальше">
          <ChevronRightIcon />
        </button>
      )}
    </div>
  );
}

/** Width of one card in a Rail: 2 and a bit on phones, 3 on tablets, 4 on computers. */
export const RAIL_ITEM = "w-[44%] shrink-0 snap-start sm:w-[31%] md:w-[calc((100%-3rem)/4)]";

const AUTOPLAY_MS = 5000;

/** One slide at a time: swipe on phones, arrows on computers, dots to jump; turns by itself. */
export function Slider({ label, slides }: { label: string; slides: ReactNode[] }) {
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  // The pointer is on it (a touch counts until the finger is lifted) or the keyboard is in it.
  const [held, setHeld] = useState(false);
  const count = slides.length;

  const go = (i: number) => {
    const el = track.current;
    if (el) el.scrollTo({ left: ((i + count) % count) * el.clientWidth, behavior: "smooth" });
  };

  // Like an ad: the next banner every AUTOPLAY_MS, the last one followed by the first. It waits
  // while the visitor holds or reads it, in a hidden tab, and for those who asked the system to
  // reduce motion. Every change of the banner, by hand too, gives the new one the full time.
  useEffect(() => {
    if (count < 2 || held || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setTimeout(() => {
      const el = track.current;
      if (el && document.visibilityState === "visible") {
        el.scrollTo({ left: ((index + 1) % count) * el.clientWidth, behavior: "smooth" });
      }
    }, AUTOPLAY_MS);
    return () => window.clearTimeout(timer);
  }, [count, held, index]);

  const onScroll = () => {
    const el = track.current;
    if (el && el.clientWidth > 0) setIndex(Math.round(el.scrollLeft / el.clientWidth));
  };

  return (
    <div
      className="relative"
      role="region"
      aria-label={label}
      onPointerEnter={() => setHeld(true)}
      onPointerLeave={() => setHeld(false)}
      onFocus={(e) => e.target.matches(":focus-visible") && setHeld(true)}
      onBlur={() => setHeld(false)}
    >
      <div ref={track} onScroll={onScroll} className="rail flex snap-x snap-mandatory overflow-x-auto rounded-2xl">
        {slides.map((slide, i) => (
          <div key={i} className="w-full shrink-0 snap-start">
            {slide}
          </div>
        ))}
      </div>
      {count > 1 && (
        <>
          <button type="button" className={`${ARROW} left-3`} onClick={() => go(index - 1)} aria-label="Предыдущий баннер">
            <ChevronLeftIcon />
          </button>
          <button type="button" className={`${ARROW} right-3`} onClick={() => go(index + 1)} aria-label="Следующий баннер">
            <ChevronRightIcon />
          </button>
          {/* Phones: under the banner, dark, so they don't cover a small picture. Computers: on
              the banner, white on a dark pill, visible on any picture. */}
          <div className="mt-2 flex items-center justify-center md:absolute md:right-6 md:bottom-6 md:z-10 md:mt-0 md:rounded-full md:bg-black/40 md:px-1.5 md:py-1 md:backdrop-blur-sm">
            {slides.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => go(i)}
                aria-label={`Баннер ${i + 1}`}
                aria-current={i === index}
                className="flex h-5 items-center px-1"
              >
                <span
                  className={`block h-2 rounded-full transition-all ${
                    i === index
                      ? "w-6 bg-ink md:bg-white"
                      : "w-2 bg-stone-400 hover:bg-stone-600 md:bg-white/50 md:hover:bg-white/80"
                  }`}
                />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
