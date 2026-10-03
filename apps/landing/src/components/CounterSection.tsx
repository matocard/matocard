import { useEffect, useState } from "react";
import { useInViewAnimation } from "../hooks/useInViewAnimation";
import { CurvedDivider } from "./CurvedDivider";

// Served from public/, sized to the 1080px box it plays in.
const GLOBE_VIDEO = "/counter.mp4";

const STATS: { value: number; suffix: string; description: string }[] = [
  { value: 1, suffix: "", description: "Second or less for money you send home to arrive" },
  { value: 30, suffix: "", description: "Days to settle, the same every time, no interest" },
  {
    value: 0,
    suffix: "",
    description: "Credit history you need to start. One identity check is enough",
  },
];

/** Ease-out cubic. Fast at the start, so the number feels like it lands. */
function useCountUp(target: number, active: boolean, duration = 1000) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!active) return;
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      setValue(Math.round(target * (1 - (1 - progress) ** 3)));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, active, duration]);

  return value;
}

function Stat({ value, suffix, description }: (typeof STATS)[number] & { active: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      <span className="text-[40px] font-light leading-[0.9] tracking-[-0.03em] text-[#18161B] md:text-[68px]">
        {value}
        <span className="text-[#18161B]/40">{suffix}</span>
      </span>
      <p className="text-base leading-snug text-[#18161B]/50 md:text-lg">{description}</p>
    </div>
  );
}

function AnimatedStat({ entry, active }: { entry: (typeof STATS)[number]; active: boolean }) {
  const value = useCountUp(entry.value, active);
  return <Stat {...entry} value={value} active={active} />;
}

export function CounterSection() {
  const { ref, isInView } = useInViewAnimation<HTMLElement>();
  const headline = useCountUp(12400, isInView, 1400);

  return (
    <section ref={ref} className="overflow-hidden pt-[130px] md:pt-[200px]">
      <div className="mx-auto flex max-w-[1260px] flex-col items-center gap-[60px] px-6 text-center">
        <div className="flex max-w-[500px] flex-col items-center gap-5">
          <span className="rounded-full border border-[#18161B]/10 bg-white px-4 py-2 text-[13px] text-[#18161B]/60">
            Credit that grows with you
          </span>

          <h2
            className="font-light text-[#18161B]"
            style={{
              fontSize: "clamp(2.1rem, 6vw, 4.25rem)",
              lineHeight: 0.98,
              letterSpacing: "-0.03em",
            }}
          >
            No history needed. Pay on time and your limit rises
          </h2>

          <span className="mt-2 text-[60px] font-light leading-none tracking-[-0.03em] text-[#18161B] md:text-[100px] lg:text-[120px]">
            {headline.toLocaleString("en-US")}
            <span className="text-[#18161B]/40">+</span>
          </span>

          <p className="text-base text-[#18161B]/50 md:text-lg">Payments made without a sale</p>
        </div>

        {/* The cloud overlay the reference layers on top of this is a dead URL
            (401), so the video carries the section on its own. */}
        <div className="relative w-full max-w-[1080px]">
          <div className="h-[280px] overflow-hidden md:h-[440px]">
            <video
              ref={(el) => {
                if (el) el.muted = true;
              }}
              className="h-[500px] w-full object-cover md:h-[800px]"
              style={{ mixBlendMode: "darken" }}
              autoPlay
              loop
              muted
              playsInline
            >
              <source src={GLOBE_VIDEO} type="video/mp4" />
            </video>
          </div>
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 h-32"
            style={{ background: "linear-gradient(to bottom, transparent, #F4F0ED)" }}
          />
        </div>

        <div className="grid w-full max-w-[840px] grid-cols-1 gap-8 text-left sm:grid-cols-3 md:gap-[50px]">
          {STATS.map((entry) => (
            <AnimatedStat key={entry.description} entry={entry} active={isInView} />
          ))}
        </div>
      </div>

      {/* Room under the figures so they are not pinned to the seam, then the
          curve into the white section below. */}
      <div className="h-[100px] md:h-[160px]" />
      <CurvedDivider fill="#ffffff" />
    </section>
  );
}
