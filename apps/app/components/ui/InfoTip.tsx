"use client";
import { Info } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useId, useRef, useState } from "react";
import { EASE_OUT } from "../../lib/ease";

/**
 * A small ⓘ beside a label that explains it on demand, so the screen keeps its short labels and
 * the explanation is one tap away (Axel, 10 Oct). Tap toggles it on a phone; a mouse also opens it
 * on hover. It closes on a tap outside or Escape.
 */
export function InfoTip({ label, children }: { label: string; children: React.ReactNode }) {
  // Hover and tap are kept apart: a mouse hovers it open, then a click must keep it open, not
  // toggle it shut. Tapped open, it stays until a tap outside or Escape.
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
  const open = hovered || pinned;
  const ref = useRef<HTMLSpanElement>(null);
  const id = useId();
  const reduceMotion = useReducedMotion() ?? false;

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) {
        setPinned(false);
        setHovered(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPinned(false);
        setHovered(false);
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Hover only for a mouse: a touch would open on hover and close on the same tap.
  const hover = (next: boolean) => (event: React.PointerEvent) => {
    if (event.pointerType === "mouse") setHovered(next);
  };

  return (
    <span
      ref={ref}
      className="relative inline-flex align-middle"
      onPointerEnter={hover(true)}
      onPointerLeave={hover(false)}
    >
      <button
        type="button"
        aria-label={`About ${label}`}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setPinned((p) => !p || hovered)}
        className="-m-1.5 flex p-1.5 text-faint transition-colors hover:text-muted"
      >
        <Info size={14} strokeWidth={2} aria-hidden="true" />
      </button>
      <AnimatePresence>
        {open ? (
          <motion.span
            id={id}
            role="tooltip"
            initial={{ opacity: 0, y: reduceMotion ? 0 : -4, scale: reduceMotion ? 1 : 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: reduceMotion ? 0 : -4, scale: reduceMotion ? 1 : 0.97 }}
            transition={{ duration: 0.18, ease: EASE_OUT }}
            className="absolute left-[-6px] top-[calc(100%+8px)] z-30 block w-[min(260px,calc(100vw-48px))] origin-top-left rounded-[14px] bg-ink px-3.5 py-2.5 text-left text-[12.5px] font-normal leading-[1.45] tracking-normal text-white shadow-[0_12px_28px_-12px_rgba(0,0,0,.45)]"
          >
            {children}
          </motion.span>
        ) : null}
      </AnimatePresence>
    </span>
  );
}
