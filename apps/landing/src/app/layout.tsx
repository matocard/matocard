import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "../index.css";

export const metadata: Metadata = {
  title: "Matocard",
  description: "A card sized by what you have repaid, not what you hold. Built on Creditcoin.",
  // Transparent mark: dark on a light tab bar, white on a dark one, where the dark mark vanishes.
  icons: {
    icon: [
      { url: "/matocard-logo.png", media: "(prefers-color-scheme: light)" },
      { url: "/matocard-logo-white.png", media: "(prefers-color-scheme: dark)" },
    ],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
