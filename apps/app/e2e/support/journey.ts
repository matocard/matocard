import path from "node:path";
import { expect, type Page } from "@playwright/test";

const EVIDENCE_DIR = path.join("..", "docs", "tests", "linear-STE-44", "screenshots");

/** Capture PR evidence. Opt-in via `E2E_EVIDENCE=1`, so an ordinary run leaves the tree clean. */
export async function shot(page: Page, name: string): Promise<void> {
  if (process.env.E2E_EVIDENCE !== "1") return;
  await page.screenshot({ path: path.join(EVIDENCE_DIR, `${name}.png`) });
}

/** Land in the app with a stubbed wallet connected. The stub signs without a popup. */
export async function connectWallet(page: Page): Promise<void> {
  await page.goto("/");
  // With a session already stored, the landing auto-forwards to /home (STE-43) before the button
  // ever renders: that path is itself proof the fix works. Only click when onboarding is actually
  // shown. `goto` resolves on HTML load, well before hydration flips the landing past its `null`
  // SSR shell, so a one-shot `isVisible()` right after `goto` reads false even when the button is
  // about to appear (no stored session, the common case): race whichever settles first instead.
  const connect = page.getByRole("button", { name: "Connect wallet" });
  const showsButton = await Promise.race([
    connect.waitFor({ state: "visible" }).then(() => true),
    page
      .getByRole("button", { name: "Skip" })
      .waitFor({ state: "visible" })
      .then(() => false),
    page.waitForURL(/\/home$/).then(() => false),
  ]).catch(() => false);

  if (!showsButton && !/\/home$/.test(page.url())) {
    const skip = page.getByRole("button", { name: "Skip" });
    if (await skip.isVisible()) {
      await skip.click();
    }
  }

  if (showsButton) {
    await connect.click();
  } else if (!/\/home$/.test(page.url())) {
    await expect(connect).toBeVisible();
    await connect.click();
  }
  await expect(page).toHaveURL(/\/home$/);
}

/**
 * Assert the desktop Home chrome is on screen and the mobile bottom nav is hidden.
 *
 * Chrome rather than content: the brand, the nav, the card, and that the mobile bar is hidden.
 * Figures belong in the unit tests, which can mock the chain; an e2e that asserts an amount is
 * asserting whatever the shared testnet state happens to hold.
 */
export async function expectDesktopHome(page: Page): Promise<void> {
  await expect(page.getByText("Matocard", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
  await expect(page.getByText("Your card", { exact: true })).toBeVisible();
  // CSS-hidden at lg rather than unmounted, so `toBeHidden` is the right assertion.
  await expect(page.getByRole("navigation", { name: "Main" })).toBeHidden();
}
