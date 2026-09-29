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

/** One slide at a time: swipe on phones, arrows on computers, dots to jump. */
export function Slider({ label, slides }: { label: string; slides: ReactNode[] }) {
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const count = slides.length;

  const go = (i: number) => {
    const el = track.current;
    if (el) el.scrollTo({ left: ((i + count) % count) * el.clientWidth, behavior: "smooth" });
  };

  const onScroll = () => {
    const el = track.current;
    if (el && el.clientWidth > 0) setIndex(Math.round(el.scrollLeft / el.clientWidth));
  };

  return (
    <div className="relative" role="region" aria-label={label}>
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
          {/* On the banner itself, white on a dark pill: visible on any picture. */}
          <div className="absolute right-4 bottom-4 z-10 flex items-center rounded-full bg-black/40 px-1.5 py-1 backdrop-blur-sm md:right-6 md:bottom-6">
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
                    i === index ? "w-6 bg-white" : "w-2 bg-white/50 hover:bg-white/80"
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
