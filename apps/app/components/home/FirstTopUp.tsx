"use client";
import Image from "next/image";
import { Button, Card } from "../ui";

/**
 * Home before the first top-up: the limit is zero because there is no deposit yet, so Send is off
 * and the screen says why, with the one step that changes it. Wording is Axel's call.
 */
export function FirstTopUp({
  onTopUp,
  className = "",
}: {
  onTopUp: () => void;
  className?: string;
}) {
  return (
    <Card className={`overflow-hidden ${className}`}>
      {/* Decoration, so screen readers skip it. */}
      <div aria-hidden="true" className="relative h-[96px] w-full">
        <Image
          src="/art/sand.jpg"
          alt=""
          fill
          sizes="(max-width: 480px) 100vw, 420px"
          className="object-cover object-top"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-card" />
      </div>
      <div className="px-5 pb-4">
        <h2 className="text-[16px] font-semibold tracking-[-0.01em]">Top up to get your limit</h2>
        <p className="mt-1 text-[13.5px] text-muted">
          The money you add sets how much you can spend. Pay on time and you can spend more of it.
        </p>
        <Button size="md" className="mt-3" onClick={onTopUp}>
          Top up
        </Button>
      </div>
    </Card>
  );
}
