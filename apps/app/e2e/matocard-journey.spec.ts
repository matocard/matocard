import { expect, test } from "@playwright/test";
import { connectWallet } from "./support/journey";

/**
 * A new account's first minutes, in a real browser against Monad testnet: the e2e wallet's address
 * has never been verified, so the app must say there is no card yet and offer the next step, and
 * the money screens must refuse politely rather than break. Signed flows (sign-in, top-up, sends)
 * are covered end to end by `lib/matocard/__tests__/live.test.ts`, which can sign.
 */

test("an unverified account sees no card yet and the step that opens one", async ({ page }) => {
  await connectWallet(page);
  await expect(page.getByText("Not issued yet")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Open your card")).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue" })).toBeVisible();
  // Nothing to spend from, so the money actions are not offered.
  await expect(page.getByRole("button", { name: "Send" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Top up" })).toHaveCount(0);
});

test("top up asks for verification first", async ({ page }) => {
  await connectWallet(page);
  await page.goto("/topup");
  await expect(page.getByText("Verify your identity first")).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Go to Home" }).click();
  await expect(page).toHaveURL(/\/home$/);
});

test("settle has nothing to settle for an account that never drew", async ({ page }) => {
  await connectWallet(page);
  await page.goto("/settle");
  await expect(page.getByText("You owe", { exact: true })).toBeVisible();
  await expect(page.getByText("Nothing is owed.")).toBeVisible({ timeout: 20_000 });
});

test("the onboarding tour tells the story in rupiah, AUSD and MON", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Top up what")).toBeVisible();
  await expect(page.getByText("Rp 2.4m")).toBeVisible();
  // The tour's artwork is aria-hidden (decoration), so the marks are found by their alt text.
  for (const alt of ["IDR", "AUSD", "MON"]) {
    await expect(page.locator(`img[alt="${alt}"]`)).toHaveCount(1);
  }
});
