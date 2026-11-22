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
