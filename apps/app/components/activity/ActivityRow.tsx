import type { ActivityItem } from "../../lib/matocard/activity";

/**
 * What each kind of row is called (the kinds `useMyActivity` emits), worded for someone who has
 * used a debit card and never a blockchain: no chain words in a title. Wording is Axel's call.
 */
const TITLE: Record<string, string> = {
  sent: "Sent",
  settled: "Settled",
  topup: "Top-up",
  "topup-held": "Top-up, on hold",
  "topup-cleared": "Top-up cleared",
  "topup-reversed": "Top-up reversed",
  "topup-pending": "Top-up",
  "settle-pending": "Settlement",
  cashout: "Cash out to bank",
  withdrawn: "Collateral taken out",
  verified: "Identity verified",
  defaulted: "Missed the due date",
};

function humanize(item: ActivityItem): { title: string; description: string } {
  const title = TITLE[item.kind];
  return title ? { title, description: item.detail } : { title: item.detail, description: "" };
}

/** Which of the icons below a kind gets. */
const ICON: Record<string, "out" | "in" | "coin" | "check" | "pause"> = {
  sent: "out",
  cashout: "out",
  withdrawn: "out",
  settled: "in",
  topup: "coin",
  "topup-held": "coin",
  "topup-pending": "coin",
  "settle-pending": "in",
  "topup-reversed": "out",
  "topup-cleared": "check",
  verified: "check",
  defaulted: "pause",
};

function ActivityIcon({ kind }: { kind: string }) {
  const common = {
    width: 17,
    height: 17,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  switch (ICON[kind]) {
    case "in":
      return (
        // biome-ignore lint/a11y/noSvgWithoutTitle: decorative, aria-hidden comes from the spread
        <svg {...common}>
          <path d="M12 3v12" />
          <path d="m7 10 5 5 5-5" />
          <path d="M5 21h14" />
        </svg>
      );
    case "out":
      return (
        // biome-ignore lint/a11y/noSvgWithoutTitle: decorative, aria-hidden comes from the spread
        <svg {...common}>
          <path d="M12 21V9" />
          <path d="m7 14 5-5 5 5" />
          <path d="M5 3h14" />
        </svg>
      );
    case "coin":
      return (
        // biome-ignore lint/a11y/noSvgWithoutTitle: decorative, aria-hidden comes from the spread
        <svg {...common}>
          <path d="M12 3v18" />
          <path d="M17 7.5c0-1.7-2.1-2.8-5-2.8s-5 1.1-5 2.8 2.1 2.8 5 2.8 5 1.1 5 2.8-2.1 2.8-5 2.8-5-1.1-5-2.8" />
        </svg>
      );
    case "pause":
      return (
        // biome-ignore lint/a11y/noSvgWithoutTitle: decorative, aria-hidden comes from the spread
        <svg {...common}>
          <circle cx="12" cy="12" r="8" />
          <path d="M10 9v6" />
          <path d="M14 9v6" />
        </svg>
      );
    case "check":
      return (
        // biome-ignore lint/a11y/noSvgWithoutTitle: decorative, aria-hidden comes from the spread
        <svg {...common}>
          <path d="M20 6 9 17l-5-5" />
        </svg>
      );
    default:
      return (
        // biome-ignore lint/a11y/noSvgWithoutTitle: decorative, aria-hidden comes from the spread
        <svg {...common}>
          <path d="M12 5v14M5 12h14" />
        </svg>
      );
  }
}

export function ActivityRow({
  item,
  first,
  divider = true,
}: {
  item: ActivityItem;
  first: boolean;
  divider?: boolean;
}) {
  const copy = humanize(item);
  const className = `flex items-center gap-[13px] py-3.5 ${first || !divider ? "" : "border-t border-line"}`;

  const body = (
    <>
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-pill text-pill-ink">
        <ActivityIcon kind={item.kind} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 text-[13.5px] font-semibold">{copy.title}</div>
          {item.when && <div className="shrink-0 text-xs font-medium text-muted">{item.when}</div>}
        </div>
        {copy.description && <div className="mt-0.5 text-xs text-muted">{copy.description}</div>}
      </div>
    </>
  );

  // On-chain rows carry `href`; fixture rows do not and stay plain divs. The anchor inherits colour
  // and carries no underline, so a row that links looks exactly like a row that does not.
  return item.href ? (
    <a
      href={item.href}
      target="_blank"
      rel="noreferrer"
      className={`${className} text-inherit no-underline`}
    >
      {body}
    </a>
  ) : (
    <div className={className}>{body}</div>
  );
}
