/* eslint-disable @next/next/no-img-element -- tiny static icons that must paint the moment
   they appear; next/image defers them. */

/**
 * Every symbol a screen can put a logo against: AUSD is Matocard's money (Agora's dollar on
 * Monad), MON is Monad's own coin (fees, dripped after KYC) and IDR is the rupiah a top-up or
 * cash-out is paid in.
 */
export type TokenSym = "AUSD" | "MON" | "IDR";

const FILE: Record<TokenSym, string> = {
  // Agora's AUSD mark, and Monad's MON token from monad.xyz/brand-page-assets.
  AUSD: "/tokens/ausd.png",
  MON: "/tokens/mon.svg",
  // A currency, not a token: the round Indonesian flag.
  IDR: "/tokens/idr.svg",
};

/** The badge for a symbol; anything unknown gets AUSD rather than a broken image. */
export function badgeForSymbol(symbol: string): TokenSym {
  const bare = symbol.toUpperCase();
  if (bare === "MON") return "MON";
  if (bare === "IDR") return "IDR";
  return "AUSD";
}

/** Circular logo. `object-cover` keeps non-circular source art inside the round badge. */
export function CoinBadge({
  token,
  size = 40,
  className = "",
}: {
  token?: TokenSym;
  size?: number;
  className?: string;
}) {
  const key: TokenSym = token ?? "AUSD";
  return (
    // biome-ignore lint/performance/noImgElement: static asset that must paint the moment the step appears; next/image defers it
    <img
      src={FILE[key]}
      alt={key}
      width={size}
      height={size}
      style={{ width: size, height: size }}
      className={`shrink-0 rounded-full object-cover ${className}`}
    />
  );
}
